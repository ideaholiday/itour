import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { secureIdDate } from "../src/services/cashfreeSecureIdService.js";

// ADR 024 step C3: Cashfree checks of PAN, driving licence and vehicle RC for Indian suppliers,
// including individual owners; a verified licence or RC fills the fleet's expiry dates.
test("an individual owner checks PAN, licence and RC with Cashfree, and the fleet dates follow", async t => {
  const api = await startTestServer({ CASHFREE_SECUREID_SIMULATE: "true" }); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const owner = { companyName: "Ramesh Cabs", contactName: "Ramesh K", email: "ramesh.checks@example.test", phone: "+919812300021", city: "Goa", state: "Goa", password: "Kyb@Supplier2026", supplierKind: "INDIVIDUAL_OWNER" };
  const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", { body: owner });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  const token = signup.data.token;
  const supplierId = db.prepare("SELECT id FROM suppliers WHERE email = ?").get(owner.email).id;
  const kyb = (path, body) => requestJson(api.baseUrl, `/api/suppliers/${supplierId}/kyb/${path}`, { token, body });

  assert.equal((await kyb("verify-pan", { pan: "ABCPK1234F", name: "Ramesh K" })).response.status, 200);
  assert.equal((await kyb("verify-gstin", { gstin: "29AAACB8781B1Z5" })).response.status, 400);

  const added = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/drivers`, { token, body: { driverName: "Ramesh K", driverPhone: "+919812300021", driverEmail: "ramesh.checks@example.test", seatCapacity: 4, vehicleModel: "Swift Dzire Sedan", vehicleNumber: "GA03AB1234" } });
  assert.equal(added.response.status, 200, JSON.stringify(added.data));
  const driverId = added.data.driverId;

  const dl = await kyb("verify-dl", { licenseNumber: "GA0320180012345", dob: "1985-04-02", driverId });
  assert.equal(dl.response.status, 200, JSON.stringify(dl.data));
  assert.equal(dl.data.verification.valid, true);
  const rc = await kyb("verify-rc", { registrationNumber: "GA03AB1234", driverId });
  assert.equal(rc.response.status, 200, JSON.stringify(rc.data));
  assert.equal(rc.data.verification.valid, true);
  const row = db.prepare("SELECT license_number, license_expiry, insurance_expiry, permit_expiry FROM supplier_drivers WHERE id = ?").get(driverId);
  assert.deepEqual({ ...row }, { license_number: "GA0320180012345", license_expiry: "2031-01-09", insurance_expiry: "2027-12-14", permit_expiry: "2028-03-31" });

  // A licence Cashfree can't verify changes nothing on the fleet row.
  const bad = await kyb("verify-dl", { licenseNumber: "GA0320180000000", dob: "1985-04-02", driverId });
  assert.equal(bad.data.verification.valid, false);
  assert.equal(db.prepare("SELECT license_number FROM supplier_drivers WHERE id = ?").get(driverId).license_number, "GA0320180012345");
  assert.deepEqual(db.prepare("SELECT verification_type, status FROM supplier_kyb_verifications WHERE supplier_id = ? AND verification_type IN ('DRIVING_LICENSE', 'VEHICLE_RC') ORDER BY created_at, verification_type").all(supplierId).map(r => `${r.verification_type}:${r.status}`).sort(), ["DRIVING_LICENSE:INVALID", "DRIVING_LICENSE:VALID", "VEHICLE_RC:VALID"]);

  assert.equal((await kyb("verify-rc", { registrationNumber: "GA03AB1234", driverId: "drv_someone_else" })).response.status, 404);

  // Suppliers abroad have no Indian licence or RC to check.
  const thai = await requestJson(api.baseUrl, "/api/auth/supplier-signup", { body: { companyName: "Siam Cabs", contactName: "Niran K", email: "siam.cabs@example.test", phone: "+66812345677", city: "Bangkok", state: "Bangkok", password: "Kyb@Supplier2026" } });
  const thaiId = db.prepare("SELECT id FROM suppliers WHERE email = 'siam.cabs@example.test'").get().id;
  const refused = await requestJson(api.baseUrl, `/api/suppliers/${thaiId}/kyb/verify-rc`, { token: thai.data.token, body: { registrationNumber: "1กข1234" } });
  assert.equal(refused.response.status, 400);
  assert.equal(refused.data.code, "CASHFREE_INDIA_ONLY");
});

test("Cashfree dates are read in either format", () => {
  assert.equal(secureIdDate("14/12/2027"), "2027-12-14");
  assert.equal(secureIdDate("2031-01-09"), "2031-01-09");
  assert.equal(secureIdDate(null), null);
  assert.equal(secureIdDate("soon"), null);
});
