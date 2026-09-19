import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";

const [up, down] = fs.readFileSync(new URL("../migrations/048_phone_e164.sql", import.meta.url), "utf8").split("-- @down");
const TABLES = { users: "phone", suppliers: "phone", user_profiles: "phone", bookings: "traveler_phone", circuit_orders: "traveler_phone", supplier_drivers: "driver_phone", driver_assignments: "driver_phone" };

function database(values) {
  const db = new Database(":memory:");
  for (const [table, column] of Object.entries(TABLES)) db.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, ${column} TEXT)`);
  const insert = db.prepare("INSERT INTO users (id, phone) VALUES (?, ?)");
  values.forEach((value, index) => insert.run(`u${String(index).padStart(2, "0")}`, value));
  db.prepare("INSERT INTO bookings (id, traveler_phone) VALUES ('b1', '98765 43210')").run();
  db.prepare("INSERT INTO supplier_drivers (id, driver_phone) VALUES ('d1', '+91 98390 33445')").run();
  return db;
}

const phones = (db) => db.prepare("SELECT phone FROM users ORDER BY id").all().map((row) => row.phone);

test("048 converts unambiguous Indian mobiles to +91 and leaves anything uncertain as typed", () => {
  const typed = [
    "9876543210", "98765-43210", "098765 43210", "919876543210", "+91 98765 43210",
    "+66 81 234 5678", "+971-50-123-4567",
    "0812345678", "1234567890", "12345", null, "", "+0 1234",
  ];
  const db = database(typed);
  executeMigrationSql(db, up);
  assert.deepEqual(phones(db), [
    "+919876543210", "+919876543210", "+919876543210", "+919876543210", "+919876543210",
    "+66812345678", "+971501234567",
    // A Thai local number, a non-mobile and junk are not guessed at.
    "0812345678", "1234567890", "12345", null, "", "+0 1234",
  ]);
  assert.equal(db.prepare("SELECT traveler_phone FROM bookings").get().traveler_phone, "+919876543210");
  assert.equal(db.prepare("SELECT driver_phone FROM supplier_drivers").get().driver_phone, "+919839033445");

  executeMigrationSql(db, down);
  assert.deepEqual(phones(db), typed, "@down restores every original value");
  assert.equal(db.prepare("SELECT traveler_phone FROM bookings").get().traveler_phone, "98765 43210");
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'phone_e164_backup'").get(), undefined);
});
