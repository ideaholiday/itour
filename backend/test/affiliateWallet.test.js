import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { computeBalances, transferEarningsToWallet } from "../src/services/affiliateService.js";
import { postWalletEntry, reconcileWalletBalance, redeemWalletCredit, restoreWalletCreditForBooking, reverseReferralReward, walletBalances } from "../src/services/referralService.js";
import { applyWalletCreditsToCheckout } from "../src/services/loyaltyService.js";

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, referral_code TEXT, wallet_balance_inr REAL DEFAULT 0);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, status TEXT DEFAULT 'pending_payment', payment_status TEXT DEFAULT 'PENDING',
      amount_inr REAL, commission_amount REAL, refunded_amount REAL DEFAULT 0, refund_amount_inr REAL DEFAULT 0,
      traveler_phone TEXT, traveler_email TEXT, activity_date TEXT, wallet_credit_applied_inr REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE booking_holds (id TEXT PRIMARY KEY, booking_id TEXT, status TEXT, expires_at TEXT);
    CREATE TABLE wallet_transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount_inr REAL NOT NULL,
      balance_after_inr REAL NOT NULL, reference_id TEXT, description TEXT, created_at TEXT
    );
    CREATE TABLE user_referrals (id TEXT PRIMARY KEY, referrer_user_id TEXT NOT NULL, referred_user_id TEXT, referral_code TEXT NOT NULL, reward_inr REAL, status TEXT, booking_id TEXT, created_at TEXT, rewarded_at TEXT);
    CREATE TABLE promo_codes (id TEXT PRIMARY KEY, code TEXT UNIQUE, discount_type TEXT, discount_value REAL);
  `);
  for (const name of ["030_referral_program_v3.sql", "027_influencer_affiliate_system.sql", "029_affiliate_program_v2.sql", "037_program_settings.sql", "041_affiliate_rate_controls.sql", "042_affiliate_wallet_transfers.sql"]) {
    executeMigrationSql(db, upSql(name));
  }
  db.exec(`
    INSERT INTO users (id, name, email) VALUES ('usr_neha', 'Neha', 'neha@example.test'), ('usr_friend', 'Friend', 'f@example.test');
    INSERT INTO affiliates (id, user_id, affiliate_code, channel_name, commission_rate, traveler_discount_pct, status, kyc_status, pan_verified, tier_code)
      VALUES ('aff_neha', 'usr_neha', 'NEHA', 'Neha Wanders', 0.07, 3, 'ACTIVE', 'VERIFIED', 1, 'STARTER');
    INSERT INTO bookings (id, ref, user_id, amount_inr, status, payment_status) VALUES
      ('bk_c1', 'IH-C1', 'usr_friend', 50000, 'completed', 'PAID'), ('bk_c2', 'IH-C2', 'usr_friend', 50000, 'completed', 'PAID');
    INSERT INTO affiliate_referrals (id, affiliate_id, booking_id, attribution_type, booking_amount_inr, commission_rate, earning_inr, status, eligible_at, payable_at)
      VALUES ('ref_1', 'aff_neha', 'bk_c1', 'COUPON_CODE', 50000, 0.07, 3500, 'ELIGIBLE', '2026-01-01 00:00:00', '2026-01-15 00:00:00'),
             ('ref_2', 'aff_neha', 'bk_c2', 'COUPON_CODE', 50000, 0.07, 3500, 'ELIGIBLE', '2026-02-01 00:00:00', '2026-02-15 00:00:00');
  `);
  return db;
}

test("a creator moves cleared earnings into their wallet, less 1% TDS, against a verified PAN", () => {
  const db = database();
  assert.equal(computeBalances(db, "aff_neha").withdrawableInr, 7000);

  db.prepare("UPDATE affiliates SET pan_verified = 0 WHERE id = 'aff_neha'").run();
  assert.throws(() => transferEarningsToWallet(db, "aff_neha", { amountInr: 3500 }), (e) => e.code === "PAN_NOT_VERIFIED");
  db.prepare("UPDATE affiliates SET pan_verified = 1 WHERE id = 'aff_neha'").run();
  assert.throws(() => transferEarningsToWallet(db, "aff_neha", { amountInr: 7001 }), /move up to ₹7,000/);

  const transfer = transferEarningsToWallet(db, "aff_neha", { amountInr: 3500 });
  assert.deepEqual([transfer.grossInr, transfer.tdsInr, transfer.netInr], [3500, 35, 3465]);
  assert.deepEqual([transfer.balances.withdrawableInr, transfer.balances.paidInr, transfer.balances.tdsWithheldInr, transfer.balances.walletTransferredInr], [3500, 3500, 35, 3465]);
  assert.equal(db.prepare("SELECT status FROM affiliate_referrals WHERE id = 'ref_1'").get().status, "PAID", "oldest commission funds it");
  assert.equal(db.prepare("SELECT status FROM affiliate_referrals WHERE id = 'ref_2'").get().status, "ELIGIBLE");

  const credit = db.prepare("SELECT * FROM wallet_transactions WHERE user_id = 'usr_neha'").get();
  assert.deepEqual([credit.entry_type, credit.amount_inr, credit.credit_source, credit.expires_at, credit.remaining_inr], ["AFFILIATE_TRANSFER", 3465, "AFFILIATE", null, 3465]);
  assert.deepEqual(walletBalances(db, "usr_neha"), { totalInr: 3465, affiliateInr: 3465, refundInr: 0, otherInr: 0 });
  assert.ok(reconcileWalletBalance(db, "usr_neha").matches);
});

test("creator earnings pay past the referral wallet cap; referral credit stays within it", () => {
  const db = database();
  transferEarningsToWallet(db, "aff_neha", { amountInr: 7000 }); // ₹6,930 net
  db.transaction(() => postWalletEntry(db, { userId: "usr_neha", entryType: "REFERRAL_CLEARED", amountInr: 3000, expiresAt: "2099-01-01 00:00:00" }))();

  // ₹10,000 booking: referral credit is capped at ₹2,000 (50% / ₹2,000); earnings cover the rest.
  const calc = applyWalletCreditsToCheckout(db, "usr_neha", { bookingAmountInr: 10000 });
  assert.deepEqual([calc.creditDiscountInr, calc.maxFromOtherInr], [8930, 2000], "₹2,000 referral credit + all ₹6,930 of earnings");

  db.prepare("INSERT INTO bookings (id, ref, user_id, amount_inr, wallet_credit_applied_inr) VALUES ('bk_spend', 'IH-SPEND', 'usr_neha', 1070, 8930)").run();
  const spent = db.transaction(() => redeemWalletCredit(db, { userId: "usr_neha", bookingId: "bk_spend", amountInr: 8930, maxFromOtherInr: calc.maxFromOtherInr }))();
  assert.equal(spent.affiliateInr, 6930);
  assert.deepEqual(walletBalances(db, "usr_neha"), { totalInr: 1000, affiliateInr: 0, refundInr: 0, otherInr: 1000 }, "only ₹2,000 of the ₹3,000 referral credit was used");
  assert.equal(db.prepare("SELECT affiliate_inr FROM wallet_transactions WHERE booking_id = 'bk_spend' AND entry_type = 'REDEMPTION'").get().affiliate_inr, 6930);

  // Cancelled before payment: each part comes back as the kind of credit it was.
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = 'bk_spend'").run();
  restoreWalletCreditForBooking(db, "bk_spend");
  const restored = db.prepare("SELECT entry_type, amount_inr, expires_at, credit_source FROM wallet_transactions WHERE booking_id = 'bk_spend' AND amount_inr > 0 ORDER BY entry_type").all();
  assert.deepEqual(restored.map((row) => [row.entry_type, row.amount_inr, row.credit_source, row.expires_at === null]),
    [["AFFILIATE_RESTORED", 6930, "AFFILIATE", true], ["REDEMPTION_RESTORED", 2000, null, false]]);
  assert.deepEqual(walletBalances(db, "usr_neha"), { totalInr: 9930, affiliateInr: 6930, refundInr: 0, otherInr: 3000 });
  assert.ok(reconcileWalletBalance(db, "usr_neha").matches);
});

test("a reversed referral reward never takes a creator's own earnings", () => {
  const db = database();
  transferEarningsToWallet(db, "aff_neha", { amountInr: 3500 });
  db.exec(`
    INSERT INTO referral_relationships (id, referrer_user_id, referred_user_id, referral_code, status, source, established_at, earns_until)
      VALUES ('rel_1', 'usr_neha', 'usr_friend', 'REF-NEHA', 'ACTIVE', 'SIGNUP_LINK', '2026-01-01 00:00:00', '2099-01-01 00:00:00');
    INSERT INTO bookings (id, ref, user_id, amount_inr, status, payment_status) VALUES ('bk_ref', 'IH-REF', 'usr_friend', 10000, 'cancelled', 'REFUNDED');
    INSERT INTO referral_rewards (id, relationship_id, referrer_user_id, referred_user_id, booking_id, sequence, booking_margin_inr, referee_rate, referrer_rate, referee_amount_inr, referrer_amount_inr, status, created_at, cleared_at)
      VALUES ('rw_1', 'rel_1', 'usr_neha', 'usr_friend', 'bk_ref', 1, 3000, 0.1, 0.1, 300, 300, 'CLEARED', '2026-01-01 00:00:00', '2026-01-10 00:00:00');
  `);
  const reversal = reverseReferralReward(db, "bk_ref");
  assert.deepEqual([reversal.recoveredInr, reversal.clawbackInr], [0, 300], "owed from future referral credit instead");
  assert.equal(walletBalances(db, "usr_neha").affiliateInr, 3465);
});
