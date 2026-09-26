import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

// Route and city library, and agent-first quotations (ADR 048).

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";
const ADMIN = { email: "routes.admin@example.test", password: "Integration@Admin2026" };
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

function supplierToken(db) {
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY created_at LIMIT 1").get();
  let owner = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!owner) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_routes_owner', 'Owner', ?, 'x', 'SUPPLIER')").run(supplier.email);
    owner = db.prepare("SELECT * FROM users WHERE id = 'usr_routes_owner'").get();
  }
  return { supplier, token: jwt.sign({ id: owner.id, email: owner.email, role: "SUPPLIER" }, JWT_SECRET) };
}

test("the shared route library lists circuits with their days, cities and which library entries the supplier has", async (t) => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const { supplier, token } = supplierToken(db);
  const call = (path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${supplier.id}${path}`, { token, ...options });

  const library = await call("/route-library");
  assert.equal(library.response.status, 200, JSON.stringify(library.data));
  const circuit = library.data.routes.find((route) => route.id === "proute_up_lav");
  assert.equal(circuit.name, "Lucknow – Ayodhya – Varanasi 6N/7D");
  assert.deepEqual(circuit.legs, [{ city: "Lucknow", nights: 2 }, { city: "Ayodhya", nights: 2 }, { city: "Varanasi", nights: 2 }]);
  assert.equal(circuit.nights, 6);
  assert.equal(circuit.days.length, 7);
  assert.deepEqual(circuit.days[4].items.map((item) => [item.id, item.serviceId]), [["plib_up_05", null], ["plib_up_08", null]]);
  assert.ok(library.data.cities.some((city) => city.name === "Ayodhya" && city.dayTitle === "Ayodhya: Ram Mandir darshan"));

  // Once the entry is on the supplier's rate sheet, the route day points at that service.
  await call("/package-library/import", { body: { itemIds: ["plib_up_08"] } });
  const after = (await call("/route-library")).data.routes.find((route) => route.id === "proute_up_lav");
  const aarti = after.days[4].items.find((item) => item.id === "plib_up_08");
  assert.equal(aarti.serviceId, db.prepare("SELECT id FROM supplier_services WHERE supplier_id = ? AND library_item_id = 'plib_up_08'").get(supplier.id).id);
});

test("a supplier saves its own routes, sees them first, can't touch shared ones, and bad routes are refused", async (t) => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const { supplier, token } = supplierToken(db);
  const call = (path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${supplier.id}${path}`, { token, ...options });

  const mine = { name: "Our Kashi Special 3N/4D", description: "Our best seller.", legs: [{ city: "Varanasi", nights: 3 }],
    days: [{ dayNumber: 2, title: "Kashi darshan", description: "Temples and ghats.", itemIds: ["plib_up_07"] }], inclusions: ["Breakfast"], exclusions: ["Airfare"] };
  const created = await call("/routes", { body: mine });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.route.own, true);
  const list = (await call("/route-library")).data.routes;
  assert.equal(list[0].id, created.data.route.id);

  const outside = await call("/routes", { body: { ...mine, days: [{ dayNumber: 6, title: "Too late" }] } });
  assert.deepEqual([outside.response.status, outside.data.code], [400, "DAY_OUTSIDE_ROUTE"]);
  const unknown = await call("/routes", { body: { ...mine, days: [{ dayNumber: 1, itemIds: ["plib_nope"] }] } });
  assert.deepEqual([unknown.response.status, unknown.data.code], [400, "LIBRARY_ITEM_NOT_FOUND"]);

  const renamed = await call(`/routes/${created.data.route.id}`, { method: "PUT", body: { ...mine, name: "Kashi Special 3N/4D" } });
  assert.equal(renamed.data.route.name, "Kashi Special 3N/4D");
  assert.equal((await call("/routes/proute_up_lav", { method: "PUT", body: mine })).response.status, 404);
  assert.equal((await call("/routes/proute_up_lav", { method: "DELETE" })).response.status, 404);
  assert.equal((await call(`/routes/${created.data.route.id}`, { method: "DELETE" })).response.status, 200);
  assert.ok(!(await call("/route-library")).data.routes.some((route) => route.id === created.data.route.id));
});

test("the admin keeps shared routes and cities; hidden ones leave the supplier's library", async (t) => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const { supplier, token } = supplierToken(db);
  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_routes_admin', 'Routes Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: { ...ADMIN, portal: "admin" } })).data.token;
  const admin = (path, options = {}) => requestJson(api.baseUrl, `/api/admin/route-library${path}`, { token: adminToken, ...options });

  const all = await admin("");
  assert.equal(all.response.status, 200, JSON.stringify(all.data));
  const circuit = all.data.routes.find((route) => route.id === "proute_up_la");
  const hidden = await admin("/routes/proute_up_la", { method: "PUT", body: {
    region: circuit.region, name: circuit.name, description: circuit.description, legs: circuit.legs, days: circuit.days, inclusions: circuit.inclusions, exclusions: circuit.exclusions, status: "INACTIVE",
  } });
  assert.equal(hidden.response.status, 200, JSON.stringify(hidden.data));
  const city = await admin("/cities", { body: { region: "Uttar Pradesh", name: "Mathura", description: "Birthplace of Lord Krishna.", dayTitle: "Mathura and Vrindavan" } });
  assert.equal(city.response.status, 201, JSON.stringify(city.data));
  assert.equal((await admin("/cities", { body: { region: "Uttar Pradesh", name: "mathura" } })).data.code, "CITY_EXISTS");

  const supplierView = (await requestJson(api.baseUrl, `/api/suppliers/${supplier.id}/route-library`, { token })).data;
  assert.ok(!supplierView.routes.some((route) => route.id === "proute_up_la"));
  assert.ok(supplierView.cities.some((row) => row.name === "Mathura"));
  assert.equal((await requestJson(api.baseUrl, "/api/admin/route-library", { token })).response.status, 403);
});

test("an agent quotation shows the agent's net and margin, and the list names the agent", async (t) => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const { supplier, token } = supplierToken(db);
  const call = (path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${supplier.id}${path}`, { token, ...options });

  const agent = (await call("/agents", { body: { name: "Awadh Travels", email: "desk@awadh.example", markupPct: 5 } })).data.agent;
  const created = await call("/quotations", { body: {
    title: "Lucknow Tour", customerName: "Ajay Pal Singh", agentId: agent.id, startDate: day(20), adults: 2, markupPct: 15,
    lines: [{ kind: "CUSTOM", dayNumber: 1, title: "Airport cab", amountInr: 10000 }],
  } });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  // Retail: 10,000 + 15% = 11,500 + 5% GST = 12,075. Agent net: 10,000 + 5% = 10,500 + 5% GST = 11,025.
  const { quotation } = created.data;
  assert.equal(quotation.totals.totalInr, 12075);
  assert.equal(quotation.agentName, "Awadh Travels");
  assert.deepEqual([quotation.trade.markupPct, quotation.trade.netInr, quotation.trade.marginInr], [5, 11025, 1050]);

  const direct = (await call("/quotations", { body: { title: "Direct", customerName: "Meera Iyer", startDate: day(20), adults: 1, lines: [] } })).data.quotation;
  assert.equal(direct.trade, null);
  const list = (await call("/quotations")).data.quotations;
  assert.equal(list.find((row) => row.id === quotation.id).agentName, "Awadh Travels");
  assert.equal(list.find((row) => row.id === direct.id).agentName, null);
});
