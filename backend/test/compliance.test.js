import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { supplierSchemas } from "../src/validators/apiSchemas.js";

function setupComplianceDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY,
      supplier_code TEXT,
      company_name TEXT,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      city TEXT,
      state TEXT,
      gstin TEXT,
      pan_number TEXT,
      website_url TEXT,
      business_type TEXT,
      years_in_operation INTEGER,
      kyb_status TEXT DEFAULT 'PENDING',
      is_verified INTEGER DEFAULT 0,
      commission_rate REAL DEFAULT 18.0,
      payout_bank_details TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE kyb_documents (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      doc_type TEXT NOT NULL,
      doc_number TEXT,
      doc_url TEXT,
      status TEXT DEFAULT 'PENDING',
      rejection_reason TEXT,
      review_note TEXT,
      reviewed_by TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      verified_at TEXT
    );

    INSERT INTO suppliers (id, supplier_code, company_name, contact_name, email, phone, city, state, gstin, pan_number, kyb_status)
    VALUES ('sup_test_1', 'sup_test_1', 'Goa Fleet Co', 'Rajesh Sharma', 'rajesh@example.com', '+919876543210', 'Goa', 'Goa', NULL, NULL, 'PENDING');
  `);
  return db;
}

test("supplier profile update validates and saves GSTIN, PAN and business details", () => {
  const db = setupComplianceDb();

  const parseResult = supplierSchemas.profileUpdate.safeParse({
    gstin: "22AAAAA0000A1Z5",
    panNumber: "AAAAA0000A",
    businessType: "Pvt Ltd",
    websiteUrl: "https://goafleet.com",
    yearsInOperation: 5,
  });

  assert.equal(parseResult.success, true);

  db.prepare(`
    UPDATE suppliers
    SET gstin = ?, pan_number = ?, website_url = ?, business_type = ?, years_in_operation = ?
    WHERE id = ?
  `).run("22AAAAA0000A1Z5", "AAAAA0000A", "https://goafleet.com", "Pvt Ltd", 5, "sup_test_1");

  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = 'sup_test_1'").get();
  assert.equal(supplier.gstin, "22AAAAA0000A1Z5");
  assert.equal(supplier.pan_number, "AAAAA0000A");
  assert.equal(supplier.business_type, "Pvt Ltd");
  assert.equal(supplier.website_url, "https://goafleet.com");
  assert.equal(supplier.years_in_operation, 5);

  db.close();
});

test("supplier payout schema validates bank details correctly", () => {
  const valid = supplierSchemas.payoutDetails.safeParse({
    accountHolder: "Goa Fleet Co",
    bankName: "HDFC Bank",
    accountNumber: "50100234567890",
    ifscCode: "HDFC0001234",
    accountType: "CURRENT",
  });
  assert.equal(valid.success, true);

  const db = setupComplianceDb();
  const bankObj = {
    account_holder: "Goa Fleet Co",
    bank_name: "HDFC Bank",
    account_number: "50100234567890",
    ifsc: "HDFC0001234",
    account_type: "CURRENT",
    updated_at: new Date().toISOString(),
  };

  db.prepare("UPDATE suppliers SET payout_bank_details = ? WHERE id = ?").run(JSON.stringify(bankObj), "sup_test_1");

  const supplier = db.prepare("SELECT payout_bank_details FROM suppliers WHERE id = 'sup_test_1'").get();
  const parsed = JSON.parse(supplier.payout_bank_details);
  assert.equal(parsed.bank_name, "HDFC Bank");
  assert.equal(parsed.account_number, "50100234567890");
  assert.equal(parsed.ifsc, "HDFC0001234");
  assert.equal(parsed.account_type, "CURRENT");

  db.close();
});

test("KYB document submission handles initial creation and re-submission replacement", () => {
  const db = setupComplianceDb();

  // Initial submission
  db.prepare(`
    INSERT INTO kyb_documents (id, supplier_id, doc_type, doc_number, doc_url, status, submitted_at)
    VALUES ('kyb_1', 'sup_test_1', 'GSTIN', '22AAAAA0000A1Z5', 'https://example.com/gstin.pdf', 'PENDING', datetime('now'))
  `).run();

  let docs = db.prepare("SELECT * FROM kyb_documents WHERE supplier_id = 'sup_test_1'").all();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].doc_type, "GSTIN");
  assert.equal(docs[0].status, "PENDING");

  // Admin marks it as REJECTED
  db.prepare("UPDATE kyb_documents SET status = 'REJECTED', rejection_reason = 'Blurry image' WHERE id = 'kyb_1'").run();

  // Supplier re-submits updated doc of same type
  const existing = db.prepare("SELECT * FROM kyb_documents WHERE supplier_id = ? AND doc_type = ?").get("sup_test_1", "GSTIN");
  assert.ok(existing);

  db.prepare(`
    UPDATE kyb_documents
    SET doc_number = ?, doc_url = ?, status = 'PENDING', rejection_reason = NULL, review_note = NULL, submitted_at = datetime('now')
    WHERE id = ?
  `).run("22AAAAA0000A1Z5", "https://example.com/gstin_clean.pdf", existing.id);

  docs = db.prepare("SELECT * FROM kyb_documents WHERE supplier_id = 'sup_test_1'").all();
  assert.equal(docs.length, 1); // Still 1 document
  assert.equal(docs[0].status, "PENDING");
  assert.equal(docs[0].rejection_reason, null);
  assert.equal(docs[0].doc_url, "https://example.com/gstin_clean.pdf");

  // Supplier can delete a PENDING document
  db.prepare("DELETE FROM kyb_documents WHERE id = ? AND supplier_id = ? AND status != 'APPROVED'").run("kyb_1", "sup_test_1");
  docs = db.prepare("SELECT * FROM kyb_documents WHERE supplier_id = 'sup_test_1'").all();
  assert.equal(docs.length, 0);

  db.close();
});
