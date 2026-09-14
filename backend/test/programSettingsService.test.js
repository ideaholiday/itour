import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import {
  checkProgramLimits,
  clearProgramSettingsCache,
  getSettings,
  giveawayBudgetInr,
  listPrograms,
  listSettingsAudit,
  updateSettings,
} from "../src/services/programSettingsService.js";

const migration = fs.readFileSync(new URL("../migrations/037_program_settings.sql", import.meta.url), "utf8");

function database({ migrate = true } = {}) {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)");
  db.prepare("INSERT INTO users (id, name) VALUES ('usr_admin', 'Asha Admin')").run();
  if (migrate) executeMigrationSql(db, migration.split("-- @down")[0]);
  return db;
}

test("defaults apply until an admin saves a change, even before the migration", () => {
  assert.deepEqual(getSettings(database({ migrate: false }), "giveaway"), { maxBookingValuePct: 10 });
  const db = database();
  assert.deepEqual(getSettings(db, "giveaway"), { maxBookingValuePct: 10 });
  assert.deepEqual(listPrograms(db).find((p) => p.key === "giveaway"), {
    key: "giveaway", label: "Giveaway cap", settings: { maxBookingValuePct: 10 }, defaults: { maxBookingValuePct: 10 }, updatedAt: null, updatedBy: null,
  });
  assert.throws(() => getSettings(db, "nope"), (error) => error.status === 404);
});

test("a change is validated, audited with its reason, and read back at once", () => {
  const db = database();
  assert.equal(getSettings(db, "giveaway").maxBookingValuePct, 10, "warms the cache");

  const result = updateSettings(db, "giveaway", { maxBookingValuePct: 8 }, { actorId: "usr_admin", reason: "Tighter launch budget" });
  assert.equal(result.changed, true);
  assert.equal(getSettings(db, "giveaway").maxBookingValuePct, 8, "saving clears the cache");

  const [entry] = listSettingsAudit(db, { key: "giveaway" });
  assert.deepEqual([entry.before, entry.after, entry.changedByName, entry.reason], [{ maxBookingValuePct: 10 }, { maxBookingValuePct: 8 }, "Asha Admin", "Tighter launch budget"]);
  assert.equal(listPrograms(db)[0].updatedBy, "usr_admin");

  assert.equal(updateSettings(db, "giveaway", { maxBookingValuePct: 8 }, { reason: "Same again" }).changed, false);
  assert.equal(listSettingsAudit(db).length, 1, "a change that alters nothing writes nothing");
});

test("invalid changes are refused and leave the settings alone", () => {
  const db = database();
  const refuse = (patch, options, code) => assert.throws(() => updateSettings(db, "giveaway", patch, options), (error) => error.status === 400 && error.code === code);
  refuse({ maxBookingValuePct: 8 }, { reason: "" }, "REASON_REQUIRED");
  refuse({ maxBookingValuePct: 60 }, { reason: "Too generous" }, "INVALID_SETTINGS");
  refuse({ maxBookingValuePct: "8" }, { reason: "Wrong type" }, "INVALID_SETTINGS");
  refuse({ surprise: true }, { reason: "Unknown field" }, "INVALID_SETTINGS");
  assert.equal(getSettings(db, "giveaway").maxBookingValuePct, 10);
  assert.equal(listSettingsAudit(db).length, 0);
});

test("a stored value that no longer validates falls back to the defaults", () => {
  const db = database();
  db.prepare("INSERT INTO program_settings (key, value_json) VALUES ('giveaway', '{\"maxBookingValuePct\": 900}')").run();
  clearProgramSettingsCache(db);
  assert.equal(getSettings(db, "giveaway").maxBookingValuePct, 10);
});

test("the giveaway budget is the set share of the booking, never more than its commission", () => {
  const db = database();
  assert.equal(giveawayBudgetInr(db, { bookingValueInr: 10_000, commissionInr: 3_000 }), 1_000);
  assert.equal(giveawayBudgetInr(db, { bookingValueInr: 10_000, commissionInr: 400 }), 400);
  updateSettings(db, "referral", { friendDiscountPct: 5, referrerRewardPct: 5 }, { reason: "Make room" });
  updateSettings(db, "giveaway", { maxBookingValuePct: 5 }, { reason: "Halve it" });
  assert.equal(giveawayBudgetInr(db, { bookingValueInr: 10_000, commissionInr: 3_000 }), 500);
});

test("referral rates must fit the giveaway cap at the highest commission in use", () => {
  const db = database();
  const refused = (key, patch) => assert.throws(() => updateSettings(db, key, patch, { reason: "Try it" }), (error) => error.code === "OVER_GIVEAWAY_CAP");

  // Default 10% + 10% of a 30% commission is 6% of the booking: fits 10%.
  refused("referral", { friendDiscountPct: 20, referrerRewardPct: 20 }); // 12% of the booking
  refused("giveaway", { maxBookingValuePct: 5 }); // the existing rates no longer fit
  updateSettings(db, "commission", { defaultRatePercent: 50 }, { reason: "Test the edge" }); // 20% of 50% = 10%: fits
  assert.equal(getSettings(db, "commission").defaultRatePercent, 50, "10% of the booking is exactly the cap");
  refused("referral", { friendDiscountPct: 11 });

  // Pausing the program lifts the rule; its rates no longer give anything away.
  updateSettings(db, "referral", { enabled: false }, { reason: "Pause" });
  assert.equal(updateSettings(db, "giveaway", { maxBookingValuePct: 2 }, { reason: "Tight" }).changed, true);

  // A supplier or product override counts as commission in use.
  const withOverrides = database();
  withOverrides.exec("CREATE TABLE suppliers (id TEXT, commission_override_rate REAL); INSERT INTO suppliers VALUES ('s1', 45)");
  assert.match(checkProgramLimits(withOverrides, { referral: { ...getSettings(withOverrides, "referral"), friendDiscountPct: 13 } }), /45% commission/);
  assert.equal(checkProgramLimits(withOverrides, {}, { commissionRate: 50 }), null);
});
