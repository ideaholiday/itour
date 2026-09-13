import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import {
  REFERRAL_POLICY,
  applyReferralToBooking,
  backfillLegacyReferrals,
  computeReferralAmounts,
  establishReferralRelationship,
  expireWalletCredits,
  getReferralProgramMetrics,
  getReferralSummary,
  markReferralTripCompleted,
  normalizeEmailIdentity,
  normalizePhone,
  postWalletEntry,
  previewReferralBenefit,
  processReferralLifecycle,
  reconcileWalletBalance,
  redeemWalletCredit,
  resolveReferralAttribution,
  reviewReferralReward,
  sqlTimestamp,
  trackReferralClick,
} from "../src/services/referralService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration030 = fs.readFileSync(path.join(__dirname, "..", "migrations", "030_referral_program_v3.sql"), "utf8").split("-- @down")[0];

const DAY = 86_400_000;
const T0 = new Date("2026-09-01T10:00:00Z");
const at = (days) => new Date(T0.getTime() + days * DAY);

function createDatabase() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, referral_code TEXT,
      wallet_balance_inr REAL DEFAULT 0
    );
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, status TEXT DEFAULT 'pending_payment',
      payment_status TEXT DEFAULT 'PENDING', amount_inr REAL, commission_amount REAL,
      refunded_amount REAL DEFAULT 0, refund_amount_inr REAL DEFAULT 0,
      traveler_phone TEXT, traveler_email TEXT, activity_date TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE booking_holds (id TEXT PRIMARY KEY, booking_id TEXT, status TEXT, expires_at TEXT);
    CREATE TABLE wallet_transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount_inr REAL NOT NULL,
      balance_after_inr REAL NOT NULL, reference_id TEXT, description TEXT, created_at TEXT
    );
    CREATE TABLE user_referrals (
      id TEXT PRIMARY KEY, referrer_user_id TEXT NOT NULL, referred_user_id TEXT, referral_code TEXT NOT NULL,
      reward_inr REAL DEFAULT 250.0, status TEXT DEFAULT 'PENDING', booking_id TEXT, created_at TEXT, rewarded_at TEXT
    );
  `);
  executeMigrationSql(db, migration030);
  return db;
}

function addUser(db, id, { name = id, email = `${id}@example.com`, phone = null, code = null, visitor = null } = {}) {
  db.prepare("INSERT INTO users (id, name, email, phone, referral_code, signup_visitor_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, name, email, phone, code, visitor);
}

function addBooking(db, id, { userId, commission, amount = commission * 5, phone = null, email = null }) {
  db.prepare("INSERT INTO bookings (id, ref, user_id, amount_inr, commission_amount, traveler_phone, traveler_email) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, `IH-${id}`, userId, amount, commission, phone, email);
}

/** Creates a booking for `userId` and attaches the referral, as the booking route does. */
function book(db, id, { userId, commission, code = null, visitor = null, now = T0 }) {
  addBooking(db, id, { userId, commission });
  let result;
  db.transaction(() => {
    result = applyReferralToBooking(db, {
      bookingId: id, userId, referralCode: code, visitorId: visitor,
      quoteCommissionInr: commission, bookingCommissionInr: commission, now,
    });
    db.prepare("UPDATE bookings SET referral_discount_inr = ?, amount_inr = amount_inr - ? WHERE id = ?").run(result.discountInr, result.discountInr, id);
  })();
  return result;
}

const pay = (db, id) => db.prepare("UPDATE bookings SET payment_status = 'PAID', status = 'confirmed' WHERE id = ?").run(id);
const complete = (db, id, now) => {
  db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(id);
  db.transaction(() => markReferralTripCompleted(db, id, { now }))();
};
const balance = (db, id) => db.prepare("SELECT wallet_balance_inr FROM users WHERE id = ?").get(id).wallet_balance_inr;
const reward = (db, bookingId) => db.prepare("SELECT * FROM referral_rewards WHERE booking_id = ?").get(bookingId);

/** Referrer Priya and her friend Rahul, already linked through a signup link. */
function linkedPair() {
  const db = createDatabase();
  addUser(db, "priya", { name: "Priya Menon", phone: "+91 98765 43210", code: "REF-PRIYA1" });
  addUser(db, "rahul", { name: "Rahul Mehta", phone: "9123456780" });
  const click = trackReferralClick(db, { referralCode: "REF-PRIYA1", visitorId: "v_rahul", channel: "whatsapp", now: T0 });
  assert.equal(click.tracked, true);
  const link = establishReferralRelationship(db, { referredUserId: "rahul", visitorId: "v_rahul", now: T0 });
  assert.equal(link.established, true);
  return db;
}

test("amounts are 10% of the booking's own commission, rounded down", () => {
  assert.equal(REFERRAL_POLICY.friendDiscountRate, 0.1);
  assert.equal(REFERRAL_POLICY.referrerRate, 0.1);

  assert.deepEqual(
    [180, 450, 4200, 2640].map((commissionInr) => computeReferralAmounts({ commissionInr, isFirstTrip: true })).map((a) => [a.refereeAmountInr, a.referrerAmountInr]),
    [[18, 18], [45, 45], [420, 420], [264, 264]],
  );
  const repeat = computeReferralAmounts({ commissionInr: 459.9, isFirstTrip: false });
  assert.equal(repeat.refereeAmountInr, 0);
  assert.equal(repeat.referrerAmountInr, 45);
  assert.equal(computeReferralAmounts({ commissionInr: -50, isFirstTrip: true }).referrerAmountInr, 0);
});

test("identity normalisation sees through phone prefixes and Gmail aliases", () => {
  assert.equal(normalizePhone("+91 98765-43210"), "9876543210");
  assert.equal(normalizePhone("098765 43210"), "9876543210");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizeEmailIdentity("Priya.Menon+trips@GMAIL.com"), "priyamenon@gmail.com");
  assert.equal(normalizeEmailIdentity("priya.menon+x@googlemail.com"), "priyamenon@gmail.com");
  assert.equal(normalizeEmailIdentity("priya.menon+x@company.in"), "priya.menon@company.in");
});

test("a link click survives until signup, last click wins, and is consumed once", () => {
  const db = createDatabase();
  addUser(db, "priya", { code: "REF-PRIYA1" });
  addUser(db, "arjun", { code: "REF-ARJUN1" });
  addUser(db, "rahul");

  trackReferralClick(db, { referralCode: "REF-PRIYA1", visitorId: "v1", now: T0 });
  trackReferralClick(db, { referralCode: "ref-arjun1", visitorId: "v1", now: at(1) });
  assert.equal(resolveReferralAttribution(db, { visitorId: "v1", now: at(2) }).referrer_user_id, "arjun");
  assert.equal(resolveReferralAttribution(db, { visitorId: "v1", now: at(40) }), null, "expired after 30 days");

  const result = establishReferralRelationship(db, { referredUserId: "rahul", visitorId: "v1", now: at(2) });
  assert.equal(result.relationship.referrer_user_id, "arjun");
  assert.ok(result.relationship.attribution_id);
  assert.equal(resolveReferralAttribution(db, { visitorId: "v1", now: at(2) })?.referrer_user_id, "priya", "Arjun's click is used up; Priya's older one remains");

  const again = establishReferralRelationship(db, { referredUserId: "rahul", referralCode: "REF-PRIYA1", now: at(3) });
  assert.equal(again.established, false);
  assert.equal(again.reason, "ALREADY_REFERRED");
  assert.equal(getReferralSummary(db, "arjun").friends.length, 1);

  assert.deepEqual(trackReferralClick(db, { referralCode: "REF-NOPE", visitorId: "v2" }), { tracked: false, reason: "UNKNOWN_CODE" });
});

test("self-referral is caught on account, phone, mailbox, device and booking history", () => {
  const db = createDatabase();
  addUser(db, "priya", { phone: "+919876543210", email: "priya.menon@gmail.com", code: "REF-PRIYA1", visitor: "v_priya" });
  addUser(db, "alt_phone", { phone: "98765 43210" });
  addUser(db, "alt_email", { email: "priyamenon+two@gmail.com" });
  addUser(db, "alt_device");
  addUser(db, "old_customer", { phone: "9000000001" });
  addBooking(db, "bk_old", { userId: "old_customer", commission: 100, phone: "9000000001" });
  pay(db, "bk_old");

  assert.equal(establishReferralRelationship(db, { referredUserId: "priya", referralCode: "REF-PRIYA1" }).reason, "SELF_REFERRAL");
  assert.equal(establishReferralRelationship(db, { referredUserId: "alt_phone", referralCode: "REF-PRIYA1" }).reason, "SAME_PHONE");
  assert.equal(establishReferralRelationship(db, { referredUserId: "alt_email", referralCode: "REF-PRIYA1" }).reason, "EMAIL_ALIAS");
  assert.equal(establishReferralRelationship(db, { referredUserId: "alt_device", referralCode: "REF-PRIYA1", visitorId: "v_priya" }).reason, "SAME_DEVICE");
  assert.equal(establishReferralRelationship(db, { referredUserId: "old_customer", referralCode: "REF-PRIYA1" }).reason, "NOT_NEW_TRAVELER");

  const statuses = db.prepare("SELECT referred_user_id, status, blocked_reason FROM referral_relationships ORDER BY referred_user_id").all();
  assert.deepEqual(statuses, [
    { referred_user_id: "alt_device", status: "BLOCKED", blocked_reason: "SAME_DEVICE" },
    { referred_user_id: "alt_email", status: "BLOCKED", blocked_reason: "EMAIL_ALIAS" },
    { referred_user_id: "alt_phone", status: "BLOCKED", blocked_reason: "SAME_PHONE" },
  ]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM referral_fraud_signals").get().n, 5);

  // A blocked account cannot collect a discount by typing another code later.
  addBooking(db, "bk_alt", { userId: "alt_phone", commission: 450 });
  const attempt = applyReferralToBooking(db, { bookingId: "bk_alt", userId: "alt_phone", referralCode: "REF-PRIYA1", quoteCommissionInr: 450, bookingCommissionInr: 450 });
  assert.equal(attempt.applied, false);
});

test("the referrer's own phone on a friend's booking earns nothing", () => {
  const db = linkedPair();
  addBooking(db, "bk_sneaky", { userId: "rahul", commission: 450 });
  const result = applyReferralToBooking(db, {
    bookingId: "bk_sneaky", userId: "rahul", quoteCommissionInr: 450, bookingCommissionInr: 450, travelerPhone: "9876543210",
  });
  assert.equal(result.applied, false);
  assert.equal(reward(db, "bk_sneaky"), undefined);
});

test("friend discount on the first paid trip only; referrer earns on every trip after the hold", () => {
  const db = linkedPair();

  assert.equal(previewReferralBenefit(db, { userId: "rahul", commissionInr: 450 }).discountInr, 45);

  const first = book(db, "bk_jaipur", { userId: "rahul", commission: 450 });
  assert.equal(first.discountInr, 45);
  assert.equal(first.referrerAmountInr, 45);

  // An unpaid checkout does not use up the first-trip discount.
  assert.equal(previewReferralBenefit(db, { userId: "rahul", commissionInr: 450 }).discountInr, 45);
  pay(db, "bk_jaipur");
  assert.equal(previewReferralBenefit(db, { userId: "rahul", commissionInr: 450 }).reason, "FIRST_TRIP_USED");

  complete(db, "bk_jaipur", at(3));
  assert.equal(reward(db, "bk_jaipur").payable_at, sqlTimestamp(at(10)));

  processReferralLifecycle(db, { now: at(9) });
  assert.equal(balance(db, "priya"), 0, "still inside the 7-day hold");
  assert.equal(getReferralSummary(db, "priya", { now: at(9) }).totals.clearingInr, 45);

  const run = processReferralLifecycle(db, { now: at(10) });
  assert.equal(run.cleared, 1);
  assert.equal(run.notifications.cleared[0].amountInr, 45);
  assert.equal(balance(db, "priya"), 45);
  const credit = db.prepare("SELECT * FROM wallet_transactions WHERE entry_type = 'REFERRAL_CLEARED'").get();
  assert.equal(credit.expires_at, sqlTimestamp(new Date("2027-09-11T10:00:00Z")));
  assert.equal(credit.remaining_inr, 45);

  const second = book(db, "bk_goa", { userId: "rahul", commission: 2640, now: at(30) });
  assert.equal(second.discountInr, 0);
  assert.equal(second.referrerAmountInr, 264);
  pay(db, "bk_goa");
  complete(db, "bk_goa", at(40));
  processReferralLifecycle(db, { now: at(47) });
  assert.equal(balance(db, "priya"), 309);
  assert.equal(reward(db, "bk_goa").sequence, 2);

  // Running the sweep again moves no money.
  processReferralLifecycle(db, { now: at(48) });
  assert.equal(balance(db, "priya"), 309);
  assert.ok(reconcileWalletBalance(db, "priya").matches);

  const summary = getReferralSummary(db, "priya", { now: at(48) });
  assert.equal(summary.friends[0].paidTrips, 2);
  assert.equal(summary.friends[0].earnedInr, 309);
  assert.equal(summary.totals.creditedInr, 309);

  // Earning stops when the 24-month window closes.
  const late = new Date("2028-09-02T10:00:00Z");
  processReferralLifecycle(db, { now: late });
  addBooking(db, "bk_late", { userId: "rahul", commission: 500 });
  assert.equal(applyReferralToBooking(db, { bookingId: "bk_late", userId: "rahul", quoteCommissionInr: 500, bookingCommissionInr: 500, now: late }).applied, false);
});

test("a code typed at checkout creates the relationship, and a booking can only be rewarded once", () => {
  const db = createDatabase();
  addUser(db, "priya", { phone: "9876543210", code: "REF-PRIYA1" });
  addUser(db, "rahul", { phone: "9123456780" });

  const preview = previewReferralBenefit(db, { userId: "rahul", referralCode: "REF-PRIYA1", commissionInr: 180 });
  assert.deepEqual([preview.eligible, preview.discountInr, preview.referrerFirstName], [true, 18, "priya"]);

  const result = book(db, "bk_cab", { userId: "rahul", commission: 180, code: "REF-PRIYA1" });
  assert.equal(result.discountInr, 18);
  assert.equal(db.prepare("SELECT source FROM referral_relationships WHERE referred_user_id = 'rahul'").get().source, "CHECKOUT_CODE");

  assert.throws(
    () => applyReferralToBooking(db, { bookingId: "bk_cab", userId: "rahul", referralCode: "REF-PRIYA1", quoteCommissionInr: 180, bookingCommissionInr: 180 }),
    /UNIQUE/,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM referral_rewards").get().n, 1);
});

test("a refund after the credit was spent reverses what it can and recovers the rest later", () => {
  const db = linkedPair();
  db.prepare("UPDATE users SET wallet_balance_inr = 0").run();

  book(db, "bk_one", { userId: "rahul", commission: 4200 });
  pay(db, "bk_one");
  complete(db, "bk_one", T0);
  processReferralLifecycle(db, { now: at(7) });
  assert.equal(balance(db, "priya"), 420);

  // Priya spends 300 of it on her own trip.
  addBooking(db, "bk_priya", { userId: "priya", commission: 900 });
  db.transaction(() => redeemWalletCredit(db, { userId: "priya", bookingId: "bk_priya", amountInr: 300, now: at(8) }))();
  assert.equal(balance(db, "priya"), 120);
  assert.equal(db.prepare("SELECT remaining_inr FROM wallet_transactions WHERE entry_type = 'REFERRAL_CLEARED'").get().remaining_inr, 120);

  // Rahul's trip is then refunded.
  db.prepare("UPDATE bookings SET payment_status = 'REFUNDED', status = 'cancelled', refunded_amount = amount_inr WHERE id = 'bk_one'").run();
  const run = processReferralLifecycle(db, { now: at(9) });
  assert.equal(run.reversed, 1);
  assert.equal(balance(db, "priya"), 0, "never below zero");
  assert.equal(db.prepare("SELECT wallet_clawback_pending_inr AS owed FROM users WHERE id = 'priya'").get().owed, 300);
  assert.equal(reward(db, "bk_one").status, "REVERSED");

  // Her next credit settles the debt first.
  book(db, "bk_two", { userId: "rahul", commission: 5000, now: at(20) });
  pay(db, "bk_two");
  complete(db, "bk_two", at(20));
  processReferralLifecycle(db, { now: at(27) });
  assert.equal(balance(db, "priya"), 200);
  assert.equal(db.prepare("SELECT wallet_clawback_pending_inr AS owed FROM users WHERE id = 'priya'").get().owed, 0);
  assert.ok(reconcileWalletBalance(db, "priya").matches);
});

test("an abandoned checkout voids its reward and returns the wallet credit it used", () => {
  const db = linkedPair();
  db.transaction(() => postWalletEntry(db, { userId: "rahul", entryType: "ADJUSTMENT", amountInr: 500, now: T0 }))();

  book(db, "bk_abandon", { userId: "rahul", commission: 450 });
  db.transaction(() => {
    redeemWalletCredit(db, { userId: "rahul", bookingId: "bk_abandon", amountInr: 200, now: T0 });
    db.prepare("UPDATE bookings SET wallet_credit_applied_inr = 200 WHERE id = 'bk_abandon'").run();
  })();
  db.prepare("INSERT INTO booking_holds (id, booking_id, status, expires_at) VALUES ('h1', 'bk_abandon', 'ACTIVE', ?)").run(sqlTimestamp(at(0.01)));
  assert.equal(balance(db, "rahul"), 300);

  processReferralLifecycle(db, { now: at(0.005) });
  assert.equal(reward(db, "bk_abandon").status, "ACCRUED", "hold still live");

  const run = processReferralLifecycle(db, { now: at(1) });
  assert.equal(run.voided, 1);
  assert.equal(run.restored, 1);
  assert.equal(reward(db, "bk_abandon").status, "VOID");
  assert.equal(balance(db, "rahul"), 500);

  processReferralLifecycle(db, { now: at(2) });
  assert.equal(balance(db, "rahul"), 500, "restored once");
  assert.ok(reconcileWalletBalance(db, "rahul").matches);

  // Spending more than the balance fails rather than leaving a free discount.
  assert.throws(() => db.transaction(() => redeemWalletCredit(db, { userId: "rahul", bookingId: "bk_x", amountInr: 900 }))(), /not enough/);
});

test("unusual earnings wait for an operator, and approval releases them", () => {
  const db = linkedPair();
  book(db, "bk_big1", { userId: "rahul", commission: 30000 });
  pay(db, "bk_big1");
  complete(db, "bk_big1", T0);
  processReferralLifecycle(db, { now: at(7) });
  assert.equal(balance(db, "priya"), 3000);

  book(db, "bk_big2", { userId: "rahul", commission: 25000, now: at(10) });
  pay(db, "bk_big2");
  complete(db, "bk_big2", at(10));
  assert.equal(reward(db, "bk_big2").status, "HELD_FOR_REVIEW", "3000 + 2500 is over the 5000 monthly limit");
  processReferralLifecycle(db, { now: at(30) });
  assert.equal(balance(db, "priya"), 3000);

  reviewReferralReward(db, { rewardId: reward(db, "bk_big2").id, decision: "APPROVE", actorId: "ops_1", now: at(31) });
  processReferralLifecycle(db, { now: at(31) });
  assert.equal(balance(db, "priya"), 5500);
  assert.equal(db.prepare("SELECT signal FROM referral_fraud_signals WHERE signal = 'EARNING_VELOCITY'").get().signal, "EARNING_VELOCITY");
});

test("a burst of referred signups flags the new relationships for review", () => {
  const db = createDatabase();
  addUser(db, "priya", { code: "REF-PRIYA1" });
  for (let index = 1; index <= 6; index += 1) {
    addUser(db, `friend${index}`);
    establishReferralRelationship(db, { referredUserId: `friend${index}`, referralCode: "REF-PRIYA1", now: at(index / 100) });
  }
  const flagged = db.prepare("SELECT referred_user_id FROM referral_relationships WHERE requires_review = 1").all();
  assert.deepEqual(flagged, [{ referred_user_id: "friend6" }]);

  book(db, "bk_f6", { userId: "friend6", commission: 450 });
  pay(db, "bk_f6");
  complete(db, "bk_f6", at(1));
  assert.equal(reward(db, "bk_f6").status, "HELD_FOR_REVIEW");
});

test("unspent credit expires after 12 months with a reminder beforehand", () => {
  const db = linkedPair();
  book(db, "bk_exp", { userId: "rahul", commission: 1000 });
  pay(db, "bk_exp");
  complete(db, "bk_exp", T0);
  processReferralLifecycle(db, { now: at(7) });
  assert.equal(balance(db, "priya"), 100);

  const reminder = processReferralLifecycle(db, { now: at(345) });
  assert.deepEqual(reminder.notifications.reminders.map((item) => [item.userId, item.amountInr]), [["priya", 100]]);
  assert.equal(processReferralLifecycle(db, { now: at(346) }).notifications.reminders.length, 0, "reminded once");

  assert.equal(expireWalletCredits(db, { now: at(371) }).expiredInr, 0);
  assert.equal(expireWalletCredits(db, { now: at(373) }).expiredInr, 100);
  assert.equal(balance(db, "priya"), 0);
  assert.ok(reconcileWalletBalance(db, "priya").matches);
});

test("legacy referrals and drifted balances are carried over once", () => {
  const db = createDatabase();
  addUser(db, "priya", { code: "REF-PRIYA1" });
  addUser(db, "rahul");
  addUser(db, "meera");
  db.prepare("UPDATE users SET wallet_balance_inr = 750 WHERE id = 'priya'").run();
  db.prepare("INSERT INTO wallet_transactions (id, user_id, type, amount_inr, balance_after_inr, created_at) VALUES ('old1', 'priya', 'REFERRAL_REWARD', 250, 250, '2026-01-01 00:00:00')").run();
  addBooking(db, "bk_old_done", { userId: "rahul", commission: 400 });
  addBooking(db, "bk_old_pending", { userId: "meera", commission: 600 });
  db.prepare("UPDATE bookings SET payment_status = 'PAID', status = 'completed' WHERE id = 'bk_old_done'").run();
  db.prepare("INSERT INTO user_referrals (id, referrer_user_id, referred_user_id, referral_code, reward_inr, status, booking_id, created_at, rewarded_at) VALUES ('ur1', 'priya', 'rahul', 'REF-PRIYA1', 250, 'REWARDED', 'bk_old_done', '2026-01-01 00:00:00', '2026-02-01 00:00:00')").run();
  db.prepare("INSERT INTO user_referrals (id, referrer_user_id, referred_user_id, referral_code, reward_inr, status, booking_id, created_at) VALUES ('ur2', 'priya', 'meera', 'REF-PRIYA1', 250, 'PENDING', 'bk_old_pending', '2026-03-01 00:00:00')").run();
  // The v1 double-reward bug: a second row for the same booking.
  db.prepare("INSERT INTO user_referrals (id, referrer_user_id, referred_user_id, referral_code, reward_inr, status, booking_id, created_at) VALUES ('ur3', 'priya', 'rahul', 'REF-PRIYA1', 250, 'PENDING', 'bk_old_done', '2026-01-02 00:00:00')").run();

  const first = backfillLegacyReferrals(db, { now: T0 });
  assert.deepEqual(first, { relationships: 2, rewards: 2, adjustments: 1 });
  assert.equal(reward(db, "bk_old_done").status, "CLEARED");
  assert.equal(reward(db, "bk_old_pending").status, "ACCRUED");
  assert.equal(reward(db, "bk_old_pending").referrer_amount_inr, 60);
  assert.equal(balance(db, "priya"), 750, "the balance a user has is never changed");
  assert.ok(reconcileWalletBalance(db, "priya").matches);

  assert.deepEqual(backfillLegacyReferrals(db, { now: T0 }), { relationships: 0, rewards: 0, adjustments: 0 });
});

test("the ledger always explains the balance across random money movements", () => {
  const db = linkedPair();
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  let day = 0;
  for (let step = 0; step < 1000; step += 1) {
    day += random() * 3;
    const now = at(day);
    const id = `bk_${step}`;
    const roll = random();
    try {
      if (roll < 0.45) {
        book(db, id, { userId: "rahul", commission: Math.round(random() * 5000), now });
        pay(db, id);
        complete(db, id, now);
      } else if (roll < 0.6) {
        const target = db.prepare("SELECT booking_id FROM referral_rewards ORDER BY RANDOM() LIMIT 1").get();
        if (target) db.prepare("UPDATE bookings SET status = 'cancelled', payment_status = 'REFUNDED', refunded_amount = amount_inr WHERE id = ?").run(target.booking_id);
      } else if (roll < 0.85) {
        addBooking(db, id, { userId: "priya", commission: 100 });
        db.transaction(() => redeemWalletCredit(db, { userId: "priya", bookingId: id, amountInr: Math.round(random() * 800), now }))();
      } else {
        const held = db.prepare("SELECT id FROM referral_rewards WHERE status = 'HELD_FOR_REVIEW' LIMIT 1").get();
        if (held) reviewReferralReward(db, { rewardId: held.id, decision: random() < 0.7 ? "APPROVE" : "REJECT", now });
      }
    } catch (error) {
      assert.match(error.message, /not enough/, "the only acceptable failure is spending more than the balance");
    }
    processReferralLifecycle(db, { now });
    assert.ok(balance(db, "priya") >= 0);
  }

  for (const user of ["priya", "rahul"]) assert.ok(reconcileWalletBalance(db, user).matches, `${user} ledger matches`);

  const remaining = db.prepare("SELECT COALESCE(SUM(remaining_inr), 0) AS total FROM wallet_transactions WHERE user_id = 'priya' AND expires_at IS NOT NULL").get().total;
  assert.ok(remaining <= balance(db, "priya") + 0.01, "unspent expiring credit never exceeds the balance");

  const metrics = getReferralProgramMetrics(db, { sinceDays: 5000, now: at(day) });
  assert.ok(metrics.costPctOfMargin <= 20, `cost ${metrics.costPctOfMargin}% of margin stays within the 10% + 10% ceiling`);
  assert.equal(metrics.walletDiscrepancies, 0);
});
