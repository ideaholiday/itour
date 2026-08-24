import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  determineLoyaltyTier,
  ensureUserReferralCode,
  getTravelerLoyaltyProfile,
  applyWalletCreditsToCheckout,
  deductWalletCreditsOnBooking,
  creditReferralRewardOnCompletion,
  getPublicReferralInfo,
  getLoyaltyLeaderboard,
  LOYALTY_TIERS,
} from "../src/services/loyaltyService.js";

function createTestDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      role TEXT DEFAULT 'TRAVELER',
      referral_code TEXT,
      wallet_balance_inr REAL DEFAULT 0.0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      ref TEXT,
      activity_date TEXT,
      amount_inr REAL,
      status TEXT,
      user_id TEXT
    );
    CREATE TABLE IF NOT EXISTS user_referrals (
      id TEXT PRIMARY KEY,
      referrer_user_id TEXT NOT NULL REFERENCES users(id),
      referred_user_id TEXT REFERENCES users(id),
      referral_code TEXT NOT NULL,
      reward_inr REAL DEFAULT 250.0,
      status TEXT DEFAULT 'PENDING',
      booking_id TEXT REFERENCES bookings(id),
      created_at TEXT DEFAULT (datetime('now')),
      rewarded_at TEXT
    );
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount_inr REAL NOT NULL,
      balance_after_inr REAL NOT NULL,
      reference_id TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      event_key TEXT UNIQUE,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient_role TEXT NOT NULL,
      recipient_id TEXT,
      recipient_address TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_message_id TEXT,
      status TEXT DEFAULT 'QUEUED',
      subject TEXT,
      body TEXT,
      error_message TEXT,
      metadata TEXT DEFAULT '{}',
      booking_id TEXT,
      booking_ref TEXT,
      attempt_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      sent_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      recipient_email TEXT,
      recipient_name TEXT,
      subject TEXT,
      body TEXT,
      status TEXT,
      sent_at TEXT,
      provider TEXT,
      provider_message_id TEXT,
      error_message TEXT,
      event_type TEXT,
      recipient_role TEXT
    );
    CREATE TABLE IF NOT EXISTS whatsapp_logs (
      id TEXT PRIMARY KEY,
      recipient_phone TEXT,
      recipient_name TEXT,
      message_text TEXT,
      gateway_status TEXT,
      sent_at TEXT,
      provider_message_id TEXT,
      error_message TEXT,
      event_type TEXT,
      recipient_role TEXT
    );
  `);
  return database;
}

test("LoyaltyService: determineLoyaltyTier calculates tiers correctly based on rewarded counts", () => {
  const explorer0 = determineLoyaltyTier(0);
  assert.equal(explorer0.tierKey, "EXPLORER");
  assert.equal(explorer0.rewardPerFriendInr, 250);

  const explorer2 = determineLoyaltyTier(2);
  assert.equal(explorer2.tierKey, "EXPLORER");

  const voyager3 = determineLoyaltyTier(3);
  assert.equal(voyager3.tierKey, "VOYAGER");
  assert.equal(voyager3.rewardPerFriendInr, 350);
  assert.equal(voyager3.checkoutBonusDiscountPct, 5);

  const voyager9 = determineLoyaltyTier(9);
  assert.equal(voyager9.tierKey, "VOYAGER");

  const globetrotter10 = determineLoyaltyTier(10);
  assert.equal(globetrotter10.tierKey, "GLOBE_TROTTER");
  assert.equal(globetrotter10.rewardPerFriendInr, 500);
  assert.equal(globetrotter10.checkoutBonusDiscountPct, 10);
});

test("LoyaltyService: getTravelerLoyaltyProfile auto-generates referral code and aggregates stats", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, email, wallet_balance_inr) VALUES ('usr_1', 'Kavita Roy', 'kavita@example.com', 750.0)").run();
  
  // Add some referrals
  db.prepare("INSERT INTO user_referrals (id, referrer_user_id, referral_code, reward_inr, status) VALUES ('ref_1', 'usr_1', 'REF-KAVITA', 250.0, 'REWARDED')").run();
  db.prepare("INSERT INTO user_referrals (id, referrer_user_id, referral_code, reward_inr, status) VALUES ('ref_2', 'usr_1', 'REF-KAVITA', 250.0, 'PENDING')").run();

  const profile = getTravelerLoyaltyProfile(db, "usr_1");

  assert.equal(profile.userId, "usr_1");
  assert.equal(profile.userName, "Kavita Roy");
  assert.ok(profile.referralCode);
  assert.equal(profile.walletBalanceInr, 750.0);
  assert.equal(profile.totalCreditsEarned, 250.0);
  assert.equal(profile.pendingCredits, 250.0);
  assert.equal(profile.friendsInvitedCount, 2);
  assert.equal(profile.successfulReferralsCount, 1);
  assert.equal(profile.tier.tierKey, "EXPLORER");
  assert.equal(profile.referralsToNextTier, 2);

  db.close();
});

test("LoyaltyService: applyWalletCreditsToCheckout enforces 50% order cap and ₹2000 max limit", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, email, wallet_balance_inr) VALUES ('usr_rich', 'Vikram Patel', 'vikram@example.com', 5000.0)").run();
  db.prepare("INSERT INTO users (id, name, email, wallet_balance_inr) VALUES ('usr_modest', 'Deepak Sen', 'deepak@example.com', 300.0)").run();

  // 1. Order of ₹1,000 with ₹5,000 balance -> max 50% discount = ₹500
  const calc1 = applyWalletCreditsToCheckout(db, "usr_rich", { bookingAmountInr: 1000 });
  assert.equal(calc1.applied, true);
  assert.equal(calc1.creditDiscountInr, 500);
  assert.equal(calc1.payableAmountInr, 500);
  assert.equal(calc1.remainingWalletBalanceInr, 4500);

  // 2. Large order of ₹10,000 with ₹5,000 balance -> capped at ₹2,000 max discount
  const calc2 = applyWalletCreditsToCheckout(db, "usr_rich", { bookingAmountInr: 10000 });
  assert.equal(calc2.creditDiscountInr, 2000);
  assert.equal(calc2.payableAmountInr, 8000);

  // 3. Modest balance of ₹300 on ₹2,000 order -> uses full ₹300 (since 300 <= 50% of 2000 = 1000)
  const calc3 = applyWalletCreditsToCheckout(db, "usr_modest", { bookingAmountInr: 2000 });
  assert.equal(calc3.creditDiscountInr, 300);
  assert.equal(calc3.payableAmountInr, 1700);

  // 4. Custom requested discount lower than max
  const calc4 = applyWalletCreditsToCheckout(db, "usr_rich", { bookingAmountInr: 1000, requestedCreditInr: 200 });
  assert.equal(calc4.creditDiscountInr, 200);
  assert.equal(calc4.payableAmountInr, 800);

  db.close();
});

test("LoyaltyService: deductWalletCreditsOnBooking updates balance and creates ledger transaction", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, wallet_balance_inr) VALUES ('usr_deduct', 'Ananya Gupta', 1000.0)").run();

  const deduction = deductWalletCreditsOnBooking(db, "usr_deduct", "bk_test_123", 400.0);
  assert.equal(deduction.deducted, true);
  assert.equal(deduction.amountDeducted, 400.0);
  assert.equal(deduction.newBalance, 600.0);

  const updatedUser = db.prepare("SELECT wallet_balance_inr FROM users WHERE id = 'usr_deduct'").get();
  assert.equal(updatedUser.wallet_balance_inr, 600.0);

  const tx = db.prepare("SELECT * FROM wallet_transactions WHERE user_id = 'usr_deduct'").get();
  assert.ok(tx);
  assert.equal(tx.amount_inr, -400.0);
  assert.equal(tx.balance_after_inr, 600.0);
  assert.equal(tx.reference_id, "bk_test_123");

  db.close();
});

test("LoyaltyService: creditReferralRewardOnCompletion upgrades pending referral and credits referrer wallet", async () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, email, wallet_balance_inr) VALUES ('usr_ref_parent', 'Priya Menon', 'priya@example.com', 100.0)").run();
  db.prepare("INSERT INTO users (id, name, email) VALUES ('usr_ref_child', 'Rahul Mehta', 'rahul@example.com')").run();
  db.prepare("INSERT INTO bookings (id, ref, amount_inr, status, user_id) VALUES ('bk_completed_1', 'BK-8901', 3500.0, 'CONFIRMED', 'usr_ref_child')").run();
  db.prepare("INSERT INTO user_referrals (id, referrer_user_id, referred_user_id, referral_code, reward_inr, status, booking_id) VALUES ('ref_case_1', 'usr_ref_parent', 'usr_ref_child', 'REF-PRIYA', 250.0, 'PENDING', 'bk_completed_1')").run();

  const result = await creditReferralRewardOnCompletion(db, "bk_completed_1", { sendNotifications: false });

  assert.ok(result);
  assert.equal(result.referralId, "ref_case_1");
  assert.equal(result.rewardAmount, 250.0);
  assert.equal(result.newBalance, 350.0);

  const referralRow = db.prepare("SELECT * FROM user_referrals WHERE id = 'ref_case_1'").get();
  assert.equal(referralRow.status, "REWARDED");
  assert.ok(referralRow.rewarded_at);

  const userRow = db.prepare("SELECT wallet_balance_inr FROM users WHERE id = 'usr_ref_parent'").get();
  assert.equal(userRow.wallet_balance_inr, 350.0);

  const tx = db.prepare("SELECT * FROM wallet_transactions WHERE user_id = 'usr_ref_parent'").get();
  assert.equal(tx.type, "REFERRAL_REWARD");
  assert.equal(tx.amount_inr, 250.0);

  db.close();
});

test("LoyaltyService: getPublicReferralInfo validates referral codes and handles invalid ones", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, referral_code) VALUES ('usr_code_test', 'Suresh Raina', 'REF-SURESH99')").run();

  const valid = getPublicReferralInfo(db, "REF-SURESH99");
  assert.equal(valid.valid, true);
  assert.equal(valid.referrerName, "Suresh");
  assert.equal(valid.welcomeDiscountInr, 250);

  const invalid = getPublicReferralInfo(db, "NONEXISTENT_CODE");
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /invalid/i);

  db.close();
});

test("LoyaltyService: getLoyaltyLeaderboard aggregates stats for admin dashboard", () => {
  const db = createTestDatabase();
  db.prepare("INSERT INTO users (id, name, email, referral_code, wallet_balance_inr) VALUES ('u1', 'Champion Referrer', 'champ@example.com', 'REF-CHAMP', 1500.0)").run();
  db.prepare("INSERT INTO users (id, name, email, referral_code, wallet_balance_inr) VALUES ('u2', 'Casual Referrer', 'cas@example.com', 'REF-CAS', 250.0)").run();

  db.prepare("INSERT INTO user_referrals (id, referrer_user_id, referral_code, reward_inr, status) VALUES ('r1', 'u1', 'REF-CHAMP', 500.0, 'REWARDED')").run();
  db.prepare("INSERT INTO user_referrals (id, referrer_user_id, referral_code, reward_inr, status) VALUES ('r2', 'u1', 'REF-CHAMP', 500.0, 'REWARDED')").run();
  db.prepare("INSERT INTO user_referrals (id, referrer_user_id, referral_code, reward_inr, status) VALUES ('r3', 'u2', 'REF-CAS', 250.0, 'REWARDED')").run();

  const leaderboard = getLoyaltyLeaderboard(db);

  assert.equal(leaderboard.summary.totalReferrers, 2);
  assert.equal(leaderboard.summary.totalRewardedTrips, 3);
  assert.equal(leaderboard.summary.totalPayoutInr, 1250.0);
  assert.equal(leaderboard.topReferrers.length, 2);
  assert.equal(leaderboard.topReferrers[0].name, "Champion Referrer");
  assert.equal(leaderboard.topReferrers[0].successfulReferrals, 2);

  db.close();
});
