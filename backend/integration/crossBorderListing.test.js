import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

// ADR 024 A1–A3: an Indian supplier sells abroad on its Indian KYB (GSTIN + PAN, or
// admin approval); no licence or vehicle document from the other country is needed.
test("an Indian supplier lists a Bangkok tour and a Phuket transfer on its Indian KYB", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const email = "goa.abroad@example.test";
  const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", {
    body: { companyName: "Konkan Journeys", contactName: "Rahul S", email, phone: "+919812345678", city: "Goa", state: "Goa", password: "Kyb@Supplier2026" },
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  const token = signup.data.token;
  const supplierId = db.prepare("SELECT id FROM suppliers WHERE email = ?").get(email).id;
  db.prepare("UPDATE suppliers SET kyb_status = 'APPROVED', is_verified = 1 WHERE id = ?").run(supplierId);
  const base = `/api/suppliers/${supplierId}/products`;

  const readiness = (await requestJson(api.baseUrl, `/api/suppliers/${supplierId}`, { token })).data.kybReadiness;
  assert.equal(readiness.country, "India");
  assert.ok(readiness.documentTypes.some(type => type.docType === "CIN"), "CIN is offered as an optional document");
  assert.ok(!readiness.requiredDocuments.some(doc => doc.docType === "CIN"));

  const tour = await requestJson(api.baseUrl, `${base}/v2`, { token, body: { productType: "TOUR", productSubType: "PRIVATE", title: "Bangkok Temples from Goa Team", city: "Bangkok", state: "Bangkok", priceInr: 2999, status: "PUBLISHED" } });
  assert.equal(tour.response.status, 201, JSON.stringify(tour.data));

  const transfer = await requestJson(api.baseUrl, `${base}/v2`, { token, body: { productType: "TRANSFER", productSubType: "AIRPORT_RAILWAY", title: "Phuket Airport to Patong", city: "Phuket", state: "Phuket", priceInr: 1800, status: "PUBLISHED" } });
  assert.equal(transfer.response.status, 201, JSON.stringify(transfer.data));
  assert.equal(db.prepare("SELECT count(*) AS n FROM kyb_documents WHERE supplier_id = ?").get(supplierId).n, 0);
});
