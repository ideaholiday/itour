import { nanoid } from "nanoid";
import { z } from "zod";
import { isTransport, SERVICE_KINDS } from "./supplierRateSheetService.js";

/**
 * The package library (ADR 047, docs/SUPPLIER_OPERATIONS.md): ready-made
 * transfers, sightseeing and activities for popular destinations, kept by the
 * admin. A supplier adds entries to its own rate sheet (ADR 042), where each
 * becomes an ordinary service with one season of the library's example prices,
 * which the supplier checks and edits. Quotations never price from the library.
 *
 *   Cars: an example price per vehicle for Sedan, Innova and Tempo Traveller,
 *     matched by name to the supplier's cab types, which are added when missing.
 *   Activities: an example price per adult and child.
 */

// The library's standard cabs: name, seats, and the words that match a supplier's own cab type.
export const LIBRARY_CABS = Object.freeze([
  { key: "sedan", column: "sedan_inr", field: "sedanInr", name: "Sedan", seats: 4, match: ["sedan", "dzire", "etios"] },
  { key: "innova", column: "innova_inr", field: "innovaInr", name: "Innova", seats: 6, match: ["innova", "suv", "ertiga"] },
  { key: "tempo", column: "tempo_inr", field: "tempoInr", name: "Tempo Traveller", seats: 12, match: ["tempo"] },
]);
export const LIBRARY_SEASON_DAYS = 365;

const libraryError = (message, status = 400, code = "INVALID_LIBRARY_ITEM") => Object.assign(new Error(message), { status, code });
const text = (max) => z.string().trim().max(max).optional().nullable();
const price = z.number().int().min(0).max(10_000_000).optional().nullable();

export const libraryItemSchema = z.object({
  region: z.string().trim().min(2).max(80),
  kind: z.enum(SERVICE_KINDS),
  name: z.string().trim().min(2).max(160),
  city: text(100),
  fromPlace: text(160),
  toPlace: text(160),
  distanceKm: z.number().int().min(1).max(20_000).optional().nullable(),
  durationHours: z.number().min(0).max(240).optional().nullable(),
  dayTitle: text(160),
  dayDescription: text(2000),
  sedanInr: price, innovaInr: price, tempoInr: price,
  adultInr: price, childInr: price,
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
}).strict();

export const libraryImportSchema = z.object({
  itemIds: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
}).strict();

function itemView(row) {
  return {
    id: row.id, region: row.region, kind: row.kind, name: row.name, city: row.city || null,
    fromPlace: row.from_place || null, toPlace: row.to_place || null, distanceKm: row.distance_km ?? null, durationHours: row.duration_hours ?? null,
    dayTitle: row.day_title || null, dayDescription: row.day_description || null,
    sedanInr: row.sedan_inr ?? null, innovaInr: row.innova_inr ?? null, tempoInr: row.tempo_inr ?? null,
    adultInr: row.adult_inr ?? null, childInr: row.child_inr ?? null,
    sortOrder: Number(row.sort_order || 0), status: row.status,
  };
}

const regionsOf = (items) => [...new Set(items.map((item) => item.region))];

/** Every entry, hidden ones included, for the admin. */
export function listLibraryItems(db) {
  const items = db.prepare("SELECT * FROM package_library_items ORDER BY LOWER(region), sort_order, LOWER(name)").all().map(itemView);
  return { regions: regionsOf(items), items };
}

/** The live entries for a supplier, each marked when it is already on the supplier's rate sheet. */
export function supplierLibrary(db, supplierId) {
  const added = new Set(db.prepare("SELECT library_item_id FROM supplier_services WHERE supplier_id = ? AND library_item_id IS NOT NULL").all(supplierId).map((row) => row.library_item_id));
  const items = db.prepare("SELECT * FROM package_library_items WHERE status = 'ACTIVE' ORDER BY LOWER(region), sort_order, LOWER(name)").all()
    .map((row) => ({ ...itemView(row), added: added.has(row.id) }));
  return { regions: regionsOf(items), items };
}

function checkPrices(item) {
  if (isTransport(item.kind)) {
    if (!LIBRARY_CABS.some((cab) => item[cab.field] != null)) throw libraryError("Give an example price for at least one cab", 400, "PRICE_REQUIRED");
  } else if (item.adultInr == null) {
    throw libraryError("Give an example adult price", 400, "PRICE_REQUIRED");
  }
}

export function saveLibraryItem(db, input, itemId = null) {
  const item = libraryItemSchema.parse(input);
  checkPrices(item);
  const car = isTransport(item.kind);
  const values = [item.region, item.kind, item.name, item.city || null, item.kind === "TRANSFER" ? item.fromPlace || null : null, item.kind === "TRANSFER" ? item.toPlace || null : null,
    car ? item.distanceKm ?? null : null, item.durationHours ?? null, item.dayTitle || null, item.dayDescription || null,
    car ? item.sedanInr ?? null : null, car ? item.innovaInr ?? null : null, car ? item.tempoInr ?? null : null,
    car ? null : item.adultInr ?? null, car ? null : item.childInr ?? 0, item.sortOrder, item.status];
  if (itemId) {
    if (!db.prepare("SELECT id FROM package_library_items WHERE id = ?").get(itemId)) throw libraryError("Library entry not found", 404, "LIBRARY_ITEM_NOT_FOUND");
    db.prepare(`UPDATE package_library_items SET region = ?, kind = ?, name = ?, city = ?, from_place = ?, to_place = ?, distance_km = ?, duration_hours = ?,
      day_title = ?, day_description = ?, sedan_inr = ?, innova_inr = ?, tempo_inr = ?, adult_inr = ?, child_inr = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`).run(...values, itemId);
  } else {
    itemId = `plib_${nanoid(12)}`;
    db.prepare(`INSERT INTO package_library_items (id, region, kind, name, city, from_place, to_place, distance_km, duration_hours, day_title, day_description,
      sedan_inr, innova_inr, tempo_inr, adult_inr, child_inr, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(itemId, ...values);
  }
  return itemView(db.prepare("SELECT * FROM package_library_items WHERE id = ?").get(itemId));
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** The supplier's cab type for a library cab: one whose name matches, else a new one. */
function supplierCab(db, supplierId, cab, created) {
  const cabs = db.prepare("SELECT id, name FROM supplier_cab_types WHERE supplier_id = ? AND status = 'ACTIVE' ORDER BY seats, created_at").all(supplierId);
  const found = cabs.find((row) => cab.match.some((word) => row.name.toLowerCase().includes(word)));
  if (found) return found.id;
  const id = `cab_${nanoid(12)}`;
  db.prepare("INSERT INTO supplier_cab_types (id, supplier_id, name, seats, status) VALUES (?, ?, ?, ?, 'ACTIVE')").run(id, supplierId, cab.name, cab.seats);
  created.push(cab.name);
  return id;
}

/**
 * Adds library entries to the supplier's rate sheet: one service each, with a
 * season from today for a year at the example prices. Entries already added
 * or hidden by the admin are skipped. All or nothing.
 */
export function importLibraryItems(db, supplierId, input, { today = indiaToday() } = {}) {
  const { itemIds } = libraryImportSchema.parse(input);
  const ids = [...new Set(itemIds)];
  const validTo = addDays(today, LIBRARY_SEASON_DAYS - 1);
  return db.transaction(() => {
    const added = [];
    const skipped = [];
    const cabsAdded = [];
    for (const id of ids) {
      const row = db.prepare("SELECT * FROM package_library_items WHERE id = ? AND status = 'ACTIVE'").get(id);
      if (!row) throw libraryError("Library entry not found", 404, "LIBRARY_ITEM_NOT_FOUND");
      if (db.prepare("SELECT 1 FROM supplier_services WHERE supplier_id = ? AND library_item_id = ?").get(supplierId, id)) { skipped.push(row.name); continue; }
      const serviceId = `svc_${nanoid(12)}`;
      db.prepare(`INSERT INTO supplier_services (id, supplier_id, kind, name, city, from_place, to_place, start_time, duration_hours, closed_weekdays,
        day_title, day_description, status, pricing, distance_km, library_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, 'ACTIVE', 'FIXED', ?, ?)`)
        .run(serviceId, supplierId, row.kind, row.name, row.city, row.from_place, row.to_place, row.duration_hours, row.day_title, row.day_description,
          isTransport(row.kind) ? row.distance_km : null, row.id);
      const insertRate = db.prepare(`INSERT INTO supplier_service_rates (id, service_id, cab_type_id, valid_from, valid_to, vehicle_inr, adult_inr, child_inr)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      if (isTransport(row.kind)) {
        for (const cab of LIBRARY_CABS) {
          if (row[cab.column] == null) continue;
          insertRate.run(`srt_${nanoid(12)}`, serviceId, supplierCab(db, supplierId, cab, cabsAdded), today, validTo, row[cab.column], null, 0);
        }
      } else {
        insertRate.run(`srt_${nanoid(12)}`, serviceId, null, today, validTo, null, row.adult_inr, row.child_inr ?? 0);
      }
      added.push(row.name);
    }
    return { added, skipped, cabTypesAdded: cabsAdded, validFrom: today, validTo };
  })();
}
