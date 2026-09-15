import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { resolveCommissionRate } from "../src/services/financeService.js";
import {
  clearCommissionOverrides,
  listCommissionChanges,
  listCommissionOverrides,
  recordPlatformCommissionChange,
  setProductCommission,
  setSupplierCommission,
} from "../src/services/commissionService.js";

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, company_name TEXT, contact_name TEXT, email TEXT, phone TEXT, kyb_status TEXT, commission_rate REAL DEFAULT 18, commission_override_rate REAL);
    CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT, title TEXT);
    INSERT INTO users VALUES ('usr_admin', 'Asha Admin');
    INSERT INTO suppliers (id, company_name, kyb_status, commission_override_rate) VALUES ('sup_goa', 'Goa Cabs', 'APPROVED', 18), ('sup_new', 'New Tours', 'APPROVED', NULL);
    INSERT INTO products VALUES ('prd_cab', 'sup_goa', 'Airport cab'), ('prd_tour', 'sup_goa', 'Old Goa tour'), ('prd_new', 'sup_new', 'Dolphin trip');
  `);
  executeMigrationSql(db, upSql("037_program_settings.sql"));
  executeMigrationSql(db, upSql("038_product_commission.sql"));
  return db;
}

test("an approval-time supplier override keeps a supplier off the 30% default until it is cleared", () => {
  const db = database();
  assert.equal(resolveCommissionRate(db, "sup_goa", "prd_cab"), 18);
  assert.equal(resolveCommissionRate(db, "sup_new", "prd_new"), 30);

  const overrides = listCommissionOverrides(db);
  assert.equal(overrides.defaultRatePercent, 30);
  assert.deepEqual(overrides.suppliers.map((s) => [s.id, s.rate]), [["sup_goa", 18]]);

  const result = clearCommissionOverrides(db, { actorId: "usr_admin", reason: "Launch: everyone on 30%", notify: false });
  assert.deepEqual([result.clearedSuppliers, result.clearedProducts], [1, 0]);
  assert.equal(resolveCommissionRate(db, "sup_goa", "prd_cab"), 30);
  const [change] = listCommissionChanges(db);
  assert.deepEqual([change.scope, change.supplier_id, change.old_rate, change.new_rate, change.notify, change.reason, change.changed_by_name],
    ["SUPPLIER", "sup_goa", 18, 30, 0, "Launch: everyone on 30%", "Asha Admin"], "the old rate is kept, and the launch change sends no notice");
});

test("a product override beats the supplier's rate and is recorded with a notice", () => {
  const db = database();
  const set = setProductCommission(db, { productId: "prd_cab", rate: 22.5, actorId: "usr_admin", reason: "High-volume airport route" });
  assert.deepEqual([set.override, set.rate, set.change.oldRate, set.change.newRate, set.change.notify], [22.5, 22.5, 18, 22.5, true]);
  assert.equal(resolveCommissionRate(db, "sup_goa", "prd_tour"), 18, "other products keep the supplier rate");

  const cleared = setProductCommission(db, { productId: "prd_cab", rate: null, actorId: "usr_admin", reason: "Back to supplier rate" });
  assert.deepEqual([cleared.override, cleared.rate], [null, 18]);

  assert.equal(setProductCommission(db, { productId: "prd_cab", rate: null, reason: "No-op" }).change, null, "nothing changed, nothing recorded");
  assert.equal(listCommissionChanges(db).length, 2);
});

test("a supplier override change notifies only when the rate the supplier pays moves", () => {
  const db = database();
  const set = setSupplierCommission(db, { supplierId: "sup_new", rate: 30, actorId: "usr_admin", reason: "Pin to 30% by contract" });
  assert.equal(set.rate, 30);
  assert.equal(set.change.notify, false, "30% before and after: recorded, no notice");
  assert.equal(setSupplierCommission(db, { supplierId: "sup_new", rate: 25, reason: "Partner deal" }).change.notify, true);
});

test("invalid rates, missing reasons and unknown records are refused", () => {
  const db = database();
  const refuse = (work, status, code) => assert.throws(work, (error) => error.status === status && (!code || error.code === code));
  refuse(() => setProductCommission(db, { productId: "prd_cab", rate: 51, reason: "Too high" }), 400, "INVALID_RATE");
  refuse(() => setProductCommission(db, { productId: "prd_cab", rate: -1, reason: "Negative" }), 400, "INVALID_RATE");
  refuse(() => setSupplierCommission(db, { supplierId: "sup_goa", rate: 20, reason: " " }), 400, "REASON_REQUIRED");
  refuse(() => setProductCommission(db, { productId: "nope", rate: 20, reason: "Missing" }), 404);
  refuse(() => clearCommissionOverrides(db, { reason: "" }), 400, "REASON_REQUIRED");
  assert.equal(listCommissionChanges(db).length, 0);
});

test("clearing can include product overrides, and a platform change is recorded once", () => {
  const db = database();
  setProductCommission(db, { productId: "prd_new", rate: 20, reason: "Trial rate", notify: false });
  const result = clearCommissionOverrides(db, { includeProducts: true, actorId: "usr_admin", reason: "Everyone on the default" });
  assert.deepEqual([result.clearedSuppliers, result.clearedProducts], [1, 1]);
  assert.equal(resolveCommissionRate(db, "sup_new", "prd_new"), 30);

  assert.equal(recordPlatformCommissionChange(db, { oldRate: 30, newRate: 30, reason: "Same" }), null);
  const platform = recordPlatformCommissionChange(db, { oldRate: 30, newRate: 28, actorId: "usr_admin", reason: "Festival season" });
  assert.deepEqual([platform.scope, platform.notify], ["PLATFORM", true]);
});
