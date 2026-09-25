import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";

// A new fleet driver has no rating until a published review rates them.
test("a driver added to the fleet starts without a rating", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const supplier = db.prepare("SELECT * FROM suppliers LIMIT 1").get();
  let owner = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!owner) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_fleet_owner', 'Owner', ?, 'x', 'SUPPLIER')").run(supplier.email);
    owner = db.prepare("SELECT * FROM users WHERE id = 'usr_fleet_owner'").get();
  }
  const token = jwt.sign({ id: owner.id, email: owner.email, role: "SUPPLIER" }, JWT_SECRET);
  const added = await requestJson(api.baseUrl, `/api/suppliers/${supplier.id}/drivers`, { token, body: { driverName: "Imran Shaikh", driverPhone: "+919812300077", vehicleModel: "Toyota Innova", vehicleNumber: "GA07CD4455", seatCapacity: 6 } });
  assert.equal(added.response.status, 200, JSON.stringify(added.data));
  assert.equal(db.prepare("SELECT rating FROM supplier_drivers WHERE id = ?").get(added.data.driverId).rating, null);
});
