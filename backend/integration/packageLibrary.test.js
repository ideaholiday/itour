import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

// The package library (ADR 047): admin-kept services a supplier adds to its rate sheet.

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";
const ADMIN = { email: "library.admin@example.test", password: "Integration@Admin2026" };
const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function supplierToken(db) {
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY created_at LIMIT 1").get();
  let owner = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!owner) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_library_owner', 'Owner', ?, 'x', 'SUPPLIER')").run(supplier.email);
    owner = db.prepare("SELECT * FROM users WHERE id = 'usr_library_owner'").get();
  }
  return { supplier, token: jwt.sign({ id: owner.id, email: owner.email, role: "SUPPLIER" }, JWT_SECRET) };
}

test("suppliers add library entries to their rate sheet at example prices, once, and quotations price from them", async (t) => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const { supplier, token } = supplierToken(db);
  const call = (path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${supplier.id}${path}`, { token, ...options });

  // The starter library covers the popular destinations.
  const library = await call("/package-library");
  assert.equal(library.response.status, 200, JSON.stringify(library.data));
  assert.deepEqual(library.data.regions, ["Goa", "Golden Triangle", "Himachal Pradesh", "Jammu & Kashmir", "Kerala", "Leh Ladakh", "Rajasthan", "Uttar Pradesh", "Uttarakhand"]);
  assert.ok(library.data.items.length >= 80);
  assert.ok(library.data.items.every((item) => item.added === false));
  const lucknow = library.data.items.find((item) => item.id === "plib_up_02");
  assert.deepEqual([lucknow.kind, lucknow.city, lucknow.sedanInr, lucknow.innovaInr, lucknow.tempoInr], ["SIGHTSEEING", "Lucknow", 2200, 3200, 5000]);

  // The supplier's own sedan is used; Innova and Tempo Traveller are added.
  const sedan = (await call("/cab-types", { body: { name: "Swift Dzire Sedan", seats: 4 } })).data.cabType;
  const imported = await call("/package-library/import", { body: { itemIds: ["plib_up_02", "plib_gt_09"] } });
  assert.equal(imported.response.status, 201, JSON.stringify(imported.data));
  assert.deepEqual(imported.data.added, ["Lucknow full-day sightseeing", "Taj Mahal entry with mausoleum"]);
  assert.deepEqual(imported.data.cabTypesAdded, ["Innova", "Tempo Traveller"]);
  assert.equal(imported.data.validFrom, indiaToday());

  const services = (await call("/services")).data.services;
  const tour = services.find((service) => service.name === "Lucknow full-day sightseeing");
  assert.equal(tour.dayTitle, "Lucknow: City of Nawabs");
  assert.equal(tour.rates.length, 3);
  assert.equal(tour.rates.find((rate) => rate.cabTypeId === sedan.id).vehicleInr, 2200);
  const taj = services.find((service) => service.name === "Taj Mahal entry with mausoleum");
  assert.deepEqual([taj.kind, taj.rates[0].adultInr, taj.rates[0].childInr], ["ACTIVITY", 250, 0]);

  // Added once: a second try is skipped, and the library shows it as added.
  const again = await call("/package-library/import", { body: { itemIds: ["plib_up_02"] } });
  assert.deepEqual([again.data.added, again.data.skipped], [[], ["Lucknow full-day sightseeing"]]);
  assert.equal((await call("/package-library")).data.items.find((item) => item.id === "plib_up_02").added, true);
  assert.equal((await call("/services")).data.services.filter((service) => service.name === "Lucknow full-day sightseeing").length, 1);

  // A quotation prices the added service like any other.
  const quotation = await call("/quotations", { body: {
    title: "Lucknow Tour", customerName: "Ajay", startDate: indiaToday(), adults: 2, children: 0, markupPct: 0,
    lines: [{ kind: "TRANSPORT", dayNumber: 1, serviceId: tour.id, cabTypeId: sedan.id, date: indiaToday() }],
  } });
  assert.equal(quotation.response.status, 201, JSON.stringify(quotation.data));
  assert.equal(quotation.data.quotation.totals.costInr, 2200);

  // Unknown entries are refused and nothing is added.
  const unknown = await call("/package-library/import", { body: { itemIds: ["plib_gt_01", "plib_nope"] } });
  assert.equal(unknown.response.status, 404);
  assert.equal((await call("/services")).data.services.some((service) => service.name === "Delhi Airport to Hotel"), false);
});

test("admins add, edit and hide library entries; others can't", async (t) => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const { supplier, token } = supplierToken(db);
  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_library_admin', 'Library Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const admin = (path, options = {}) => requestJson(api.baseUrl, `/api/admin/package-library${path}`, { token: adminToken, ...options });

  assert.equal((await requestJson(api.baseUrl, "/api/admin/package-library", { token })).response.status, 403);
  const entry = { region: "Sikkim", kind: "SIGHTSEEING", name: "Gangtok local sightseeing", city: "Gangtok", dayTitle: "Gangtok", sedanInr: 2500 };
  assert.equal((await admin("", { body: { ...entry, sedanInr: null } })).data.code, "PRICE_REQUIRED");
  assert.equal((await admin("", { body: { ...entry, kind: "ACTIVITY", sedanInr: null } })).data.code, "PRICE_REQUIRED");
  const created = await admin("", { body: entry });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.ok((await admin("")).data.regions.includes("Sikkim"));

  // Hidden entries leave the supplier's library and can't be added.
  const hidden = await admin(`/${created.data.item.id}`, { method: "PUT", body: { ...entry, sedanInr: 2700, status: "INACTIVE" } });
  assert.deepEqual([hidden.data.item.sedanInr, hidden.data.item.status], [2700, "INACTIVE"]);
  const seen = await requestJson(api.baseUrl, `/api/suppliers/${supplier.id}/package-library`, { token });
  assert.equal(seen.data.regions.includes("Sikkim"), false);
  const refused = await requestJson(api.baseUrl, `/api/suppliers/${supplier.id}/package-library/import`, { token, body: { itemIds: [created.data.item.id] } });
  assert.equal(refused.response.status, 404);
});
