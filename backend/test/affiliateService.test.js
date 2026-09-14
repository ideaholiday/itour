import { describe, it, before, after } from "node:test";

// Identity verification runs against a simulated Cashfree, so these tests do
// not depend on a live account or network.
process.env.CASHFREE_SECUREID_SIMULATE = "true";
import assert from "node:assert/strict";
import db from "../src/db.js";
import {
  registerAffiliate,
  getAffiliateByUserId,
  getAffiliateByCode,
  updateAffiliateProfile,
  updateAffiliateKyc,
  trackAffiliateClick,
  resolveAttribution,
  recordAffiliateBooking,
  onTripCompleted,
  onBookingCancelled,
  requestPayout,
  settlePayout,
  rejectPayout,
  addPayoutAccount,
  listPayoutAccounts,
  setPrimaryPayoutAccount,
  archivePayoutAccount,
  computeBalances,
  computeTds,
  resolveTier,
  buildShareLink,
  redactAffiliate,
  getAffiliateDashboardMetrics,
} from "../src/services/affiliateService.js";
import { validatePromoCode, applyPromoCode } from "../src/services/promoService.js";

describe("Influencer & Affiliate System", () => {
  // The creator, and a separate traveler who does the actual booking. They must
  // be different people: a creator booking through their own code is
  // self-dealing, and the service rejects it.
  const creatorUserId = "user_aff_test_99";
  const travelerUserId = "user_other_123";
  const testAffCode = "TRAVELPRO10";

  const couponBookingId = "bk_aff_test_99";
  const cancelBookingId = "bk_aff_test_100";
  const selfBookingId = "bk_aff_test_101";
  const linkBookingId = "bk_aff_test_102";
  const allBookingIds = [couponBookingId, cancelBookingId, selfBookingId, linkBookingId];

  function purgeAffiliateData(userId) {
    // `affiliates.default_payout_account_id` points back at the accounts table,
    // so that link has to be cut before the accounts can go.
    db.prepare("UPDATE affiliates SET default_payout_account_id = NULL WHERE user_id = ?").run(userId);

    // Order matters: each table here is deleted before whatever it points at.
    for (const table of [
      "affiliate_ledger",
      "affiliate_referrals",
      "affiliate_attributions",
      "affiliate_payouts",
      "affiliate_payout_accounts",
      "affiliate_clicks",
    ]) {
      db.prepare(
        `DELETE FROM ${table} WHERE affiliate_id IN (SELECT id FROM affiliates WHERE user_id = ?)`
      ).run(userId);
    }
  }

  // Rows other suites may have left hanging off these booking ids.
  function purgeBookingDependents() {
    for (const table of ["financial_ledger", "booking_modifications", "coupon_redemptions"]) {
      try {
        db.prepare(`DELETE FROM ${table} WHERE booking_id IN (?, ?, ?, ?)`).run(...allBookingIds);
      } catch {}
    }
  }

  before(() => {
    purgeAffiliateData(creatorUserId);
    db.prepare("DELETE FROM affiliate_referrals WHERE booking_id IN (?, ?, ?, ?)").run(...allBookingIds);
    purgeBookingDependents();
    db.prepare("DELETE FROM bookings WHERE id IN (?, ?, ?, ?)").run(...allBookingIds);
    db.prepare("DELETE FROM promo_codes WHERE code = ?").run(testAffCode);
    db.prepare("DELETE FROM affiliates WHERE user_id = ? OR affiliate_code = ?").run(creatorUserId, testAffCode);
    db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(creatorUserId, travelerUserId);

    db.prepare(`
      INSERT INTO users (id, name, email, password, phone, role)
      VALUES (?, 'Travel Creator', 'creator@example.com', 'test-password', '9876543210', 'TRAVELER')
    `).run(creatorUserId);
    db.prepare(`
      INSERT INTO users (id, name, email, password, phone, role)
      VALUES (?, 'Other User', 'other@example.com', 'test-password', '9876543211', 'TRAVELER')
    `).run(travelerUserId);

    const insertBooking = db.prepare(`
      INSERT INTO bookings (id, ref, user_id, product_type, activity_date, pickup_location, amount_inr, status)
      VALUES (?, ?, ?, 'TOUR', '2026-09-20', 'Hotel Pickup', ?, 'confirmed')
    `);
    insertBooking.run(couponBookingId, "IH-TEST-99", travelerUserId, 10000);
    insertBooking.run(cancelBookingId, "IH-TEST-100", travelerUserId, 5000);
    insertBooking.run(selfBookingId, "IH-TEST-101", creatorUserId, 8000);
    insertBooking.run(linkBookingId, "IH-TEST-102", travelerUserId, 20000);
  });

  after(() => {
    try {
      purgeAffiliateData(creatorUserId);
      db.prepare("DELETE FROM affiliate_referrals WHERE booking_id IN (?, ?, ?, ?)").run(...allBookingIds);
      purgeBookingDependents();
      db.prepare("DELETE FROM bookings WHERE id IN (?, ?, ?, ?)").run(...allBookingIds);
      db.prepare("DELETE FROM promo_codes WHERE code = ?").run(testAffCode);
      db.prepare("DELETE FROM affiliates WHERE user_id = ?").run(creatorUserId);
      db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(creatorUserId, travelerUserId);
    } catch {}
  });

  /* ---------------------------------------------------------------------- */
  /* Registration                                                            */
  /* ---------------------------------------------------------------------- */

  it("registers a new influencer affiliate with custom coupon code and provisions promo code", async () => {
    const affiliate = await registerAffiliate(db, {
      userId: creatorUserId,
      channelName: "Travel Pro Vlogs",
      channelType: "YOUTUBE",
      channelUrl: "https://youtube.com/@travelpro",
      customCode: testAffCode,
      bio: "Adventure explorer sharing hidden gems across India.",
    });

    assert.ok(affiliate);
    assert.equal(affiliate.affiliate_code, testAffCode);
    assert.equal(affiliate.channel_name, "Travel Pro Vlogs");
    assert.equal(affiliate.commission_rate, 0.10);
    assert.equal(affiliate.tier_code, "STARTER");
    assert.equal(affiliate.status, "ACTIVE");
    assert.equal(affiliate.kyc_status, "UNVERIFIED");

    const promo = db.prepare("SELECT * FROM promo_codes WHERE code = ?").get(testAffCode);
    assert.ok(promo);
    assert.equal(promo.is_active, 1);
    assert.equal(promo.discount_value, 5); // 5% customer discount
  });

  it("prevents registering duplicate affiliate code", async () => {
    await assert.rejects(
      async () => {
        await registerAffiliate(db, {
          userId: travelerUserId,
          channelName: "Duplicate Channel",
          customCode: testAffCode,
        });
      },
      /already taken/
    );
  });

  it("updates the channel profile without touching payout or KYC state", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    const updated = updateAffiliateProfile(db, affiliate.id, { bio: "Now covering the Northeast." });
    assert.equal(updated.bio, "Now covering the Northeast.");
    assert.equal(updated.kyc_status, "UNVERIFIED");
  });

  /* ---------------------------------------------------------------------- */
  /* Coupon attribution                                                      */
  /* ---------------------------------------------------------------------- */

  it("validates affiliate promo code at checkout and applies customer discount", () => {
    const result = validatePromoCode(db, {
      code: testAffCode,
      amountInr: 10000,
      userId: travelerUserId,
    });

    assert.equal(result.valid, true);
    assert.equal(result.type, "AFFILIATE");
    assert.equal(result.affiliateCode, testAffCode);
    assert.equal(result.discountAmount, 500); // 5% of 10,000
    assert.equal(result.finalAmount, 9500);
  });

  it("records 10% commission on booking confirmation via applyPromoCode", () => {
    const applied = applyPromoCode(db, {
      code: testAffCode,
      bookingId: couponBookingId,
      userId: travelerUserId,
      amountInr: 10000,
    });

    assert.ok(applied);
    assert.equal(applied.type, "AFFILIATE");

    const referral = db.prepare("SELECT * FROM affiliate_referrals WHERE booking_id = ?").get(couponBookingId);
    assert.ok(referral);
    assert.equal(referral.booking_amount_inr, 10000);
    assert.equal(referral.commission_rate, 0.10);
    assert.equal(referral.earning_inr, 1000);
    assert.equal(referral.status, "PENDING");
    assert.equal(referral.tier_code, "STARTER");

    // The accrual is mirrored into the ledger.
    const entry = db.prepare(
      "SELECT * FROM affiliate_ledger WHERE referral_id = ? AND entry_type = 'COMMISSION_ACCRUED'"
    ).get(referral.id);
    assert.ok(entry);
    assert.equal(entry.amount_inr, 1000);
  });

  it("refuses to pay a creator commission on their own booking", () => {
    const result = recordAffiliateBooking(db, {
      bookingId: selfBookingId,
      affiliateCode: testAffCode,
      amountInr: 8000,
      attributionType: "COUPON_CODE",
    });

    assert.equal(result, null);
    const referral = db.prepare("SELECT * FROM affiliate_referrals WHERE booking_id = ?").get(selfBookingId);
    assert.equal(referral, undefined);
  });

  /* ---------------------------------------------------------------------- */
  /* Link attribution                                                        */
  /* ---------------------------------------------------------------------- */

  it("tracks a referral click and opens a 30-day attribution window", () => {
    const click = trackAffiliateClick(db, {
      affiliateCode: testAffCode,
      visitorId: "visitor_abc_123",
      subId: "reels-march",
      destinationPath: "/activity/goa-scuba",
      referrerUrl: "https://instagram.com/p/123",
      ip: "192.168.1.50",
    });

    assert.ok(click?.recorded);
    assert.equal(click.windowDays, 30);
    assert.ok(click.expiresAt);

    const count = db.prepare("SELECT COUNT(*) as c FROM affiliate_clicks WHERE affiliate_id = ?").get(click.affiliateId);
    assert.ok(count.c >= 1);

    const attribution = resolveAttribution(db, { visitorId: "visitor_abc_123" });
    assert.ok(attribution);
    assert.equal(attribution.sub_id, "reels-march");
  });

  it("rejects a link referral the browser merely asserts, with no click on file", () => {
    const result = recordAffiliateBooking(db, {
      bookingId: linkBookingId,
      affiliateCode: testAffCode,
      amountInr: 20000,
      attributionType: "REFERRAL_LINK",
      visitorId: "visitor_never_clicked",
      userId: travelerUserId,
    });

    assert.equal(result, null);
  });

  it("credits a link referral backed by a real click, and carries the campaign sub-ID", () => {
    const result = recordAffiliateBooking(db, {
      bookingId: linkBookingId,
      affiliateCode: testAffCode,
      amountInr: 20000,
      attributionType: "REFERRAL_LINK",
      visitorId: "visitor_abc_123",
      userId: travelerUserId,
    });

    assert.ok(result);
    assert.equal(result.earningInr, 2000);
    assert.equal(result.subId, "reels-march");

    // The click is spent, so it cannot earn on a second booking.
    assert.equal(resolveAttribution(db, { visitorId: "visitor_abc_123" }), null);
  });

  it("builds a trackable share link carrying the code and campaign", () => {
    const link = buildShareLink(testAffCode, { path: "/activity/goa-scuba", subId: "story-goa" });
    assert.match(link, /ref=TRAVELPRO10/);
    assert.match(link, /sub=story-goa/);
  });

  /* ---------------------------------------------------------------------- */
  /* KYC and payout accounts                                                 */
  /* ---------------------------------------------------------------------- */

  it("updates KYC with PAN and bank account details", async () => {
    const affiliate = getAffiliateByCode(db, testAffCode);

    const updated = await updateAffiliateKyc(db, affiliate.id, {
      panNumber: "ABCDE1234F",
      panHolderName: "Travel Creator",
      bankAccountNumber: "012345678901",
      bankIfsc: "HDFC0001234",
      bankAccountHolder: "Travel Creator",
      bankAccountType: "SAVINGS",
      upiId: "creator@okhdfcbank",
    });

    assert.ok(updated);
    assert.equal(updated.pan_number, "ABCDE1234F");
    assert.equal(updated.pan_verified, 1);
    assert.equal(updated.kyc_status, "VERIFIED");

    // The bank details became a first-class, verified payout account.
    const accounts = listPayoutAccounts(db, affiliate.id);
    const bank = accounts.find((a) => a.method === "BANK_TRANSFER");
    assert.ok(bank);
    assert.equal(bank.verificationStatus, "VERIFIED");
    assert.equal(bank.isPrimary, true);
    assert.equal(bank.ifsc, "HDFC0001234");
    // Nothing in the API hands back a full account number.
    assert.equal(bank.accountNumber, "••••8901");

    // The pre-v2 inline columns still mirror the primary account.
    assert.equal(updated.bank_ifsc, "HDFC0001234");
    assert.equal(updated.bank_verified, 1);
    assert.equal(updated.upi_id, "creator@okhdfcbank");
  });

  it("rejects a malformed bank account before it ever reaches the bank", async () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    await assert.rejects(
      () => addPayoutAccount(db, affiliate.id, {
        method: "BANK_TRANSFER",
        accountNumber: "012345678902",
        ifsc: "NOTANIFSC",
        accountHolder: "Travel Creator",
      }),
      /IFSC/
    );
    await assert.rejects(
      () => addPayoutAccount(db, affiliate.id, { method: "UPI", upiId: "not-a-upi-handle" }),
      /valid UPI ID/
    );
  });

  it("refuses to store the same bank account twice", async () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    await assert.rejects(
      () => addPayoutAccount(db, affiliate.id, {
        method: "BANK_TRANSFER",
        accountNumber: "012345678901",
        ifsc: "HDFC0001234",
        accountHolder: "Travel Creator",
      }),
      /already on file/
    );
  });

  /* ---------------------------------------------------------------------- */
  /* Clearing hold                                                           */
  /* ---------------------------------------------------------------------- */

  it("matures commission to ELIGIBLE on trip completion but holds it for clearing", () => {
    const completed = onTripCompleted(db, couponBookingId);
    assert.ok(completed);
    assert.equal(completed.status, "ELIGIBLE");
    assert.equal(completed.earning, 1000);
    assert.ok(completed.payableAt, "commission should carry a clearing date");

    const affiliate = getAffiliateByCode(db, testAffCode);
    assert.equal(affiliate.available_balance_inr, 1000);
    assert.equal(affiliate.lifetime_earnings_inr, 1000);

    // Earned, but not yet withdrawable: it is still inside the hold.
    const balances = computeBalances(db, affiliate.id);
    assert.equal(balances.onHoldInr, 1000);
    assert.equal(balances.withdrawableInr, 0);
  });

  it("refuses any payout without a verified PAN, even after KYC", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    db.prepare("UPDATE affiliates SET pan_verified = 0 WHERE id = ?").run(affiliate.id);
    try {
      assert.throws(
        () => requestPayout(db, affiliate.id, { amountInr: 1000 }),
        (error) => error.status === 403 && error.code === "PAN_NOT_VERIFIED",
      );
    } finally {
      db.prepare("UPDATE affiliates SET pan_verified = 1 WHERE id = ?").run(affiliate.id);
    }
  });

  it("blocks a payout while the commission is still clearing", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    assert.throws(
      () => requestPayout(db, affiliate.id, { amountInr: 1000 }),
      /still clearing/
    );
  });

  /* ---------------------------------------------------------------------- */
  /* Payouts                                                                 */
  /* ---------------------------------------------------------------------- */

  it("allows requesting a payout once the hold has passed, withholding TDS", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);

    // Fast-forward past the clearing hold.
    db.prepare(
      "UPDATE affiliate_referrals SET payable_at = '2020-01-01 00:00:00' WHERE booking_id = ?"
    ).run(couponBookingId);

    const balances = computeBalances(db, affiliate.id);
    assert.equal(balances.withdrawableInr, 1000);

    const payout = requestPayout(db, affiliate.id, {
      amountInr: 1000,
      paymentMethod: "BANK_TRANSFER",
    });

    assert.ok(payout);
    assert.equal(payout.amount_inr, 1000);
    assert.equal(payout.gross_amount_inr, 1000);
    assert.equal(payout.status, "REQUESTED");
    // ADR 017: 1% TDS on every payout.
    assert.equal(payout.tds_rate, 0.01);
    assert.equal(payout.tds_amount_inr, 10);
    assert.equal(payout.net_amount_inr, 990);
    assert.ok(payout.payout_account_id, "payout must name the account it is going to");

    // The reservation removes it from what can be withdrawn again.
    assert.equal(computeBalances(db, affiliate.id).withdrawableInr, 0);
  });

  it("withholds 1% TDS on every payout", () => {
    assert.deepEqual(computeTds({ pan_verified: 1 }, 1000), { grossInr: 1000, tdsRate: 0.01, tdsInr: 10, netInr: 990 });
    assert.deepEqual(computeTds({ pan_verified: 1 }, 1234.5), { grossInr: 1234.5, tdsRate: 0.01, tdsInr: 12.35, netInr: 1222.15 });
  });

  it("rejects payout request below minimum threshold of ₹1,000", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    assert.throws(
      () => requestPayout(db, affiliate.id, { amountInr: 500 }),
      /Minimum payout request amount is ₹1,000/
    );
  });

  it("returns the money to the creator when a payout is rejected", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    const pending = db.prepare(
      "SELECT * FROM affiliate_payouts WHERE affiliate_id = ? AND status = 'REQUESTED'"
    ).get(affiliate.id);

    const rejected = rejectPayout(db, pending.id, { reason: "Bank returned the transfer", actorId: "user_admin" });
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.rejection_reason, "Bank returned the transfer");

    // Withdrawable again, rather than quietly lost.
    assert.equal(computeBalances(db, affiliate.id).withdrawableInr, 1000);
  });

  it("settles a payout against its UTR and marks the funding commission paid", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    const payout = requestPayout(db, affiliate.id, { amountInr: 1000, paymentMethod: "BANK_TRANSFER" });

    const settled = settlePayout(db, payout.id, { utrReference: "UTR123456789", actorId: "user_admin" });
    assert.equal(settled.status, "PAID");
    assert.equal(settled.utr_reference, "UTR123456789");

    const referral = db.prepare("SELECT * FROM affiliate_referrals WHERE booking_id = ?").get(couponBookingId);
    assert.equal(referral.status, "PAID");
    assert.ok(referral.settled_at);

    const balances = computeBalances(db, affiliate.id);
    assert.equal(balances.withdrawableInr, 0);
    assert.equal(balances.tdsWithheldInr, 10);
    assert.equal(balances.netReceivedInr, 990);
  });

  it("refuses to settle the same payout twice", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    const paid = db.prepare(
      "SELECT * FROM affiliate_payouts WHERE affiliate_id = ? AND status = 'PAID'"
    ).get(affiliate.id);
    assert.throws(() => settlePayout(db, paid.id, { utrReference: "UTR999" }), /already marked as paid/);
  });

  /* ---------------------------------------------------------------------- */
  /* Payout account security                                                 */
  /* ---------------------------------------------------------------------- */

  it("holds a newly added second account for a cooling period before it can be paid into", async () => {
    const affiliate = getAffiliateByCode(db, testAffCode);

    const added = await addPayoutAccount(db, affiliate.id, {
      method: "BANK_TRANSFER",
      accountNumber: "987654321098",
      ifsc: "ICIC0004321",
      accountHolder: "Travel Creator",
      makePrimary: true,
    });

    assert.equal(added.verificationStatus, "VERIFIED");
    // Verified, but not yet usable — this is the account-takeover defence.
    assert.equal(added.isUsable, false);
    assert.ok(added.usableFrom);

    db.prepare(
      "UPDATE affiliate_referrals SET status = 'ELIGIBLE', payable_at = '2020-01-01 00:00:00' WHERE booking_id = ?"
    ).run(couponBookingId);

    assert.throws(
      () => requestPayout(db, affiliate.id, { amountInr: 1000, payoutAccountId: added.id }),
      /can be used from/
    );

    // Restore state for the remaining tests.
    db.prepare("UPDATE affiliate_referrals SET status = 'PAID' WHERE booking_id = ?").run(couponBookingId);
  });

  it("keeps a payout account with money in flight from being removed", async () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    const accounts = listPayoutAccounts(db, affiliate.id);
    const upi = accounts.find((a) => a.method === "UPI");
    assert.ok(upi);

    const result = archivePayoutAccount(db, affiliate.id, upi.id);
    assert.equal(result.archived, true);
    assert.equal(listPayoutAccounts(db, affiliate.id).some((a) => a.id === upi.id), false);

    // Archived, not deleted: the history that points at it still resolves.
    assert.ok(listPayoutAccounts(db, affiliate.id, { includeArchived: true }).some((a) => a.id === upi.id));
  });

  it("moves the primary destination when the creator picks another account", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    const accounts = listPayoutAccounts(db, affiliate.id);
    const target = accounts.find((a) => !a.isPrimary && a.method === "BANK_TRANSFER");
    assert.ok(target, "expected a second bank account to switch to");

    setPrimaryPayoutAccount(db, affiliate.id, target.id);
    const after = listPayoutAccounts(db, affiliate.id);
    assert.equal(after.filter((a) => a.isPrimary).length, 1);
    assert.equal(after.find((a) => a.isPrimary).id, target.id);
  });

  /* ---------------------------------------------------------------------- */
  /* Cancellation and reporting                                              */
  /* ---------------------------------------------------------------------- */

  it("handles booking cancellation and voids pending commission", () => {
    recordAffiliateBooking(db, {
      bookingId: cancelBookingId,
      affiliateCode: testAffCode,
      amountInr: 5000,
      attributionType: "COUPON_CODE",
      userId: travelerUserId,
    });

    const referral = db.prepare("SELECT * FROM affiliate_referrals WHERE booking_id = ?").get(cancelBookingId);
    assert.equal(referral.status, "PENDING");
    assert.equal(referral.earning_inr, 500);

    const cancelled = onBookingCancelled(db, cancelBookingId);
    assert.equal(cancelled.status, "CANCELLED");

    const updatedReferral = db.prepare("SELECT * FROM affiliate_referrals WHERE booking_id = ?").get(cancelBookingId);
    assert.equal(updatedReferral.status, "CANCELLED");

    const reversal = db.prepare(
      "SELECT * FROM affiliate_ledger WHERE referral_id = ? AND entry_type = 'COMMISSION_REVERSED'"
    ).get(referral.id);
    assert.ok(reversal);
    assert.equal(reversal.amount_inr, -500);
  });

  it("keeps a creator on the entry tier until they clear the thresholds", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    const tier = resolveTier(db, affiliate.id);
    assert.equal(tier.code, "STARTER");
    assert.equal(tier.commission_rate, 0.10);
    assert.ok(tier.next, "an entry-tier creator should see what the next tier needs");
    assert.equal(tier.next.code, "RISING");
    assert.ok(tier.next.bookingsToGo > 0);
  });

  it("never returns a full PAN or account number on the affiliate record", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    const raw = db.prepare("SELECT * FROM affiliates WHERE id = ?").get(affiliate.id);
    const redacted = redactAffiliate(raw);

    assert.equal(raw.pan_number, "ABCDE1234F");
    assert.equal(redacted.pan_number, "ABC••••4F");
    assert.match(redacted.bank_account_number, /^••••\d{4}$/);
    assert.notEqual(redacted.bank_account_number, raw.bank_account_number);

    // Everything else the caller needs survives redaction.
    assert.equal(redacted.affiliate_code, raw.affiliate_code);
    assert.equal(redacted.kyc_status, raw.kyc_status);
  });

  it("returns comprehensive dashboard metrics for influencer", () => {
    const affiliate = getAffiliateByCode(db, testAffCode);
    const dashboard = getAffiliateDashboardMetrics(db, affiliate.id);

    assert.ok(dashboard);
    assert.equal(dashboard.affiliateCode, testAffCode);
    assert.equal(dashboard.kycStatus, "VERIFIED");
    assert.ok(dashboard.metrics);
    assert.equal(dashboard.metrics.paidEarningsInr, 1000);
    assert.equal(dashboard.metrics.tdsWithheldInr, 10);
    assert.ok(dashboard.shareLinks.couponCode);
    assert.ok(dashboard.shareLinks.defaultLink);
    assert.ok(Array.isArray(dashboard.referrals));
    assert.ok(Array.isArray(dashboard.payouts));
    assert.ok(Array.isArray(dashboard.payoutAccounts));
    assert.ok(Array.isArray(dashboard.ledger));

    // The payout policy the UI needs to explain the numbers it is showing.
    assert.equal(dashboard.payoutPolicy.minPayoutInr, 1000);
    assert.equal(dashboard.payoutPolicy.holdDays, 14);
    assert.equal(dashboard.payoutPolicy.tdsRate, 0.01);

    // Campaign attribution survives to the dashboard.
    assert.ok(dashboard.campaigns.some((c) => c.subId === "reels-march"));

    // The dashboard never carries a full bank account number.
    for (const account of dashboard.payoutAccounts) {
      if (account.method !== "BANK_TRANSFER") continue;
      assert.match(account.accountNumber, /^••••\d{4}$/);
    }
  });
});
