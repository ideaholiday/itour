import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { translateSqliteSql } from "../src/postgresSyncDb.js";

// KYB files live in a private folder; point it at a scratch folder for tests.
const kybFilesDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyb-files-"));
process.env.KYB_FILES_DIR = kybFilesDir;
test.after(() => fs.rmSync(kybFilesDir, { recursive: true, force: true }));

const {
  autoApproveSupplierKyb,
  getCashfreeIdentityStatus,
  getKybApprovalReadiness,
  saveSupplierVerification,
  UPDATE_SUPPLIER_VERIFICATION_SQL,
} = await import("../src/services/supplierVerificationService.js");
const { kybFileName, resolveKybFilePath, saveKybFile } = await import("../src/services/kybFileService.js");

const GSTIN = "29AAACB8781B1Z5";
const PAN = "AAACB8781B";

function verificationDatabase({ status = "PENDING" } = {}) {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY, company_name TEXT, kyb_status TEXT,
      is_verified INTEGER DEFAULT 0, commission_rate REAL,
      commission_override_rate REAL, gstin TEXT, pan_number TEXT,
      kyb_approval_source TEXT, kyb_approved_at TEXT
    );
    CREATE TABLE kyb_documents (
      id TEXT PRIMARY KEY, supplier_id TEXT, doc_type TEXT, doc_url TEXT, status TEXT,
      rejection_reason TEXT, verified_at TEXT
    );
    CREATE TABLE supplier_kyb_verifications (
      id TEXT PRIMARY KEY, supplier_id TEXT, verification_type TEXT, status TEXT,
      input_data TEXT, response_data TEXT, created_at TEXT
    );
  `);
  database.prepare("INSERT INTO suppliers (id, company_name, kyb_status, commission_rate, gstin, pan_number) VALUES ('supplier-1', 'Test Supplier', ?, 18, ?, ?)")
    .run(status, GSTIN, PAN);
  return database;
}

async function addDocument(database, id, docType, { withFile = true } = {}) {
  const docUrl = withFile ? (await saveKybFile(Buffer.from("%PDF-1.4 test"), "application/pdf")).url : "https://example.com/docs/uploaded.pdf";
  database.prepare("INSERT INTO kyb_documents (id, supplier_id, doc_type, doc_url, status) VALUES (?, 'supplier-1', ?, ?, 'PENDING')")
    .run(id, docType, docUrl);
}

let checkSeq = 0;
function addCheck(database, type, { number, valid = true, simulated = false, createdAt = "2026-09-13 10:00:00" } = {}) {
  const input = type === "GSTIN" ? { gstin: number ?? GSTIN } : { pan: number ?? PAN };
  database.prepare("INSERT INTO supplier_kyb_verifications VALUES (?, 'supplier-1', ?, ?, ?, ?, ?)").run(
    `check-${checkSeq += 1}`, type, valid ? "VALID" : "INVALID", JSON.stringify(input), JSON.stringify({ valid, simulated }), createdAt,
  );
}

const supplierRow = (database) => database.prepare("SELECT * FROM suppliers WHERE id = 'supplier-1'").get();

test("supplier approval atomically verifies the supplier and its KYB documents", async () => {
  const database = verificationDatabase();
  await addDocument(database, "document-1", "PAN");
  await addDocument(database, "document-2", "GSTIN");
  const result = saveSupplierVerification(database, {
    supplierId: "supplier-1",
    action: "APPROVED",
    commissionRate: 16,
  });

  assert.equal(result.supplier.kyb_status, "APPROVED");
  assert.equal(result.supplier.is_verified, 1);
  assert.equal(result.supplier.commission_rate, 16);
  assert.equal(result.supplier.commission_override_rate, 16);
  assert.equal(result.supplier.kyb_approval_source, "ADMIN");
  assert.match(result.supplier.kyb_approved_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.deepEqual(database.prepare("SELECT DISTINCT status FROM kyb_documents").all(), [{ status: "APPROVED" }]);
  database.close();
});

test("supplier rejection requires and records a reason", async () => {
  const database = verificationDatabase();
  await addDocument(database, "document-1", "PAN");
  assert.throws(
    () => saveSupplierVerification(database, { supplierId: "supplier-1", action: "REJECTED", reason: "" }),
    /rejection reason is required/i,
  );

  saveSupplierVerification(database, {
    supplierId: "supplier-1",
    action: "REJECTED",
    reason: "Transport licence is expired",
  });
  const document = database.prepare("SELECT status, rejection_reason FROM kyb_documents").get();
  assert.deepEqual(document, { status: "REJECTED", rejection_reason: "Transport licence is expired" });
  assert.equal(supplierRow(database).kyb_approval_source, null);
  database.close();
});

test("an admin cannot approve a supplier whose required documents are missing or only placeholder links", async () => {
  const database = verificationDatabase();
  await addDocument(database, "document-1", "GSTIN");
  await addDocument(database, "document-2", "PAN", { withFile: false });
  await addDocument(database, "document-3", "COMMERCIAL_TRANSPORT_LICENSE");

  assert.throws(
    () => saveSupplierVerification(database, { supplierId: "supplier-1", action: "APPROVED" }),
    (error) => error.status === 409 && /Missing: PAN Card\./.test(error.message),
  );
  assert.equal(supplierRow(database).kyb_status, "PENDING");

  const readiness = getKybApprovalReadiness(database, supplierRow(database));
  assert.equal(readiness.canApprove, false);
  // PAN and GSTIN are required; the transport licence is optional (ADR 032).
  assert.deepEqual(readiness.requiredDocuments.map((doc) => [doc.docType, doc.uploaded]), [["PAN", false], ["GSTIN", true]]);
  database.close();
});

test("an admin can approve without documents once Cashfree has verified the GSTIN and PAN", () => {
  const database = verificationDatabase({ status: "SUSPENDED" });
  addCheck(database, "GSTIN");
  addCheck(database, "PAN");
  const result = saveSupplierVerification(database, { supplierId: "supplier-1", action: "APPROVED" });
  assert.equal(result.supplier.kyb_status, "APPROVED");
  database.close();
});

test("a pending supplier is approved automatically once Cashfree verifies a GSTIN registered to their PAN", () => {
  const database = verificationDatabase();
  const notifications = [];
  addCheck(database, "GSTIN");

  const before = autoApproveSupplierKyb(database, "supplier-1", { notify: (payload) => notifications.push(payload) });
  assert.equal(before.approved, false);
  assert.deepEqual(before.identity.reasons, ["PAN has not been checked with Cashfree SecureID"]);

  addCheck(database, "PAN");
  const after = autoApproveSupplierKyb(database, "supplier-1", { notify: (payload) => notifications.push(payload) });
  assert.equal(after.approved, true);
  assert.equal(after.supplier.kyb_status, "APPROVED");
  assert.equal(after.supplier.is_verified, 1);
  assert.equal(after.supplier.kyb_approval_source, "CASHFREE_SECUREID");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].action, "APPROVED");

  // Running the check again neither re-approves nor notifies twice.
  assert.equal(autoApproveSupplierKyb(database, "supplier-1", { notify: (payload) => notifications.push(payload) }).approved, false);
  assert.equal(notifications.length, 1);
  database.close();
});

test("auto-approval refuses a GSTIN from another PAN, a failed or outdated check, and a supplier an admin decided on", () => {
  const unlinked = verificationDatabase();
  unlinked.prepare("UPDATE suppliers SET gstin = '27ZZZZZ9999Z1Z5'").run();
  addCheck(unlinked, "GSTIN", { number: "27ZZZZZ9999Z1Z5" });
  addCheck(unlinked, "PAN");
  const unlinkedResult = autoApproveSupplierKyb(unlinked, "supplier-1");
  assert.equal(unlinkedResult.approved, false);
  assert.ok(unlinkedResult.identity.reasons.includes("The GSTIN is not registered to this PAN"));
  unlinked.close();

  const latestFailed = verificationDatabase();
  addCheck(latestFailed, "GSTIN", { createdAt: "2026-09-12 10:00:00" });
  addCheck(latestFailed, "GSTIN", { valid: false, createdAt: "2026-09-13 10:00:00" });
  addCheck(latestFailed, "PAN");
  assert.equal(autoApproveSupplierKyb(latestFailed, "supplier-1").approved, false);
  latestFailed.close();

  const oldNumber = verificationDatabase();
  addCheck(oldNumber, "GSTIN", { number: "29AAACB8781B1Z9" });
  addCheck(oldNumber, "PAN");
  assert.equal(getCashfreeIdentityStatus(oldNumber, supplierRow(oldNumber)).gstin.verified, false);
  assert.equal(autoApproveSupplierKyb(oldNumber, "supplier-1").approved, false);
  oldNumber.close();

  for (const status of ["REJECTED", "SUSPENDED"]) {
    const decided = verificationDatabase({ status });
    addCheck(decided, "GSTIN");
    addCheck(decided, "PAN");
    assert.equal(autoApproveSupplierKyb(decided, "supplier-1").approved, false);
    assert.equal(supplierRow(decided).kyb_status, status);
    decided.close();
  }
});

// A supplier based in a catalogue city abroad (ADR 023).
function abroadDatabase(city, country) {
  const database = verificationDatabase();
  database.exec(`
    ALTER TABLE suppliers ADD COLUMN city TEXT;
    CREATE TABLE destinations (name TEXT, country TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT, product_type TEXT);
  `);
  database.prepare("INSERT INTO destinations VALUES (?, ?)").run(city, country);
  database.prepare("UPDATE suppliers SET city = ?").run(city);
  return database;
}

test("a Thai supplier is approved by hand from Thai documents, never from an Indian PAN or Cashfree (ADR 023)", async () => {
  const database = abroadDatabase("Bangkok", "Thailand");
  const readiness = () => getKybApprovalReadiness(database, supplierRow(database));
  assert.equal(readiness().country, "Thailand");
  assert.equal(readiness().cashfree, false);
  assert.equal(readiness().identity, null);
  assert.deepEqual(readiness().missingDocuments, [
    "Company registration certificate (DBD affidavit)",
    "TAT tour operator licence",
    "Passport or Thai ID of the authorised director",
  ], "no PAN or Indian transport licence; no vehicle document until they list a transfer");

  // Verified GSTIN and PAN on file do not approve a supplier abroad, by hand or automatically.
  addCheck(database, "GSTIN");
  addCheck(database, "PAN");
  assert.equal(autoApproveSupplierKyb(database, "supplier-1").approved, false);
  assert.throws(
    () => saveSupplierVerification(database, { supplierId: "supplier-1", action: "APPROVED" }),
    (error) => error.status === 409 && /Missing: Company registration/.test(error.message) && !/Cashfree/.test(error.message),
  );

  await addDocument(database, "th-1", "COMPANY_REGISTRATION");
  await addDocument(database, "th-2", "TOUR_OPERATOR_LICENSE");
  await addDocument(database, "th-3", "DIRECTOR_ID");
  assert.equal(readiness().canApprove, true);

  database.prepare("INSERT INTO products VALUES ('p-1', 'supplier-1', 'TRANSFER')").run();
  assert.deepEqual(readiness().missingDocuments, ["Commercial vehicle registration or public transport permit"], "a transfer supplier also needs its vehicle papers");
  await addDocument(database, "th-4", "VEHICLE_REGISTRATION");
  const result = saveSupplierVerification(database, { supplierId: "supplier-1", action: "APPROVED" });
  assert.equal(result.supplier.kyb_status, "APPROVED");
  assert.equal(result.supplier.kyb_approval_source, "ADMIN");
  database.close();
});

test("a UAE supplier needs a trade licence, DTCM licence and owner's ID; the manager's ID is optional (ADR 024)", async () => {
  const database = abroadDatabase("Dubai", "United Arab Emirates");
  const readiness = () => getKybApprovalReadiness(database, supplierRow(database));
  assert.deepEqual(readiness().missingDocuments, ["Trade licence", "DTCM tour operator licence", "Owner's passport or Emirates ID"]);
  assert.equal(readiness().cashfree, false);
  assert.ok(readiness().documentTypes.some(type => type.docType === "MANAGER_ID"));
  await addDocument(database, "ae-1", "TRADE_LICENSE");
  await addDocument(database, "ae-2", "TOUR_OPERATOR_LICENSE");
  await addDocument(database, "ae-3", "OWNER_ID");
  assert.equal(readiness().canApprove, true);
  database.prepare("INSERT INTO products VALUES ('ae-transfer', 'supplier-1', 'TRANSFER')").run();
  assert.deepEqual(readiness().missingDocuments, ["RTA vehicle permit"], "a transfer supplier also needs the RTA permit");
  database.close();
});

test("a Singapore supplier needs ACRA, STB and a director's ID, and an LTA permit for transfers (ADR 024)", async () => {
  const database = abroadDatabase("Singapore", "Singapore");
  const readiness = () => getKybApprovalReadiness(database, supplierRow(database));
  assert.deepEqual(readiness().missingDocuments, ["ACRA BizFile company profile", "STB travel agent licence", "Director's passport or NRIC"]);
  for (const [id, type] of [["sg-1", "COMPANY_REGISTRATION"], ["sg-2", "TOUR_OPERATOR_LICENSE"], ["sg-3", "DIRECTOR_ID"]]) await addDocument(database, id, type);
  assert.equal(readiness().canApprove, true);
  database.prepare("INSERT INTO products VALUES ('sg-transfer', 'supplier-1', 'TRANSFER')").run();
  assert.deepEqual(readiness().missingDocuments, ["LTA vehicle licence or permit"]);
  database.close();
});

test("an Indonesian supplier needs NIB, TDUP and a director's ID, and a vehicle paper for transfers (ADR 024)", async () => {
  const database = abroadDatabase("Bali", "Indonesia");
  const readiness = () => getKybApprovalReadiness(database, supplierRow(database));
  assert.deepEqual(readiness().missingDocuments, ["NIB business registration", "Tourism business licence (TDUP)", "Director's passport or KTP"]);
  for (const [id, type] of [["id-1", "COMPANY_REGISTRATION"], ["id-2", "TOUR_OPERATOR_LICENSE"], ["id-3", "DIRECTOR_ID"]]) await addDocument(database, id, type);
  assert.equal(readiness().canApprove, true);
  database.prepare("INSERT INTO products VALUES ('id-transfer', 'supplier-1', 'TRANSFER')").run();
  assert.deepEqual(readiness().missingDocuments, ["Vehicle registration (STNK) or transport permit"]);
  database.close();
});

test("a Maldives supplier needs registration, a tourism licence and a director's ID, and a vessel or vehicle paper for transfers (ADR 024)", async () => {
  const database = abroadDatabase("Malé", "Maldives");
  const readiness = () => getKybApprovalReadiness(database, supplierRow(database));
  assert.deepEqual(readiness().missingDocuments, ["Business registration certificate", "Ministry of Tourism tour operator or travel agency licence", "Director's passport or Maldivian ID"]);
  for (const [id, type] of [["mv-1", "COMPANY_REGISTRATION"], ["mv-2", "TOUR_OPERATOR_LICENSE"], ["mv-3", "DIRECTOR_ID"]]) await addDocument(database, id, type);
  database.prepare("INSERT INTO products VALUES ('mv-transfer', 'supplier-1', 'TRANSFER')").run();
  assert.deepEqual(readiness().missingDocuments, ["Vessel or vehicle registration (Transport Authority)"]);
  database.close();
});

test("a Bhutan supplier needs a tour operator certificate, trade licence and director's ID, and an RSTA paper for transfers (ADR 024)", async () => {
  const database = abroadDatabase("Paro", "Bhutan");
  const readiness = () => getKybApprovalReadiness(database, supplierRow(database));
  assert.deepEqual(readiness().missingDocuments, ["Department of Tourism licensed tour operator certificate", "Trade licence", "Director's CID or passport"]);
  for (const [id, type] of [["bt-1", "TOUR_OPERATOR_LICENSE"], ["bt-2", "TRADE_LICENSE"], ["bt-3", "DIRECTOR_ID"]]) await addDocument(database, id, type);
  database.prepare("INSERT INTO products VALUES ('bt-transfer', 'supplier-1', 'TRANSFER')").run();
  assert.deepEqual(readiness().missingDocuments, ["RSTA vehicle registration or permit"]);
  database.close();
});

test("a Japan supplier needs registration, a travel agency certificate and a director's ID, and a green-plate permit for transfers (ADR 024)", async () => {
  const database = abroadDatabase("Kyoto", "Japan");
  const readiness = () => getKybApprovalReadiness(database, supplierRow(database));
  assert.deepEqual(readiness().missingDocuments, ["Certificate of company registration (tōki)", "Travel Agency Registration certificate", "Representative director's passport or residence card"]);
  for (const [id, type] of [["jp-1", "COMPANY_REGISTRATION"], ["jp-2", "TOUR_OPERATOR_LICENSE"], ["jp-3", "DIRECTOR_ID"]]) await addDocument(database, id, type);
  database.prepare("INSERT INTO products VALUES ('jp-transfer', 'supplier-1', 'TRANSFER')").run();
  assert.deepEqual(readiness().missingDocuments, ["Passenger transport business permit (green plate)"]);
  database.close();
});

test("a Vietnam supplier needs registration, an international travel licence and a representative's ID, and a transport licence for transfers (ADR 024)", async () => {
  const database = abroadDatabase("Da Nang", "Vietnam");
  const readiness = () => getKybApprovalReadiness(database, supplierRow(database));
  assert.deepEqual(readiness().missingDocuments, ["Enterprise Registration Certificate", "International Travel Service Business Licence", "Legal representative's passport or CCCD"]);
  for (const [id, type] of [["vn-1", "COMPANY_REGISTRATION"], ["vn-2", "TOUR_OPERATOR_LICENSE"], ["vn-3", "DIRECTOR_ID"]]) await addDocument(database, id, type);
  database.prepare("INSERT INTO products VALUES ('vn-transfer', 'supplier-1', 'TRANSFER')").run();
  assert.deepEqual(readiness().missingDocuments, ["Road transport business licence"]);
  database.close();
});

test("a Nepal supplier needs OCR registration, a tourism licence, PAN/VAT and a director's ID, and a route permit for transfers (ADR 024)", async () => {
  const database = abroadDatabase("Pokhara", "Nepal");
  const readiness = () => getKybApprovalReadiness(database, supplierRow(database));
  assert.deepEqual(readiness().missingDocuments, ["Company registration certificate (OCR)", "Department of Tourism travel or trekking agency licence", "Nepal PAN/VAT registration certificate", "Director's citizenship certificate or passport"]);
  for (const [id, type] of [["np-1", "COMPANY_REGISTRATION"], ["np-2", "TOUR_OPERATOR_LICENSE"], ["np-3", "TAX_REGISTRATION"], ["np-4", "DIRECTOR_ID"]]) await addDocument(database, id, type);
  database.prepare("INSERT INTO products VALUES ('np-transfer', 'supplier-1', 'TRANSFER')").run();
  assert.deepEqual(readiness().missingDocuments, ["DoTM vehicle route permit"]);
  database.close();
});

test("a supplier from a country without a document list needs at least one uploaded document", async () => {
  const database = abroadDatabase("Beijing", "China");
  assert.deepEqual(getKybApprovalReadiness(database, supplierRow(database)).missingDocuments, ["At least one business document from China"]);
  await addDocument(database, "cn-1", "COMPANY_REGISTRATION");
  assert.equal(getKybApprovalReadiness(database, supplierRow(database)).canApprove, true);
  database.close();
});

test("simulated Cashfree answers never approve a supplier in production", (t) => {
  const previous = process.env.NODE_ENV;
  t.after(() => { process.env.NODE_ENV = previous; });
  process.env.NODE_ENV = "production";

  const database = verificationDatabase();
  addCheck(database, "GSTIN", { simulated: true });
  addCheck(database, "PAN", { simulated: true });
  assert.equal(autoApproveSupplierKyb(database, "supplier-1").approved, false);
  assert.equal(supplierRow(database).kyb_status, "PENDING");
  database.close();
});

test("KYB file references cannot point outside the private folder", async () => {
  assert.equal(kybFileName("kyb-file://../../etc/passwd"), null);
  assert.equal(kybFileName("/uploads/../secret.pdf"), null);
  assert.equal(kybFileName("https://example.com/docs/uploaded.pdf"), null);
  assert.equal(resolveKybFilePath("kyb-file://kyb_missing.pdf"), null);

  const stored = await saveKybFile(Buffer.from("%PDF-1.4"), "application/pdf");
  assert.match(stored.url, /^kyb-file:\/\/kyb_\d+_[0-9a-f]+\.pdf$/);
  assert.equal(resolveKybFilePath(stored.url), path.join(kybFilesDir, stored.filename));
  await assert.rejects(saveKybFile(Buffer.from("<html>"), "text/html"), /PDF, PNG, JPG or WEBP/);
});

test("PostgreSQL verification SQL gives the optional parameters a column type", () => {
  const translated = translateSqliteSql(UPDATE_SUPPLIER_VERIFICATION_SQL);
  assert.match(translated, /commission_override_rate = COALESCE\(\$4, commission_override_rate\)/);
  assert.match(translated, /kyb_approval_source = COALESCE\(\$5, kyb_approval_source\)/);
  assert.doesNotMatch(translated, /\$\d+ IS NULL/);
});
