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
const PNG_BASE64 = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");

// ADR 024 step C1: an individual vehicle owner with no GSTIN signs up and gets their own document list.
test("an individual vehicle owner registers in India, verifies PAN, uploads the owner documents, and is approved automatically", async t => {
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
  assert.deepEqual(readiness.requiredDocuments.map(doc => doc.docType), ["PAN", "SELFIE", "AADHAAR_MASKED", "AADHAAR_BACK", "DRIVING_LICENSE", "VEHICLE_REGISTRATION"]);
  assert.equal(readiness.ownerChecks.pan.verified, false);
  assert.ok(!readiness.documentTypes.some(type => type.docType === "GSTIN"));

  const gstin = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/kyb/verify-gstin`, { token, body: { gstin: "29AAACB8781B1Z5" } });
  assert.equal(gstin.response.status, 400);
  assert.match(gstin.data.error, /Individual vehicle owners/);

  const submit = async (docType, docNumber, image = false) => {
    const file = image ? { data: PNG_BASE64, filename: `${docType}.png`, mimeType: "image/png" } : { data: PDF_BASE64, filename: `${docType}.pdf`, mimeType: "application/pdf" };
    const upload = await requestJson(api.baseUrl, "/api/uploads", { token, body: { ...file, entityType: "KYB", entityId: supplierId } });
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

  // The PAN card is refused until the PAN number is verified with Cashfree.
  const unverifiedPan = await submit("PAN", "ABCPK1234F");
  assert.equal(unverifiedPan.response.status, 400);
  assert.match(unverifiedPan.data.error, /Verify your PAN/);
  // The selfie must be a photo, not a PDF.
  assert.equal((await submit("SELFIE")).response.status, 400);
  for (const docType of ["DRIVING_LICENSE", "VEHICLE_REGISTRATION"]) {
    assert.equal((await submit(docType)).response.status, 200, docType);
  }
  assert.equal((await submit("SELFIE", null, true)).response.status, 200);
  const blocked = await approve();
  assert.equal(blocked.response.status, 409, JSON.stringify(blocked.data));
  assert.match(blocked.data.error, /PAN verified/);

  const pan = await requestJson(api.baseUrl, `/api/suppliers/${supplierId}/kyb/verify-pan`, { token, body: { pan: "ABCPK1234F", name: "Ramesh K" } });
  assert.equal(pan.data.verification.valid, true, JSON.stringify(pan.data));
  assert.equal((await submit("PAN", "ABCPK1234F")).response.status, 200);
  // The back of the Aadhaar is required too.
  const noBack = await approve();
  assert.equal(noBack.response.status, 409, JSON.stringify(noBack.data));
  assert.match(noBack.data.error, /Aadhaar back/);
  // Permit, insurance and the cancelled cheque are optional; the last required
  // document approves the owner without Cashfree licence or RC checks (ADR 033).
  const back = await submit("AADHAAR_BACK");
  assert.equal(back.response.status, 200);
  assert.equal(back.data.kybAutoApproved, true);
  assert.equal(db.prepare("SELECT kyb_status FROM suppliers WHERE id = ?").get(supplierId).kyb_status, "APPROVED");

  // Staff who see a licence in another name send just that document back; the owner stays approved.
  const dlDoc = db.prepare("SELECT id FROM kyb_documents WHERE supplier_id = ? AND doc_type = 'DRIVING_LICENSE'").get(supplierId);
  const reupload = body => requestJson(api.baseUrl, `/api/admin/suppliers/${supplierId}/kyb/${dlDoc.id}/reupload`, { token: adminToken, body });
  assert.equal((await reupload({ reason: "no" })).response.status, 400);
  assert.equal((await requestJson(api.baseUrl, `/api/admin/suppliers/${supplierId}/kyb/${dlDoc.id}/reupload`, { token, body: { reason: "Name does not match PAN" } })).response.status, 403);
  const sentBack = await reupload({ reason: "Name does not match PAN" });
  assert.equal(sentBack.response.status, 200, JSON.stringify(sentBack.data));
  assert.deepEqual({ ...db.prepare("SELECT status, rejection_reason FROM kyb_documents WHERE id = ?").get(dlDoc.id) }, { status: "REJECTED", rejection_reason: "Name does not match PAN" });
  assert.equal(db.prepare("SELECT kyb_status FROM suppliers WHERE id = ?").get(supplierId).kyb_status, "APPROVED");
  // The owner is told by email and WhatsApp which document and why.
  let notices = [];
  for (const deadline = Date.now() + 5_000; notices.length < 2 && Date.now() < deadline; await new Promise(resolve => setTimeout(resolve, 50))) {
    notices = db.prepare("SELECT channel, body FROM notification_deliveries WHERE event_type = 'KYB_DOCUMENT_REUPLOAD' AND event_key LIKE ?").all(`${dlDoc.id}:%`);
  }
  assert.deepEqual(notices.map(row => row.channel).sort(), ["EMAIL", "WHATSAPP"]);
  for (const row of notices) assert.match(row.body, /Commercial driving licence again[\s\S]*Name does not match PAN/);
  const ownerView = (await requestJson(api.baseUrl, `/api/suppliers/${supplierId}`, { token })).data.kybReadiness.ownerChecks;
  assert.ok("name" in ownerView.licence && "name" in ownerView.vehicle);
  assert.equal((await submit("DRIVING_LICENSE")).response.status, 200);
  assert.deepEqual({ ...db.prepare("SELECT status, rejection_reason FROM kyb_documents WHERE id = ?").get(dlDoc.id) }, { status: "PENDING", rejection_reason: null });

  // Signing up without a kind is a business, as before.
  const business = await requestJson(api.baseUrl, "/api/auth/supplier-signup", { body: { ...owner, companyName: "Goa Coast Tours", email: "goa.business@example.test", phone: "+919812300012" } });
  assert.equal(business.response.status, 201, JSON.stringify(business.data));
  assert.equal(db.prepare("SELECT supplier_kind FROM suppliers WHERE email = 'goa.business@example.test'").get().supplier_kind, "BUSINESS");
});
