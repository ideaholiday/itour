import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";

// Migration 073: made-up driver ratings are cleared; ratings earned from published reviews stay.
test("migration 073 clears placeholder driver ratings and keeps ones earned from reviews", () => {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE supplier_drivers (id TEXT PRIMARY KEY, rating REAL);
    CREATE TABLE reviews (id TEXT PRIMARY KEY, supplier_driver_id TEXT, driver_rating INTEGER, status TEXT);`);
  db.exec(`INSERT INTO supplier_drivers VALUES ('placeholder', 4.9), ('reviewed', 4.0), ('pending_only', 4.9), ('no_rating', NULL);
    INSERT INTO reviews VALUES ('r1', 'reviewed', 4, 'PUBLISHED'), ('r2', 'pending_only', 5, 'PENDING');`);
  const sql = fs.readFileSync(new URL("../migrations/073_clear_placeholder_driver_ratings.sql", import.meta.url), "utf8");
  executeMigrationSql(db, sql.split("-- @down")[0]);
  const ratings = Object.fromEntries(db.prepare("SELECT id, rating FROM supplier_drivers").all().map((row) => [row.id, row.rating]));
  assert.deepEqual(ratings, { placeholder: null, reviewed: 4, pending_only: null, no_rating: null });
});
