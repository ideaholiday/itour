import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { translateSqliteSql } from "../src/postgresSyncDb.js";
import {
  saveSupplierVerification,
  UPDATE_SUPPLIER_VERIFICATION_SQL,
} from "../src/services/supplierVerificationService.js";

function verificationDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY, company_name TEXT, kyb_status TEXT,
      is_verified INTEGER DEFAULT 0, commission_rate REAL,
      commission_override_rate REAL
    );
    CREATE TABLE kyb_documents (
      id TEXT PRIMARY KEY, supplier_id TEXT, status TEXT,
      rejection_reason TEXT, verified_at TEXT
    );
    INSERT INTO suppliers VALUES ('supplier-1', 'Test Supplier', 'PENDING', 0, 18, NULL);
    INSERT INTO kyb_documents VALUES ('document-1', 'supplier-1', 'PENDING', NULL, NULL);
  `);
  return database;
}

test("supplier approval atomically verifies the supplier and its KYB documents", () => {
  const database = verificationDatabase();
  const result = saveSupplierVerification(database, {
    supplierId: "supplier-1",
    action: "APPROVED",
    commissionRate: 16,
  });

  assert.equal(result.supplier.kyb_status, "APPROVED");
  assert.equal(result.supplier.is_verified, 1);
  assert.equal(result.supplier.commission_rate, 16);
  assert.equal(result.supplier.commission_override_rate, 16);
  assert.equal(database.prepare("SELECT status FROM kyb_documents").get().status, "APPROVED");
  database.close();
});

test("supplier rejection requires and records a reason", () => {
  const database = verificationDatabase();
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
  database.close();
});

test("PostgreSQL verification SQL gives the optional commission parameter a column type", () => {
  const translated = translateSqliteSql(UPDATE_SUPPLIER_VERIFICATION_SQL);
  assert.match(translated, /commission_override_rate = COALESCE\(\$4, commission_override_rate\)/);
  assert.doesNotMatch(translated, /\$\d+ IS NULL/);
});
