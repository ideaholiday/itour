import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { postWalletEntry, reconcileWalletBalance, redeemWalletCredit, restoreWalletCreditForBooking, reverseReferralReward, walletBalances } from "../src/services/referralService.js";
import { applyWalletCreditsToCheckout } from "../src/services/loyaltyService.js";
import { creditSupplierCancellationToWallet, listCashRefundableCredits, refundCreditToSource } from "../src/services/refundCreditService.js";

/** Supplier cancellations refund to the wallet first (ADR 019). */

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];
const NOW = new Date("2026-09-15T06:00:00Z");

function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, referral_code TEXT, wallet_balance_inr REAL DEFAULT 0);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, supplier_id TEXT, status TEXT DEFAULT 'confirmed', payment_status TEXT DEFAULT 'PAID',
      payment_method TEXT, razorpay_payment_id TEXT, cashfree_order_id TEXT, cancellation_reason TEXT,
      amount_inr REAL, commission_amount REAL, commission_rate_snapshot REAL, refunded_amount REAL DEFAULT 0, refund_amount_inr REAL DEFAULT 0,
      traveler_phone TEXT, traveler_email TEXT, activity_date TEXT, wallet_credit_applied_inr REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE booking_holds (id TEXT PRIMARY KEY, booking_id TEXT, status TEXT, expires_at TEXT);
    CREATE TABLE driver_assignments (id TEXT PRIMARY KEY, booking_id TEXT, assignment_status TEXT);
    CREATE TABLE payouts (id TEXT PRIMARY KEY, booking_id TEXT, gross_amount REAL, commission_amount REAL, net_payout REAL, payout_status TEXT, settlement_batch_id TEXT);
    CREATE TABLE refunds (
      id TEXT PRIMARY KEY, booking_id TEXT, booking_ref TEXT, refund_amount REAL, refund_percentage INTEGER,
      policy_tier TEXT, gateway_refund_id TEXT, status TEXT, reason TEXT, processed_at TEXT,
      currency TEXT, requested_by TEXT, requested_at TEXT, provider_status TEXT, error_message TEXT,
      reconciled_at TEXT, idempotency_key TEXT
    );
    CREATE TABLE financial_ledger (
      id TEXT PRIMARY KEY, booking_id TEXT, supplier_id TEXT, payout_id TEXT, refund_id TEXT,
      event_type TEXT, amount REAL, currency TEXT, status TEXT, external_reference TEXT,
      idempotency_key TEXT UNIQUE, metadata TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE wallet_transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, amount_inr REAL NOT NULL,
      balance_after_inr REAL NOT NULL, reference_id TEXT, description TEXT, created_at TEXT
    );
    CREATE TABLE user_referrals (id TEXT PRIMARY KEY, referrer_user_id TEXT NOT NULL, referred_user_id TEXT, referral_code TEXT NOT NULL, reward_inr REAL, status TEXT, booking_id TEXT, created_at TEXT, rewarded_at TEXT);
  `);
  for (const name of ["030_referral_program_v3.sql", "037_program_settings.sql", "042_affiliate_wallet_transfers.sql", "046_refund_credit.sql"]) {
    executeMigrationSql(db, upSql(name));
  }
  db.exec(`
    INSERT INTO users (id, name, email) VALUES ('usr_asha', 'Asha', 'asha@example.test'), ('usr_friend', 'Friend', 'friend@example.test');
    INSERT INTO bookings (id, ref, user_id, supplier_id, amount_inr, commission_amount, commission_rate_snapshot, payment_method, razorpay_payment_id)
      VALUES ('bk_cab', 'IH-CAB', 'usr_asha', 'sup_1', 4000, 600, 15, 'RAZORPAY', 'pay_cab');
    INSERT INTO payouts (id, booking_id, gross_amount, commission_amount, net_payout, payout_status) VALUES ('po_cab', 'bk_cab', 4000, 600, 3400, 'PAYMENT_HELD');
    INSERT INTO driver_assignments (id, booking_id, assignment_status) VALUES ('da_cab', 'bk_cab', 'ASSIGNED');
  `);
  return db;
}

function cancelBySupplier(db) {
  const booking = db.prepare("SELECT * FROM bookings WHERE id = 'bk_cab'").get();
  return creditSupplierCancellationToWallet(db, { booking, reason: "Vehicle breakdown", now: NOW });
}

function fakeRazorpay() {
  const calls = [];
  return { calls, gateways: { razorpay: async (request) => { calls.push(request); return { refundId: `rfnd_${calls.length}`, status: "PROCESSED" }; } } };
}

test("a supplier cancellation refunds what the traveler paid to their wallet, and pays the supplier nothing", () => {
  const db = database();
  const result = cancelBySupplier(db);
  assert.deepEqual(result, { creditInr: 4000, cashRefundableUntil: "2026-09-25 06:00:00" });

  const booking = db.prepare("SELECT status, payment_status, refund_amount_inr, refunded_to_wallet_inr, cancellation_reason FROM bookings WHERE id = 'bk_cab'").get();
  assert.deepEqual({ ...booking }, { status: "cancelled", payment_status: "REFUNDED_TO_WALLET", refund_amount_inr: 4000, refunded_to_wallet_inr: 4000, cancellation_reason: "Vehicle breakdown" });
  const payout = db.prepare("SELECT gross_amount, net_payout, payout_status FROM payouts WHERE id = 'po_cab'").get();
  assert.deepEqual({ ...payout }, { gross_amount: 0, net_payout: 0, payout_status: "CANCELLED" });
  assert.equal(db.prepare("SELECT assignment_status FROM driver_assignments WHERE id = 'da_cab'").get().assignment_status, "CANCELLED");
  assert.equal(db.prepare("SELECT amount FROM financial_ledger WHERE event_type = 'REFUND_TO_WALLET'").get().amount, 4000);

  const credit = db.prepare("SELECT entry_type, credit_source, remaining_inr, expires_at FROM wallet_transactions WHERE booking_id = 'bk_cab'").get();
  assert.deepEqual({ ...credit }, { entry_type: "SUPPLIER_CANCEL_CREDIT", credit_source: "REFUND", remaining_inr: 4000, expires_at: null });
  assert.deepEqual(walletBalances(db, "usr_asha"), { totalInr: 4000, affiliateInr: 0, refundInr: 4000, otherInr: 0 });
  assert.deepEqual(listCashRefundableCredits(db, "usr_asha", { now: NOW }), [{ bookingId: "bk_cab", bookingRef: "IH-CAB", amountInr: 4000, cashRefundableUntil: "2026-09-25 06:00:00" }]);

  assert.throws(() => cancelBySupplier(db), /Only a paid booking/, "cancelling twice credits nothing more");
  assert.ok(reconcileWalletBalance(db, "usr_asha").matches);
});

test("refund credit pays for a whole rebooking, is spent after referral credit, and comes back as refund credit", () => {
  const db = database();
  cancelBySupplier(db);
  db.transaction(() => postWalletEntry(db, { userId: "usr_asha", entryType: "REFERRAL_CLEARED", amountInr: 500, expiresAt: "2099-01-01 00:00:00" }))();

  // A ₹3,000 rebooking: referral credit is capped at 50% / ₹2,000, refund credit is not.
  const calc = applyWalletCreditsToCheckout(db, "usr_asha", { bookingAmountInr: 3000 });
  assert.deepEqual([calc.creditDiscountInr, calc.payableAmountInr, calc.maxFromOtherInr], [3000, 0, 500]);

  db.prepare("INSERT INTO bookings (id, ref, user_id, amount_inr, wallet_credit_applied_inr) VALUES ('bk_again', 'IH-AGAIN', 'usr_asha', 0, 3000)").run();
  const spent = db.transaction(() => redeemWalletCredit(db, { userId: "usr_asha", bookingId: "bk_again", amountInr: 3000, maxFromOtherInr: calc.maxFromOtherInr }))();
  assert.equal(spent.refundInr, 2500, "the ₹500 of referral credit goes first");
  assert.deepEqual(walletBalances(db, "usr_asha"), { totalInr: 1500, affiliateInr: 0, refundInr: 1500, otherInr: 0 });

  // The traveler cancels the rebooking inside its free-cancellation window (credit paid for all of it).
  db.prepare("UPDATE bookings SET status = 'cancelled', payment_status = 'REFUND_NOT_APPLICABLE' WHERE id = 'bk_again'").run();
  restoreWalletCreditForBooking(db, "bk_again", { share: 1 });
  const restored = db.prepare("SELECT entry_type, amount_inr, credit_source FROM wallet_transactions WHERE booking_id = 'bk_again' AND amount_inr > 0 ORDER BY entry_type").all();
  assert.deepEqual(restored.map((row) => [row.entry_type, row.amount_inr, row.credit_source]),
    [["REDEMPTION_RESTORED", 500, null], ["REFUND_CREDIT_RESTORED", 2500, "REFUND"]]);
  assert.deepEqual(walletBalances(db, "usr_asha"), { totalInr: 4500, affiliateInr: 0, refundInr: 4000, otherInr: 500 });
  assert.ok(reconcileWalletBalance(db, "usr_asha").matches);
});

test("unspent refund credit goes back to the original payment method within 10 days, without paying the supplier", async () => {
  const db = database();
  cancelBySupplier(db);
  db.prepare("INSERT INTO bookings (id, ref, user_id, amount_inr, wallet_credit_applied_inr) VALUES ('bk_part', 'IH-PART', 'usr_asha', 0, 3000)").run();
  db.transaction(() => redeemWalletCredit(db, { userId: "usr_asha", bookingId: "bk_part", amountInr: 3000 }))();

  const { calls, gateways } = fakeRazorpay();
  const result = await refundCreditToSource(db, { userId: "usr_asha", bookingId: "IH-CAB", now: new Date("2026-09-24T06:00:00Z") }, gateways);
  assert.deepEqual([result.status, result.amountInr], ["PROCESSED", 1000]);
  assert.deepEqual(calls.map((call) => [call.paymentId, call.amount]), [["pay_cab", 1000]], "only the unspent ₹1,000 is refunded, against the original payment");

  const booking = db.prepare("SELECT payment_status, refunded_amount FROM bookings WHERE id = 'bk_cab'").get();
  assert.deepEqual({ ...booking }, { payment_status: "PARTIALLY_REFUNDED", refunded_amount: 1000 });
  const payout = db.prepare("SELECT gross_amount, net_payout, payout_status FROM payouts WHERE id = 'po_cab'").get();
  assert.deepEqual({ ...payout }, { gross_amount: 0, net_payout: 0, payout_status: "CANCELLED" }, "the ₹3,000 spent elsewhere is not the supplier's");
  assert.deepEqual(walletBalances(db, "usr_asha"), { totalInr: 0, affiliateInr: 0, refundInr: 0, otherInr: 0 });
  assert.ok(reconcileWalletBalance(db, "usr_asha").matches);

  await assert.rejects(refundCreditToSource(db, { userId: "usr_asha", bookingId: "bk_cab", now: new Date("2026-09-24T07:00:00Z") }, gateways), /no refund credit/);
  assert.equal(calls.length, 1);
});

test("after 10 days refund credit stays in the wallet, and another traveler cannot claim it", async () => {
  const db = database();
  cancelBySupplier(db);
  const { calls, gateways } = fakeRazorpay();

  await assert.rejects(refundCreditToSource(db, { userId: "usr_friend", bookingId: "bk_cab", now: NOW }, gateways), (error) => error.status === 404);
  await assert.rejects(refundCreditToSource(db, { userId: "usr_asha", bookingId: "bk_cab", now: new Date("2026-09-25T06:00:01Z") }, gateways), /10 days/);
  assert.equal(calls.length, 0);
  assert.deepEqual(listCashRefundableCredits(db, "usr_asha", { now: new Date("2026-09-25T06:00:01Z") }), []);
  assert.equal(walletBalances(db, "usr_asha").refundInr, 4000);
});

test("a referral clawback never takes refund credit", () => {
  const db = database();
  cancelBySupplier(db);
  db.exec(`
    INSERT INTO referral_relationships (id, referrer_user_id, referred_user_id, referral_code, status, source, established_at, earns_until)
      VALUES ('rel_1', 'usr_asha', 'usr_friend', 'REF-ASHA', 'ACTIVE', 'SIGNUP_LINK', '2026-01-01 00:00:00', '2099-01-01 00:00:00');
    INSERT INTO bookings (id, ref, user_id, amount_inr, status, payment_status) VALUES ('bk_ref', 'IH-REF', 'usr_friend', 10000, 'cancelled', 'REFUNDED');
    INSERT INTO referral_rewards (id, relationship_id, referrer_user_id, referred_user_id, booking_id, sequence, booking_margin_inr, referee_rate, referrer_rate, referee_amount_inr, referrer_amount_inr, status, created_at, cleared_at)
      VALUES ('rw_1', 'rel_1', 'usr_asha', 'usr_friend', 'bk_ref', 1, 3000, 0.1, 0.1, 300, 300, 'CLEARED', '2026-01-01 00:00:00', '2026-01-10 00:00:00');
  `);
  const reversal = reverseReferralReward(db, "bk_ref");
  assert.deepEqual([reversal.recoveredInr, reversal.clawbackInr], [0, 300]);
  assert.equal(walletBalances(db, "usr_asha").refundInr, 4000);
});
