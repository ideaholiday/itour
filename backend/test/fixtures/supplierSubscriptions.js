import fs from "node:fs";
import { executeMigrationSql } from "../../src/services/migrationRunner.js";

const migration = fs.readFileSync(new URL("../../migrations/039_supplier_subscriptions.sql", import.meta.url), "utf8").split("-- @down")[0];

/**
 * Applies migration 039 from the real file to a hand-built fixture. Call it
 * after the fixture inserts its suppliers: suppliers registered before
 * 2026-09-14 (or with no created_at) become exempt, as in production.
 */
export function applySupplierSubscriptionMigration(db) {
  const columns = db.prepare("PRAGMA table_info(suppliers)").all().map((column) => column.name);
  if (!columns.includes("created_at")) db.exec("ALTER TABLE suppliers ADD COLUMN created_at TEXT");
  executeMigrationSql(db, migration);
  return db;
}
