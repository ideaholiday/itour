import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { hashPassword } from "../src/lib/passwords.js";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

const ADMIN = { email: "owner.admin@example.test", password: "Integration@Admin2026" };
const PDF_BASE64 = Buffer.from("%PDF-1.4\n%%EOF").toString("base64");

// ADR 024 step C1: an individual vehicle owner with no GSTIN signs up and gets their own document list.
test("an individual vehicle owner registers in India, gets the owner documents, and an admin approves once all are uploaded", async t => {
  const kybFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyb-owner-files-"));
  const api = await startTestServer({ KYB_FILES_DIR: kybFilesDir, CASHFREE_SECUREID_SIMULATE: "true" });
  t.after(async () => { await api.stop(); fs.rmSync(kybFilesDir, { recursive: true, force: true }); });
  const db = new Database(api.databasePath); t.after(() => db.close());
  const owner = { companyName: "Ramesh Cabs", contactName: "Ramesh K", email: "ramesh.cabs@example.test", phone: "+919812300011", city: "Goa", state: "Goa", password: "Kyb@Supplier2026" };

  const abroad = await requestJson(api.baseUrl, "/api/auth/supplier-signup", { body: { ...owner, email: "abroad.owner@example.test", city: "Bangkok", state: "Bangkok", phone: "+66812345670", supplierKind: "INDIVIDUAL_OWNER" } });
  assert.equal(abroad.response.status, 400, JSON.stringify(abroad.data));
  assert.match(abroad.data.error, /India only/);

  const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", { body: { ...owner, supplierKind: "INDIVIDUAL_OWNER" } });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  const token = signup.data.token;
  const supplierId = db.prepare("SELECT id FROM suppliers WHERE email = ?").get(owner.email).id;
  assert.equal(db.prepare("SELECT supplier_kind FROM suppliers WHERE id = ?").get(supplierId).supplier_kind, "INDIVIDUAL_OWNER");

  const readiness = (await requestJson(api.baseUrl, `/api/suppliers/${supplierId}`, { token })).data.kybReadiness;
  assert.equal(readiness.supplierKind, "INDIVIDUAL_OWNER");
  assert.equal(readiness.cashfree, false);
  assert.deepEqual(readiness.requiredDocuments.map(doc => doc.docType), ["PAN", "AADHAAR_MASKED", "DRIVING_LICENSE", "VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT", "VEHICLE_INSURANCE", "BANK_CANCELLED_CHEQUE"]);
  assert.ok(!readiness.documentTypes.some(type => type.docType === "GSTIN"));

  const gstin = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/kyb/verify-gstin`, { token, body: { gstin: "29AAACB8781B1Z5" } });
  assert.equal(gstin.response.status, 400);
  assert.match(gstin.data.error, /Individual vehicle owners/);

  const submit = async (docType, docNumber) => {
    const upload = await requestJson(api.baseUrl, "/api/uploads", { token, body: { data: PDF_BASE64, filename: `${docType}.pdf`, mimeType: "application/pdf", entityType: "KYB", entityId: supplierId } });
    assert.equal(upload.response.status, 201, JSON.stringify(upload.data));
    return requestJson(api.baseUrl, `/api/suppliers/${supplierId}/kyb`, { token, body: { docType, docUrl: upload.data.upload.url, ...(docNumber ? { docNumber } : {}) } });
  };

  // The full Aadhaar number is never stored.
  const fullAadhaar = await submit("AADHAAR_MASKED", "234567890123");
  assert.equal(fullAadhaar.response.status, 400);
  assert.equal(db.prepare("SELECT count(*) AS n FROM kyb_documents WHERE doc_number = '234567890123'").get().n, 0);
  assert.equal((await submit("AADHAAR_MASKED", "0123")).response.status, 200);

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_owner_admin', 'Owner Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: ADMIN })).data.token;
  const approve = () => requestJson(api.baseUrl, `/api/admin/suppliers/${supplierId}/verify`, { token: adminToken, body: { action: "APPROVED", reason: "Documents checked" } });

  for (const docType of ["PAN", "DRIVING_LICENSE", "VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT", "VEHICLE_INSURANCE"]) {
    assert.equal((await submit(docType)).response.status, 200, docType);
  }
  const blocked = await approve();
  assert.equal(blocked.response.status, 409, JSON.stringify(blocked.data));
  assert.match(blocked.data.error, /Cancelled cheque/);

  assert.equal((await submit("BANK_CANCELLED_CHEQUE")).response.status, 200);
  assert.equal((await approve()).response.status, 200);
  assert.equal(db.prepare("SELECT kyb_status FROM suppliers WHERE id = ?").get(supplierId).kyb_status, "APPROVED");

  // Signing up without a kind is a business, as before.
  const business = await requestJson(api.baseUrl, "/api/auth/supplier-signup", { body: { ...owner, companyName: "Goa Coast Tours", email: "goa.business@example.test", phone: "+919812300012" } });
  assert.equal(business.response.status, 201, JSON.stringify(business.data));
  assert.equal(db.prepare("SELECT supplier_kind FROM suppliers WHERE email = 'goa.business@example.test'").get().supplier_kind, "BUSINESS");
});
