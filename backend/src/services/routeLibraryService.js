import { nanoid } from "nanoid";
import { z } from "zod";

/**
 * The route and city library (ADR 048, docs/SUPPLIER_OPERATIONS.md). A route is
 * a named circuit (Lucknow – Ayodhya – Varanasi): cities and nights, day-by-day
 * text, inclusions and exclusions, and per day the package-library entries
 * (ADR 047) it uses. The admin keeps the shared routes (supplier_id NULL); a
 * supplier keeps its own. A city holds a description and the text of a day
 * spent there. Nothing here is priced: using a route copies it into a quotation,
 * which the server prices from the supplier's own rate sheets.
 */

const routeError = (message, status = 400, code = "INVALID_ROUTE") => Object.assign(new Error(message), { status, code });
const text = (max) => z.string().trim().max(max).optional().nullable();
const items = z.array(z.string().trim().min(1).max(300)).max(40).default([]);

export const routeSchema = z.object({
  region: text(80),
  name: z.string().trim().min(2).max(160),
  description: text(2000),
  legs: z.array(z.object({ city: z.string().trim().min(1).max(120), nights: z.number().int().min(0).max(60) }).strict()).min(1).max(20),
  days: z.array(z.object({
    dayNumber: z.number().int().min(1).max(60),
    title: text(160),
    description: text(4000),
    itemIds: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  }).strict()).max(60).default([]),
  inclusions: items,
  exclusions: items,
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).strict();

export const citySchema = z.object({
  region: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(120),
  description: text(2000),
  dayTitle: text(160),
  dayDescription: text(4000),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).strict();

const parse = (value, fallback = []) => {
  try { const parsed = JSON.parse(value || "null"); return Array.isArray(parsed) ? parsed : fallback; } catch { return fallback; }
};

function routeView(row) {
  const legs = parse(row.legs);
  const nights = legs.reduce((sum, leg) => sum + Number(leg.nights || 0), 0);
  return {
    id: row.id, own: Boolean(row.supplier_id), region: row.region || null, name: row.name, description: row.description || null,
    legs, days: parse(row.days).map((day) => ({ ...day, itemIds: Array.isArray(day.itemIds) ? day.itemIds : [] })),
    inclusions: parse(row.inclusions), exclusions: parse(row.exclusions),
    nights, sortOrder: Number(row.sort_order || 0), status: row.status, updatedAt: row.updated_at,
  };
}

function cityView(row) {
  return {
    id: row.id, region: row.region, name: row.name, description: row.description || null,
    dayTitle: row.day_title || null, dayDescription: row.day_description || null, sortOrder: Number(row.sort_order || 0), status: row.status,
  };
}

// Every day number inside the trip, once, and the library entries it names must exist.
function checkRoute(db, route) {
  const nights = route.legs.reduce((sum, leg) => sum + leg.nights, 0);
  const seen = new Set();
  for (const day of route.days) {
    if (day.dayNumber > nights + 1) throw routeError(`Day ${day.dayNumber} is after the trip's last day (${nights + 1})`, 400, "DAY_OUTSIDE_ROUTE");
    if (seen.has(day.dayNumber)) throw routeError(`Day ${day.dayNumber} is listed twice`, 400, "DUPLICATE_DAY");
    seen.add(day.dayNumber);
  }
  const ids = [...new Set(route.days.flatMap((day) => day.itemIds))];
  if (ids.length) {
    const found = new Set(db.prepare(`SELECT id FROM package_library_items WHERE id IN (${ids.map(() => "?").join(", ")})`).all(...ids).map((row) => row.id));
    const missing = ids.find((id) => !found.has(id));
    if (missing) throw routeError("A day names a library entry that doesn't exist", 400, "LIBRARY_ITEM_NOT_FOUND");
  }
}

function writeRoute(db, supplierId, input, routeId) {
  const route = routeSchema.parse(input);
  checkRoute(db, route);
  const values = [route.region || null, route.name, route.description || null, JSON.stringify(route.legs),
    JSON.stringify([...route.days].sort((a, b) => a.dayNumber - b.dayNumber)), JSON.stringify(route.inclusions), JSON.stringify(route.exclusions), route.sortOrder, route.status];
  if (routeId) {
    const existing = supplierId
      ? db.prepare("SELECT id FROM package_routes WHERE id = ? AND supplier_id = ?").get(routeId, supplierId)
      : db.prepare("SELECT id FROM package_routes WHERE id = ? AND supplier_id IS NULL").get(routeId);
    if (!existing) throw routeError("Route not found", 404, "ROUTE_NOT_FOUND");
    db.prepare(`UPDATE package_routes SET region = ?, name = ?, description = ?, legs = ?, days = ?, inclusions = ?, exclusions = ?, sort_order = ?, status = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, routeId);
  } else {
    routeId = `proute_${nanoid(12)}`;
    db.prepare(`INSERT INTO package_routes (id, supplier_id, region, name, description, legs, days, inclusions, exclusions, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(routeId, supplierId, ...values);
  }
  return routeView(db.prepare("SELECT * FROM package_routes WHERE id = ?").get(routeId));
}

const ROUTE_ORDER = "ORDER BY LOWER(COALESCE(region, '')), sort_order, LOWER(name)";

/** Admin: every shared route and city, hidden ones included. */
export function listSharedLibrary(db) {
  return {
    routes: db.prepare(`SELECT * FROM package_routes WHERE supplier_id IS NULL ${ROUTE_ORDER}`).all().map(routeView),
    cities: db.prepare("SELECT * FROM package_cities ORDER BY LOWER(region), sort_order, LOWER(name)").all().map(cityView),
  };
}
export const saveSharedRoute = (db, input, routeId = null) => writeRoute(db, null, input, routeId);

export function saveCity(db, input, cityId = null) {
  const city = citySchema.parse(input);
  const clash = db.prepare("SELECT id FROM package_cities WHERE LOWER(name) = LOWER(?)").get(city.name);
  if (clash && clash.id !== cityId) throw routeError(`${city.name} is already in the library`, 409, "CITY_EXISTS");
  const values = [city.region, city.name, city.description || null, city.dayTitle || null, city.dayDescription || null, city.sortOrder, city.status];
  if (cityId) {
    if (!db.prepare("SELECT id FROM package_cities WHERE id = ?").get(cityId)) throw routeError("City not found", 404, "CITY_NOT_FOUND");
    db.prepare(`UPDATE package_cities SET region = ?, name = ?, description = ?, day_title = ?, day_description = ?, sort_order = ?, status = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, cityId);
  } else {
    cityId = `pcity_${nanoid(12)}`;
    db.prepare(`INSERT INTO package_cities (id, region, name, description, day_title, day_description, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(cityId, ...values);
  }
  return cityView(db.prepare("SELECT * FROM package_cities WHERE id = ?").get(cityId));
}

/**
 * What a supplier builds from: its own routes first, then the live shared ones,
 * and the live cities. Each route day's library entries say which of the
 * supplier's services they are (serviceId), or null when not on its rate sheet.
 */
export function supplierRouteLibrary(db, supplierId) {
  const services = new Map(db.prepare("SELECT id, library_item_id FROM supplier_services WHERE supplier_id = ? AND status = 'ACTIVE' AND library_item_id IS NOT NULL")
    .all(supplierId).map((row) => [row.library_item_id, row.id]));
  const names = new Map(db.prepare("SELECT id, name, kind FROM package_library_items").all().map((row) => [row.id, row]));
  const withItems = (route) => ({
    ...route,
    days: route.days.map((day) => ({
      ...day,
      items: day.itemIds.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id).name, kind: names.get(id).kind, serviceId: services.get(id) || null })),
    })),
  });
  const own = db.prepare(`SELECT * FROM package_routes WHERE supplier_id = ? ${ROUTE_ORDER}`).all(supplierId);
  const shared = db.prepare(`SELECT * FROM package_routes WHERE supplier_id IS NULL AND status = 'ACTIVE' ${ROUTE_ORDER}`).all();
  return {
    routes: [...own, ...shared].map(routeView).map(withItems),
    cities: db.prepare("SELECT * FROM package_cities WHERE status = 'ACTIVE' ORDER BY LOWER(region), sort_order, LOWER(name)").all().map(cityView),
  };
}

export const saveSupplierRoute = (db, supplierId, input, routeId = null) => writeRoute(db, supplierId, input, routeId);

/** A supplier's own route can be deleted; shared ones can't be touched. */
export function deleteSupplierRoute(db, supplierId, routeId) {
  const result = db.prepare("DELETE FROM package_routes WHERE id = ? AND supplier_id = ?").run(routeId, supplierId);
  if (!result.changes) throw routeError("Route not found", 404, "ROUTE_NOT_FOUND");
  return { deleted: routeId };
}
