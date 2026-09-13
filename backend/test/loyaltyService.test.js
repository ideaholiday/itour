import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import {
  determineLoyaltyTier,
  ensureUserReferralCode,
  getTravelerLoyaltyProfile,
  applyWalletCreditsToCheckout,
  deductWalletCreditsOnBooking,
  getPublicReferralInfo,
  getLoyaltyLeaderboard,
  LOYALTY_TIERS,
} from "../src/services/loyaltyService.js";
import {
  applyReferralToBooking,
  establishReferralRelationship,
  markReferralTripCompleted,
  processReferralLifecycle,
  reconcileWalletBalance,
} from "../src/services/referralService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration030 = fs.readFileSync(path.join(__dirname, "..", "migrations", "030_referral_program_v3.sql"), "utf8").split("-- @down")[0];

function createTestDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, role TEXT DEFAULT 'TRAVELER',
      referral_code TEXT, wallet_balance_inr REAL DEFAULT 0.0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, activity_date TEXT, amount_inr REAL, commission_amount REAL,
      status TEXT, payment_status TEXT DEFAULT 'PENDING', refunded_amount REAL DEFAULT 0, refund_amount_inr REAL DEFAULT 0,
      traveler_phone TEXT, traveler_email TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE booking_holds (id TEXT PRIMARY KEY, booking_id TEXT, status TEXT, expires_at TEXT);
    CREATE TABLE wallet_transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount_inr REAL NOT NULL,
      balance_after_inr REAL NOT NULL, reference_id TEXT, description TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  executeMigrationSql(database, migration030);
  return database;
}

/** A friend who signed up with `referrerId`'s code and completed one paid trip that has cleared. */
function referredFriendWithTrip(db, { referrerId, code, friendId, bookingId, commission }) {
  const t0 = new Date("2026-09-01T00:00:00Z");
  db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)").run(friendId, `${friendId} Kumar`, `${friendId}@example.com`);
  assert.equal(establishReferralRelationship(db, { referredUserId: friendId, referralCode: code, now: t0 }).established, true);
  db.prepare("INSERT INTO bookings (id, ref, user_id, amount_inr, commission_amount, status) VALUES (?, ?, ?, 3000, ?, 'pending_payment')")
    .run(bookingId, `IH-${bookingId}`, friendId, commission);
  db.transaction(() => applyReferralToBooking(db, { bookingId, userId: friendId, quoteCommissionInr: commission, bookingCommissionInr: commission, now: t0 }))();
  db.prepare("UPDATE bookings SET payment_status = 'PAID', status = 'completed' WHERE id = ?").run(bookingId);
  db.transaction(() => markReferralTripCompleted(db, bookingId, { now: t0 }))();
  processReferralLifecycle(db, { now: new Date("2026-09-09T00:00:00Z") });
}

test("LoyaltyService: tiers count friends who travelled and never change the reward rate", () => {
  assert.equal(determineLoyaltyTier(0).tierKey, "EXPLORER");
  assert.equal(determineLoyaltyTier(2).tierKey, "EXPLORER");
  assert.equal(determineLoyaltyTier(3).tierKey, "VOYAGER");
  assert.equal(determineLoyaltyTier(9).tierKey, "VOYAGER");
  assert.equal(determineLoyaltyTier(10).tierKey, "GLOBE_TROTTER");

  for (const tier of Object.values(LOYALTY_TIERS)) {
    assert.equal(tier.rewardPerFriendInr, undefined, `${tier.name} carries no flat rupee reward`);
    assert.equal(tier.checkoutBonusDiscountPct, undefined, `${tier.name} carries no extra discount`);
  }
});

test("LoyaltyService: referral codes are issued once and never collide", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, referral_code) VALUES ('usr_a_1234', 'Kavita Roy', 'REF-KAVIT1234')").run();
  db.prepare("INSERT INTO users (id, name) VALUES ('usr_b_1234', 'Kavita Rao')").run();

  const code = ensureUserReferralCode(db, db.prepare("SELECT * FROM users WHERE id = 'usr_b_1234'").get());
  assert.match(code, /^REF-KAVIT/);
  assert.notEqual(code, "REF-KAVIT1234");
  assert.equal(ensureUserReferralCode(db, db.prepare("SELECT * FROM users WHERE id = 'usr_b_1234'").get()), code);
  db.close();
});

test("LoyaltyService: profile shows credited rewards, friends who travelled and wallet state", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, email, referral_code) VALUES ('usr_kavita', 'Kavita Roy', 'kavita@example.com', 'REF-KAVITA')").run();
  referredFriendWithTrip(db, { referrerId: "usr_kavita", code: "REF-KAVITA", friendId: "amit", bookingId: "bk_amit", commission: 450 });
  db.prepare("INSERT INTO users (id, name, email) VALUES ('neha', 'Neha Das', 'neha@example.com')").run();
  establishReferralRelationship(db, { referredUserId: "neha", referralCode: "REF-KAVITA" });

  const profile = getTravelerLoyaltyProfile(db, "usr_kavita");
  assert.equal(profile.referralCode, "REF-KAVITA");
  assert.match(profile.referralLink, /\/signup\?ref=REF-KAVITA$/);
  assert.equal(profile.walletBalanceInr, 45);
  assert.equal(profile.totalCreditsEarned, 45);
  assert.equal(profile.pendingCredits, 0);
  assert.equal(profile.friendsInvitedCount, 2);
  assert.equal(profile.successfulReferralsCount, 1);
  assert.equal(profile.tier.tierKey, "EXPLORER");
  assert.equal(profile.referralsToNextTier, 2);
  assert.equal(profile.policy.referrerRewardPct, 10);
  assert.equal(profile.rewards[0].stage, "CREDITED");
  assert.equal(profile.transactions[0].type, "REFERRAL_CLEARED");
  assert.ok(profile.transactions[0].expiresAt);
  db.close();
});

test("LoyaltyService: applyWalletCreditsToCheckout enforces 50% order cap and ₹2000 max limit", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, email, wallet_balance_inr) VALUES ('usr_rich', 'Vikram Patel', 'vikram@example.com', 5000.0)").run();
  db.prepare("INSERT INTO users (id, name, email, wallet_balance_inr) VALUES ('usr_modest', 'Deepak Sen', 'deepak@example.com', 300.0)").run();

  const calc1 = applyWalletCreditsToCheckout(db, "usr_rich", { bookingAmountInr: 1000 });
  assert.equal(calc1.creditDiscountInr, 500);
  assert.equal(calc1.payableAmountInr, 500);

  assert.equal(applyWalletCreditsToCheckout(db, "usr_rich", { bookingAmountInr: 10000 }).creditDiscountInr, 2000);
  assert.equal(applyWalletCreditsToCheckout(db, "usr_modest", { bookingAmountInr: 2000 }).creditDiscountInr, 300);
  assert.equal(applyWalletCreditsToCheckout(db, "usr_rich", { bookingAmountInr: 1000, requestedCreditInr: 200 }).payableAmountInr, 800);
  assert.equal(applyWalletCreditsToCheckout(db, "usr_rich", { bookingAmountInr: 1001 }).creditDiscountInr, 500, "whole rupees only");
  db.close();
});

test("LoyaltyService: deductWalletCreditsOnBooking spends through the ledger and refuses an overdraft", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, wallet_balance_inr) VALUES ('usr_deduct', 'Ananya Gupta', 1000.0)").run();
  db.prepare("INSERT INTO wallet_transactions (id, user_id, type, amount_inr, balance_after_inr) VALUES ('opening', 'usr_deduct', 'ADJUSTMENT', 1000, 1000)").run();

  const deduction = deductWalletCreditsOnBooking(db, "usr_deduct", "bk_test_123", 400.0);
  assert.equal(deduction.newBalance, 600.0);

  const tx = db.prepare("SELECT * FROM wallet_transactions WHERE entry_type = 'REDEMPTION'").get();
  assert.equal(tx.amount_inr, -400.0);
  assert.equal(tx.booking_id, "bk_test_123");
  assert.ok(reconcileWalletBalance(db, "usr_deduct").matches);

  assert.throws(() => deductWalletCreditsOnBooking(db, "usr_deduct", "bk_test_456", 900), /not enough/);
  assert.throws(() => deductWalletCreditsOnBooking(db, "usr_deduct", "bk_test_123", 10), /UNIQUE/, "one redemption per booking");
  assert.equal(db.prepare("SELECT wallet_balance_inr FROM users WHERE id = 'usr_deduct'").get().wallet_balance_inr, 600);
  db.close();
});

test("LoyaltyService: public referral info names only the referrer's first name", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, email, referral_code) VALUES ('usr_code_test', 'Suresh Raina', 'suresh@example.com', 'REF-SURESH99')").run();

  const valid = getPublicReferralInfo(db, "ref-suresh99");
  assert.equal(valid.valid, true);
  assert.equal(valid.referrerName, "Suresh");
  assert.equal(valid.friendDiscountPct, 10);
  assert.doesNotMatch(JSON.stringify(valid), /Raina|suresh@example/);

  const invalid = getPublicReferralInfo(db, "NONEXISTENT_CODE");
  assert.equal(invalid.valid, false);
  db.close();
});

test("LoyaltyService: leaderboard ranks referrers by friends who travelled", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, email, referral_code) VALUES ('u1', 'Champion Referrer', 'champ@example.com', 'REF-CHAMP')").run();
  db.prepare("INSERT INTO users (id, name, email, referral_code) VALUES ('u2', 'Casual Referrer', 'cas@example.com', 'REF-CAS')").run();
  referredFriendWithTrip(db, { referrerId: "u1", code: "REF-CHAMP", friendId: "f1", bookingId: "bk1", commission: 1000 });
  referredFriendWithTrip(db, { referrerId: "u1", code: "REF-CHAMP", friendId: "f2", bookingId: "bk2", commission: 2000 });
  referredFriendWithTrip(db, { referrerId: "u2", code: "REF-CAS", friendId: "f3", bookingId: "bk3", commission: 500 });

  const leaderboard = getLoyaltyLeaderboard(db);
  assert.equal(leaderboard.summary.totalReferrers, 2);
  assert.equal(leaderboard.summary.totalRewardedTrips, 3);
  assert.equal(leaderboard.summary.totalPayoutInr, 350);
  assert.equal(leaderboard.topReferrers[0].name, "Champion Referrer");
  assert.equal(leaderboard.topReferrers[0].successfulReferrals, 2);
  assert.equal(leaderboard.topReferrers[0].totalEarnedInr, 300);
  db.close();
});
