import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { hashPassword } from "../src/lib/passwords.js";

/**
 * KYB over HTTP: a supplier uploads documents that only they and admins can
 * open, an admin sees the real dossier and cannot approve an incomplete one,
 * and verifying GSTIN and PAN with Cashfree SecureID approves the supplier.
 */

const ADMIN = { email: "kyb.admin@example.test", password: "Integration@Admin2026" };
const PDF_BASE64 = Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF").toString("base64");

async function signupSupplier(api, db, { companyName, email, phone }) {
  const city = db.prepare("SELECT name, state FROM destinations WHERE COALESCE(is_active, 1) = 1 ORDER BY name LIMIT 1").get();
  const signup = await requestJson(api.baseUrl, "/api/auth/supplier-signup", {
    body: { companyName, contactName: "Asha Rao", email, phone, city: city.name, state: city.state, password: "Kyb@Supplier2026" },
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.data));
  const supplierId = signup.data.user.supplier_id || db.prepare("SELECT id FROM suppliers WHERE email = ?").get(email).id;
  return { token: signup.data.token, supplierId };
}

async function fetchFile(api, pathname, token) {
  return fetch(`${api.baseUrl}${pathname}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

test("KYB documents stay private, incomplete suppliers can't be approved, and Cashfree-verified ones are approved automatically", async (t) => {
  const kybFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyb-http-files-"));
  const api = await startTestServer({ KYB_FILES_DIR: kybFilesDir, CASHFREE_SECUREID_SIMULATE: "true" });
  t.after(async () => {
    await api.stop();
    fs.rmSync(kybFilesDir, { recursive: true, force: true });
  });
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const supplier = await signupSupplier(api, db, { companyName: "Coorg Hill Cabs", email: "asha@coorghillcabs.example", phone: "+919845012345" });
  const other = await signupSupplier(api, db, { companyName: "Other Valley Tours", email: "ops@othervalley.example", phone: "+919845067890" });

  db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_kyb_admin', 'KYB Admin', ?, ?, 'ADMIN')").run(ADMIN.email, hashPassword(ADMIN.password));
  const adminToken = (await requestJson(api.baseUrl, "/api/auth/login", { body: ADMIN })).data.token;
  assert.ok(adminToken);

  // A KYB file can't be uploaded anonymously or for another supplier.
  const uploadBody = { data: PDF_BASE64, filename: "pan-card.html", mimeType: "application/pdf", entityType: "KYB", entityId: supplier.supplierId };
  assert.equal((await requestJson(api.baseUrl, "/api/uploads", { body: uploadBody })).response.status, 401);
  assert.equal((await requestJson(api.baseUrl, "/api/uploads", { token: other.token, body: uploadBody })).response.status, 403);

  const upload = await requestJson(api.baseUrl, "/api/uploads", { token: supplier.token, body: uploadBody });
  assert.equal(upload.response.status, 201, JSON.stringify(upload.data));
  assert.match(upload.data.upload.url, /^kyb-file:\/\/kyb_.+\.pdf$/, "stored privately, with an extension from the checked type");

  // A document needs a file this supplier uploaded; a placeholder link is refused.
  const placeholder = await requestJson(api.baseUrl, `/api/suppliers/${supplier.supplierId}/kyb`, {
    token: supplier.token, body: { docType: "PAN", docUrl: "https://example.com/docs/uploaded.pdf" },
  });
  assert.equal(placeholder.response.status, 400);
  const stolen = await requestJson(api.baseUrl, `/api/suppliers/${other.supplierId}/kyb`, {
    token: other.token, body: { docType: "PAN", docUrl: upload.data.upload.url },
  });
  assert.equal(stolen.response.status, 400);

  const submitted = await requestJson(api.baseUrl, `/api/suppliers/${supplier.supplierId}/kyb`, {
    token: supplier.token, body: { docType: "PAN", docNumber: "AAACB8781B", docUrl: upload.data.upload.url },
  });
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.data));
  const docId = submitted.data.docId;

  // Only the supplier and admins can open it.
  const filePath = `/api/suppliers/${supplier.supplierId}/kyb/${docId}/file`;
  const own = await fetchFile(api, filePath, supplier.token);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get("content-type"), "application/pdf");
  assert.equal(own.headers.get("cache-control"), "private, no-store");
  assert.equal((await fetchFile(api, filePath, other.token)).status, 403);
  assert.equal((await fetchFile(api, filePath)).status, 401);
  assert.equal((await fetchFile(api, `/api/admin/suppliers/${supplier.supplierId}/kyb/${docId}/file`, adminToken)).status, 200);
  assert.equal((await fetchFile(api, `/api/admin/suppliers/${supplier.supplierId}/kyb/${docId}/file`, supplier.token)).status, 403);

  // A KYB file uploaded to the public folder before this change is no longer served there.
  const legacyName = `file_${Date.now()}_legacy.pdf`;
  fs.writeFileSync(path.join(import.meta.dirname, "..", "uploads", legacyName), "%PDF-1.4 legacy");
  t.after(() => fs.rmSync(path.join(import.meta.dirname, "..", "uploads", legacyName), { force: true }));
  db.prepare("INSERT INTO uploads (id, filename, original_name, mime_type, size_bytes, url, entity_type, entity_id, created_at) VALUES ('upload_legacy_kyb', ?, 'permit.pdf', 'application/pdf', 15, ?, 'KYB', ?, datetime('now'))")
    .run(legacyName, `/uploads/${legacyName}`, supplier.supplierId);
  assert.equal((await fetchFile(api, `/uploads/${legacyName}`)).status, 404);
  assert.equal((await fetchFile(api, `/api/uploads/files/${legacyName}`)).status, 404);

  // The admin dossier shows real data only, and approval is blocked while the GSTIN certificate is missing.
  const list = await requestJson(api.baseUrl, "/api/admin/suppliers?status=PENDING", { token: adminToken });
  assert.equal(list.response.status, 200, JSON.stringify(list.data));
  const dossier = list.data.suppliers.find((row) => row.id === supplier.supplierId);
  assert.equal(dossier.attachments, undefined);
  assert.deepEqual(dossier.kybDocs.map((doc) => [doc.doc_type, doc.has_file, doc.doc_url]), [["PAN", true, undefined]]);
  assert.deepEqual(dossier.kybReadiness.missingDocuments, ["GSTIN Certificate"]);
  assert.equal(dossier.kybReadiness.canApprove, false);
  assert.deepEqual(dossier.bankDetails, {});

  const blocked = await requestJson(api.baseUrl, `/api/admin/suppliers/${supplier.supplierId}/verify`, {
    token: adminToken, body: { action: "APPROVED", reason: "Looks fine" },
  });
  assert.equal(blocked.response.status, 409, JSON.stringify(blocked.data));
  assert.match(blocked.data.error, /GSTIN Certificate/);

  // Verifying GSTIN and PAN with Cashfree SecureID approves the supplier by itself.
  const profile = await requestJson(api.baseUrl, `/api/suppliers/${supplier.supplierId}/profile`, {
    method: "PATCH", token: supplier.token, body: { gstin: "29AAACB8781B1Z5", panNumber: "AAACB8781B" },
  });
  assert.equal(profile.response.status, 200, JSON.stringify(profile.data));

  const gstin = await requestJson(api.baseUrl, `/api/suppliers/${supplier.supplierId}/kyb/verify-gstin`, { token: supplier.token, body: { gstin: "29AAACB8781B1Z5", businessName: "Coorg Hill Cabs" } });
  assert.equal(gstin.response.status, 200, JSON.stringify(gstin.data));
  assert.equal(gstin.data.kybAutoApproved, false);
  assert.equal(gstin.data.supplier.kyb_status, "PENDING");

  const pan = await requestJson(api.baseUrl, `/api/suppliers/${supplier.supplierId}/kyb/verify-pan`, { token: supplier.token, body: { pan: "AAACB8781B", name: "Asha Rao" } });
  assert.equal(pan.response.status, 200, JSON.stringify(pan.data));
  assert.equal(pan.data.kybAutoApproved, true);
  assert.equal(pan.data.supplier.kyb_status, "APPROVED");
  assert.equal(pan.data.supplier.is_verified, 1);
  assert.equal(pan.data.supplier.kyb_approval_source, "CASHFREE_SECUREID");

  // Changing the PAN afterwards clears its verified flag until it is checked again.
  const changed = await requestJson(api.baseUrl, `/api/suppliers/${supplier.supplierId}/profile`, {
    method: "PATCH", token: supplier.token, body: { panNumber: "AAACB8781C" },
  });
  assert.equal(changed.data.supplier.pan_verified, 0);
});
