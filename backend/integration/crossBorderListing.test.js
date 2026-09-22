import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

// ADR 024 steps A1–A2: an Indian supplier lists abroad; a transfer abroad needs that country's vehicle document.
test("an Indian supplier lists a Bangkok tour, and a Phuket transfer only with the Thai vehicle document", async t => {
  const kybFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyb-cross-border-"));
  const api = await startTestServer({ KYB_FILES_DIR: kybFilesDir });
  t.after(async () => { await api.stop(); fs.rmSync(kybFilesDir, { recursive: true, force: true }); });
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

  const dashboard = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}`, { token });
  assert.equal(dashboard.data.kybReadiness.country, "India");

  // A1: a tour abroad is allowed today.
  const tour = await requestJson(api.baseUrl, `${base}/v2`, { token, body: { productType: "TOUR", productSubType: "PRIVATE", title: "Bangkok Temples from Goa Team", city: "Bangkok", state: "Bangkok", priceInr: 2999, status: "PUBLISHED" } });
  assert.equal(tour.response.status, 201, JSON.stringify(tour.data));

  // A2: a transfer abroad needs the Thai vehicle document, in every publish path.
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

  // An Indian transfer from the same supplier is unaffected.
  const goa = await requestJson(api.baseUrl, `${base}/v2`, { token, body: { ...transfer, title: "Goa Airport to Calangute", city: "Goa", state: "Goa", status: "PUBLISHED" } });
  assert.equal(goa.response.status, 201, JSON.stringify(goa.data));

  const upload = await requestJson(api.baseUrl, "/api/uploads", { token, body: { data: Buffer.from("%PDF-1.4\n%%EOF").toString("base64"), filename: "vehicle.pdf", mimeType: "application/pdf", entityType: "KYB", entityId: supplierId } });
  assert.equal(upload.response.status, 201, JSON.stringify(upload.data));
  const doc = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/kyb`, { token, body: { docType: "VEHICLE_REGISTRATION", docUrl: upload.data.upload.url } });
  assert.equal(doc.response.status, 200, JSON.stringify(doc.data));
  assert.equal((await publish()).response.status, 200);
});
