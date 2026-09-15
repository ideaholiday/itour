import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { recordAffiliateBooking } from "../src/services/affiliateService.js";
import { updateSettings } from "../src/services/programSettingsService.js";
import { listAffiliateRateChanges, listAffiliateTiers, setAffiliateRates, updateAffiliateTier } from "../src/services/affiliateRateService.js";

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, user_id TEXT, amount_inr REAL);
    CREATE TABLE promo_codes (id TEXT PRIMARY KEY, code TEXT UNIQUE, discount_type TEXT, discount_value REAL, is_active INTEGER DEFAULT 1);
  `);
  for (const name of ["027_influencer_affiliate_system.sql", "029_affiliate_program_v2.sql", "037_program_settings.sql", "041_affiliate_rate_controls.sql"]) {
    executeMigrationSql(db, upSql(name));
  }
  db.exec(`
    INSERT INTO users (id, name, email) VALUES ('usr_admin', 'Asha Admin', 'asha@example.test'), ('usr_riya', 'Riya', 'riya@example.test'), ('usr_dev', 'Dev', 'dev@example.test'), ('usr_trav', 'Traveler', 't@example.test');
    INSERT INTO affiliates (id, user_id, affiliate_code, channel_name, commission_rate, traveler_discount_pct, status, tier_code)
      VALUES ('aff_riya', 'usr_riya', 'RIYA5', 'Riya Travels', 0.10, 5, 'ACTIVE', 'STARTER'), ('aff_dev', 'usr_dev', 'DEV5', 'Dev Vlogs', 0.10, 5, 'ACTIVE', 'STARTER');
    INSERT INTO promo_codes (id, code, discount_type, discount_value) VALUES ('p_riya', 'RIYA5', 'PERCENTAGE', 5), ('p_dev', 'DEV5', 'PERCENTAGE', 5);
    INSERT INTO bookings (id, user_id, amount_inr) VALUES ('bk_1', 'usr_trav', 10000), ('bk_2', 'usr_trav', 10000);
  `);
  return db;
}

test("the seeded tiers are flagged over the 10% cap, and a tier edit must fit it", () => {
  const db = database();
  const { tiers, giveawayCapPct } = listAffiliateTiers(db);
  assert.equal(giveawayCapPct, 10);
  assert.deepEqual(tiers.map((t) => [t.code, t.commissionPct, t.travelerDiscountPct, t.overCap, t.creators]),
    [["STARTER", 10, 5, true, 2], ["RISING", 12, 5, true, 0], ["ELITE", 15, 7, true, 0]]);

  assert.throws(() => updateAffiliateTier(db, "STARTER", { commissionPct: 8, travelerDiscountPct: 5 }, { reason: "Too much" }), (e) => e.code === "OVER_GIVEAWAY_CAP");
  assert.throws(() => updateAffiliateTier(db, "STARTER", { commissionPct: 6 }, { reason: "" }), (e) => e.code === "REASON_REQUIRED");
  assert.throws(() => updateAffiliateTier(db, "STARTER", { commissionPct: 70 }, { reason: "Bad" }), (e) => e.code === "INVALID_RATE");
  assert.throws(() => updateAffiliateTier(db, "NOPE", { commissionPct: 6 }, { reason: "Missing" }), (e) => e.status === 404);
});

test("a tier change syncs its creators' rates and coupon discount, for new bookings only", () => {
  const db = database();
  assert.equal(recordAffiliateBooking(db, { bookingId: "bk_1", affiliateCode: "RIYA5", amountInr: 10000 }).earningInr, 1000);

  const result = updateAffiliateTier(db, "STARTER", { commissionPct: 7, travelerDiscountPct: 3 }, { actorId: "usr_admin", reason: "Fit the 10% cap" });
  assert.deepEqual([result.tier.commissionPct, result.tier.travelerDiscountPct, result.tier.overCap], [7, 3, false]);
  assert.deepEqual(result.affected.map((a) => a.affiliateId).sort(), ["aff_dev", "aff_riya"], "both creators are told");
  assert.deepEqual(db.prepare("SELECT commission_rate, traveler_discount_pct FROM affiliates WHERE id = 'aff_riya'").get(), { commission_rate: 0.07, traveler_discount_pct: 3 });
  assert.equal(db.prepare("SELECT discount_value FROM promo_codes WHERE code = 'RIYA5'").get().discount_value, 3);

  assert.equal(recordAffiliateBooking(db, { bookingId: "bk_2", affiliateCode: "RIYA5", amountInr: 10000 }).earningInr, 700);
  assert.equal(db.prepare("SELECT earning_inr FROM affiliate_referrals WHERE booking_id = 'bk_1'").get().earning_inr, 1000, "accrued commission keeps its rate");

  const [change] = listAffiliateRateChanges(db);
  assert.deepEqual([change.scope, change.tierCode, change.after.commissionPct, change.reason, change.changedByName], ["TIER", "STARTER", 7, "Fit the 10% cap", "Asha Admin"]);
});

test("a creator's own rates beat their tier's, must fit the cap, and can be cleared", () => {
  const db = database();
  updateAffiliateTier(db, "STARTER", { commissionPct: 6, travelerDiscountPct: 3 }, { reason: "Fit the cap" });

  assert.throws(() => setAffiliateRates(db, "aff_dev", { commissionPct: 9 }, { reason: "Deal" }), (e) => e.code === "OVER_GIVEAWAY_CAP", "9% + tier's 3% = 12%");
  const deal = setAffiliateRates(db, "aff_dev", { commissionPct: 7 }, { actorId: "usr_admin", reason: "Top creator deal" });
  assert.deepEqual([deal.commissionPct, deal.travelerDiscountPct, deal.commissionOverridden, deal.discountOverridden, deal.affected.length], [7, 3, true, false, 1]);
  assert.equal(recordAffiliateBooking(db, { bookingId: "bk_1", affiliateCode: "DEV5", amountInr: 10000 }).earningInr, 700);
  const discountDeal = setAffiliateRates(db, "aff_dev", { travelerDiscountPct: 2 }, { reason: "Smaller audience discount" });
  assert.deepEqual([discountDeal.commissionPct, discountDeal.travelerDiscountPct], [7, 2], "unchanged fields keep their override");
  assert.equal(db.prepare("SELECT discount_value FROM promo_codes WHERE code = 'DEV5'").get().discount_value, 2);
  setAffiliateRates(db, "aff_dev", { travelerDiscountPct: null }, { reason: "Back to tier discount" });

  // Dev keeps 7% commission; a tier discount of 8% would take them to 15%, so the tier change is refused.
  assert.throws(() => updateAffiliateTier(db, "STARTER", { commissionPct: 2, travelerDiscountPct: 8 }, { reason: "Swap" }), (e) => e.code === "OVER_GIVEAWAY_CAP" && /Dev Vlogs/.test(e.message));

  const cleared = setAffiliateRates(db, "aff_dev", { commissionPct: null, travelerDiscountPct: null }, { reason: "Deal ended" });
  assert.deepEqual([cleared.commissionPct, cleared.travelerDiscountPct, cleared.commissionOverridden], [6, 3, false]);

  // Lowering the cap does not rewrite rates, but the tier list shows what no longer fits.
  updateSettings(db, "referral", { enabled: false }, { reason: "Isolate the test" });
  updateSettings(db, "giveaway", { maxBookingValuePct: 8 }, { reason: "Tighter" });
  assert.equal(listAffiliateTiers(db).tiers.find((t) => t.code === "STARTER").overCap, true);
});
