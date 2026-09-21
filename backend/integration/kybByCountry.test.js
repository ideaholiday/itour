import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

// ADR 023 step L3: a Thai supplier sees Thai documents and is never sent to Cashfree.
test("a Bangkok supplier gets the Thai document list and no Indian GSTIN or PAN check", async t => {
  const api = await startTestServer({ CASHFREE_SECUREID_SIMULATE: "true" }); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const email = "bangkok.kyb@example.test";
  const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", {
    body: { companyName: "Siam Trails Co", contactName: "Somchai P", email, phone: "+66812345678", city: "Bangkok", state: "Bangkok", password: "Kyb@Supplier2026" },
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  const token = signup.data.token;
  const supplierId = db.prepare("SELECT id FROM suppliers WHERE email = ?").get(email).id;

  const dashboard = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}`, { token });
  assert.equal(dashboard.response.status, 200, JSON.stringify(dashboard.data));
  const readiness = dashboard.data.kybReadiness;
  assert.equal(readiness.country, "Thailand");
  assert.equal(readiness.cashfree, false);
  assert.ok(readiness.documentTypes.some(type => type.docType === "TOUR_OPERATOR_LICENSE"));
  assert.ok(!readiness.documentTypes.some(type => type.docType === "PAN"));

  for (const [path, body] of [["verify-pan", { pan: "AAACB8781B" }], ["verify-gstin", { gstin: "29AAACB8781B1Z5" }], ["verify-all", {}]]) {
    const checked = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/kyb/${path}`, { token, body });
    assert.equal(checked.response.status, 400, `${path}: ${JSON.stringify(checked.data)}`);
    assert.equal(checked.data.code, "CASHFREE_INDIA_ONLY");
  }
  assert.equal(db.prepare("SELECT count(*) AS n FROM supplier_kyb_verifications WHERE supplier_id = ?").get(supplierId).n, 0);
  assert.equal(db.prepare("SELECT kyb_status FROM suppliers WHERE id = ?").get(supplierId).kyb_status, "PENDING");
});
