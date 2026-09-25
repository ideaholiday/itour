import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

test("a Thai supplier's transfer goes live only once the vehicle document is uploaded", async t => {
  const kybFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyb-transfer-files-"));
  const api = await startTestServer({ KYB_FILES_DIR: kybFilesDir });
  t.after(async () => { await api.stop(); fs.rmSync(kybFilesDir, { recursive: true, force: true }); });
  const db = new Database(api.databasePath); t.after(() => db.close());
  const email = "phuket.transfers@example.test";
  const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", {
    body: { companyName: "Andaman Rides", contactName: "Niran K", email, phone: "+66812345679", city: "Phuket", state: "Phuket", password: "Kyb@Supplier2026" },
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  const token = signup.data.token;
  const supplierId = db.prepare("SELECT id FROM suppliers WHERE email = ?").get(email).id;
  // Approved earlier as a tour operator, before listing any transfer.
  db.prepare("UPDATE suppliers SET kyb_status = 'APPROVED', is_verified = 1 WHERE id = ?").run(supplierId);
  const base = `/api/suppliers/${supplierId}/products`;
  const transfer = { productType: "TRANSFER", productSubType: "AIRPORT_RAILWAY", title: "Phuket Airport to Patong", city: "Phuket", state: "Phuket", priceInr: 1800 };

  const live = await requestJson(api.baseUrl, `${base}/v2`, { token, body: { ...transfer, status: "PUBLISHED" } });
  assert.equal(live.response.status, 409, JSON.stringify(live.data));
  assert.equal(live.data.code, "TRANSFER_DOCUMENT_REQUIRED");
  assert.match(live.data.error, /Commercial vehicle registration or public transport permit/);

  const draft = await requestJson(api.baseUrl, `${base}/v2`, { token, body: { ...transfer, status: "DRAFT" } });
  assert.equal(draft.response.status, 201, JSON.stringify(draft.data));
  const productId = draft.data.productId;
  const publish = () => requestJson(api.baseUrl, `${base}/${productId}/publication`, { token, method: "PATCH", body: { isPublished: true } });
  assert.equal((await publish()).response.status, 409);
  const bulk = await requestJson(api.baseUrl, `${base}/bulk-action`, { token, body: { action: "publish", productIds: [productId] } });
  assert.equal(bulk.response.status, 409);
  assert.equal(db.prepare("SELECT is_published FROM products WHERE id = ?").get(productId).is_published, 0);

  const upload = await requestJson(api.baseUrl, "/api/uploads", { token, body: { data: Buffer.from("%PDF-1.4\n%%EOF").toString("base64"), filename: "vehicle.pdf", mimeType: "application/pdf", entityType: "KYB", entityId: supplierId } });
  assert.equal(upload.response.status, 201, JSON.stringify(upload.data));
  const doc = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/kyb`, { token, body: { docType: "VEHICLE_REGISTRATION", docUrl: upload.data.upload.url } });
  assert.equal(doc.response.status, 200, JSON.stringify(doc.data));
  assert.equal((await publish()).response.status, 200);
});
