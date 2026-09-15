import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { updateSettings } from "../src/services/programSettingsService.js";
import { approvedSupplierSql, isSupplierSubscriptionCovered } from "../src/services/supplierKybGate.js";
import {
  ensureLaunchWaiver,
  getSubscriptionStatus,
  grantSubscriptionWaiver,
  listSupplierSubscriptions,
  processSubscriptionLifecycle,
  revokeSubscription,
  syncLaunchWaivers,
} from "../src/services/supplierSubscriptionService.js";

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, company_name TEXT, contact_name TEXT, email TEXT, phone TEXT, city TEXT, kyb_status TEXT, created_at TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT, status TEXT);
    INSERT INTO users VALUES ('usr_admin', 'Asha Admin');
    INSERT INTO suppliers VALUES
      ('sup_old', 'Old Goa Cabs', 'Ravi', 'ravi@example.test', '+919800000001', 'Goa', 'APPROVED', '2026-05-01 10:00:00'),
      ('sup_eve', 'Eve Tours', 'Esha', 'esha@example.test', '+919800000002', 'Goa', 'APPROVED', '2026-09-13 23:59:59'),
      ('sup_new', 'New Dolphin Trips', 'Nikhil', 'nikhil@example.test', '+919800000003', 'Goa', 'APPROVED', '2026-09-14 00:00:01');
    INSERT INTO products VALUES ('prd_old', 'sup_old', 'PUBLISHED'), ('prd_new', 'sup_new', 'PUBLISHED');
  `);
  executeMigrationSql(db, upSql("037_program_settings.sql"));
  executeMigrationSql(db, upSql("039_supplier_subscriptions.sql"));
  return db;
}

const sellable = (db) => db.prepare(`SELECT p.id FROM products p WHERE ${approvedSupplierSql("p")} ORDER BY p.id`).all().map((row) => row.id);

test("suppliers registered before 2026-09-14 are exempt; a new one needs cover to sell", () => {
  const db = database();
  assert.deepEqual(db.prepare("SELECT id, subscription_exempt FROM suppliers ORDER BY id").all().map((s) => [s.id, s.subscription_exempt]),
    [["sup_eve", 1], ["sup_new", 0], ["sup_old", 1]]);
  assert.deepEqual(sellable(db), ["prd_old"], "the new supplier has no cover yet");
  assert.equal(isSupplierSubscriptionCovered(db, "sup_new"), false);
  assert.deepEqual(getSubscriptionStatus(db, "sup_old"), { supplierId: "sup_old", required: false, exempt: true, covered: true, cover: null, history: [] });
});

test("the launch waiver covers new suppliers with no end date until an admin sets one", () => {
  const db = database();
  assert.deepEqual(syncLaunchWaivers(db), { created: 1, updated: 1 });
  assert.deepEqual(syncLaunchWaivers(db).created, 0, "idempotent");
  assert.equal(ensureLaunchWaiver(db, "sup_old"), null, "exempt suppliers get none");
  assert.deepEqual(sellable(db), ["prd_new", "prd_old"]);
  const status = getSubscriptionStatus(db, "sup_new");
  assert.deepEqual([status.covered, status.cover.source, status.cover.status, status.cover.endsAt], [true, "LAUNCH", "WAIVED", null]);

  // Setting an end date in the past ends every launch waiver.
  updateSettings(db, "supplier_subscriptions", { launchWaiverUntil: "2026-09-01" }, { reason: "Launch offer over" });
  syncLaunchWaivers(db);
  assert.deepEqual(sellable(db), ["prd_old"]);
  assert.equal(getSubscriptionStatus(db, "sup_new").history[0].endsAt, "2026-09-01 23:59:59");

  // A future end date covers the supplier through that whole day.
  updateSettings(db, "supplier_subscriptions", { launchWaiverUntil: "2099-03-31" }, { reason: "Extended" });
  syncLaunchWaivers(db);
  assert.deepEqual(sellable(db), ["prd_new", "prd_old"]);
});

test("with the launch waiver off, new sign-ups get nothing but existing waivers stay", () => {
  const db = database();
  syncLaunchWaivers(db);
  updateSettings(db, "supplier_subscriptions", { launchWaiver: false }, { reason: "Paid plans live" });
  db.prepare("INSERT INTO suppliers (id, company_name, kyb_status, created_at) VALUES ('sup_later', 'Later Tours', 'APPROVED', '2026-10-01 09:00:00')").run();
  assert.equal(ensureLaunchWaiver(db, "sup_later"), null);
  assert.equal(syncLaunchWaivers(db).created, 0);
  assert.equal(isSupplierSubscriptionCovered(db, "sup_later"), false);
  assert.equal(isSupplierSubscriptionCovered(db, "sup_new"), true, "the waiver already given stays");
});

test("an admin waiver covers a supplier until its date and can be ended early", () => {
  const db = database();
  const now = new Date("2026-10-01T10:00:00Z");
  assert.throws(() => grantSubscriptionWaiver(db, { supplierId: "sup_new", until: "2026-12-31", reason: "" }), (e) => e.code === "REASON_REQUIRED");
  assert.throws(() => grantSubscriptionWaiver(db, { supplierId: "sup_new", until: "2026-09-30", reason: "Past", now }), (e) => e.code === "INVALID_DATE");
  assert.throws(() => grantSubscriptionWaiver(db, { supplierId: "sup_new", until: "31/12/2026", reason: "Bad format", now }), (e) => e.code === "INVALID_DATE");
  assert.throws(() => grantSubscriptionWaiver(db, { supplierId: "nope", reason: "Missing", now }), (e) => e.status === 404);

  // Starts now (the bookability check compares against the real clock).
  const waiver = grantSubscriptionWaiver(db, { supplierId: "sup_new", until: "2099-12-31", reason: "Festival partner", actorId: "usr_admin" });
  assert.deepEqual([waiver.status, waiver.source, waiver.ends_at, waiver.granted_by], ["WAIVED", "WAIVER", "2099-12-31 23:59:59", "usr_admin"]);
  assert.equal(isSupplierSubscriptionCovered(db, "sup_new"), true);
  assert.equal(listSupplierSubscriptions(db).find((s) => s.id === "sup_new").history[0].grantedByName, "Asha Admin");

  revokeSubscription(db, { subscriptionId: waiver.id, reason: "Contract ended", actorId: "usr_admin" });
  assert.equal(isSupplierSubscriptionCovered(db, "sup_new"), false);
  assert.throws(() => revokeSubscription(db, { subscriptionId: waiver.id, reason: "Again" }), (e) => e.code === "NOT_ACTIVE");
});

test("lapsed cover expires, and reminders go out once at 30, 7 and 1 days", () => {
  const db = database();
  const start = new Date("2026-10-01T00:00:00Z");
  const waiver = grantSubscriptionWaiver(db, { supplierId: "sup_new", until: "2026-11-30", reason: "Trial", now: start });

  const at = (iso) => processSubscriptionLifecycle(db, { now: new Date(iso) });
  assert.equal(at("2026-10-15T00:00:00Z").reminders.length, 0, "47 days left");
  assert.deepEqual(at("2026-11-01T00:00:00Z").reminders.map((r) => r.subscriptionId), [waiver.id], "30 days left");
  assert.equal(at("2026-11-02T00:00:00Z").reminders.length, 0, "not twice");
  assert.equal(at("2026-11-24T00:00:00Z").reminders.length, 1, "7 days left");
  assert.equal(at("2026-11-30T00:00:00Z").reminders.length, 1, "1 day left");
  assert.equal(at("2026-11-30T12:00:00Z").reminders.length, 0);

  const after = at("2026-12-01T00:00:00Z");
  assert.equal(after.expired, 1);
  assert.equal(db.prepare("SELECT status FROM supplier_subscriptions WHERE id = ?").get(waiver.id).status, "EXPIRED");
});

test("no reminder when a longer cover follows", () => {
  const db = database();
  const now = new Date("2026-10-01T00:00:00Z");
  grantSubscriptionWaiver(db, { supplierId: "sup_new", until: "2026-10-20", reason: "Short", now });
  grantSubscriptionWaiver(db, { supplierId: "sup_new", until: null, reason: "Open-ended partner", now });
  assert.equal(processSubscriptionLifecycle(db, { now: new Date("2026-10-15T00:00:00Z") }).reminders.length, 0);
});
