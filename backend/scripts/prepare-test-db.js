#!/usr/bin/env node
/**
 * Brings the local SQLite database to the state the unit tests expect, so
 * `npm test` passes on a fresh clone and in CI, not only on a developer
 * database that a running server has already migrated and seeded.
 *
 * Idempotent: it applies pending migrations, runs the same demo seed the
 * integration server uses (SEED_DEMO_DATA), and adds the fixture accounts
 * unit tests reference by id. Existing rows are never changed.
 *
 * Runs automatically before `npm test` and `npm run test:coverage`.
 */
import { randomBytes } from "node:crypto";
import db, { databaseInfo } from "../src/db.js";
import { runPendingMigrations } from "../src/services/migrationRunner.js";
import { syncGoaSupplierAndProducts } from "../src/scripts/seedGoaSupplierProducts.js";
import { backfillProductLocationRules } from "../src/data/canonicalLocations.js";
import { backfillProductOptions } from "../src/services/logisticsService.js";
import { hashPassword } from "../src/lib/passwords.js";

if (databaseInfo.engine !== "sqlite" || process.env.NODE_ENV === "production") {
  console.error("prepare-test-db only runs against a non-production SQLite database");
  process.exit(1);
}

const migrations = runPendingMigrations(db);
syncGoaSupplierAndProducts(db);
backfillProductLocationRules(db);
backfillProductOptions(db);

// Accounts unit tests use by id (phase4_features, searchService, ...). Random
// passwords: these are data fixtures, not logins.
const insertUser = db.prepare(
  "INSERT OR IGNORE INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
);
for (const [id, name, email, role] of [
  ["user_traveler", "Test Traveler", "fixture.traveler@example.test", "TRAVELER"],
  ["user_admin", "Test Admin", "fixture.admin@example.test", "ADMIN"],
]) {
  insertUser.run(id, name, email, hashPassword(randomBytes(24).toString("hex")), role);
}

const applied = migrations?.applied?.length ?? 0;
console.log(`test database ready (${databaseInfo.path}; ${applied} migration(s) applied)`);
