import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { markReferralTripCompleted, processReferralLifecycle, reconcileWalletBalance } from "../src/services/referralService.js";
import { hashPassword } from "../src/lib/passwords.js";

const ADMIN_EMAIL = "referral.admin@example.test";
const ADMIN_PASSWORD = "Integration@Admin2026";

let api;

before(async () => {
  api = await startTestServer();
});

after(async () => {
  await api?.stop();
});

function futureDate(days = 21) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function signup({ name, email, phone, visitorId, referralCode }) {
  const result = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name, email, password: "Integration@2026", phone, visitorId, referralCode },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  return result.data;
}

/** Runs referral work directly on the server's database file, as the scheduled job would. */
function withDatabase(work) {
  const database = new Database(api.databasePath);
  try {
    return work(database);
  } finally {
    database.close();
  }
}

test("Travel & Earn: invite, sign up, book with the friend discount, earn after the trip, spend the credit", async (t) => {
  const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const activity = activities.data.find((item) => item.groupType === "SHARED") || activities.data[0];
  assert.ok(activity?.id, "demo data has a bookable Goa activity");

  const quoteInput = {
    product_id: activity.id,
    activity_date: futureDate(),
    adults: 2,
    children: 0,
    luggage_bags: 0,
    pickup_time: "09:00",
    pickup_location: "Calangute, Goa",
  };

  const priya = await signup({ name: "Priya Menon", email: "priya.referrer@example.test", phone: "+919811100001", visitorId: "visitor-priya-0001" });
  let referralCode;
  let rahul;
  let rahulBooking;
  let referrerCredit;

  await t.test("the referrer gets a code and a share link", async () => {
    const profile = await requestJson(api.baseUrl, "/api/loyalty/profile", { token: priya.token });
    assert.equal(profile.response.status, 200, JSON.stringify(profile.data));
    referralCode = profile.data.referralCode;
    assert.match(referralCode, /^REF-/);
    assert.match(profile.data.referralLink, new RegExp(`ref=${referralCode}$`));
    assert.equal(profile.data.policy.friendDiscountPct, 10);
    assert.equal(profile.data.policy.referrerRewardPct, 10);

    const publicInfo = await requestJson(api.baseUrl, `/api/loyalty/public-ref/${referralCode}`);
    assert.equal(publicInfo.data.referrerName, "Priya");
  });

  await t.test("a friend opens the link, signs up without typing the code, and sees the discount in the quote", async () => {
    const click = await requestJson(api.baseUrl, "/api/referral/track-click", {
      body: { referralCode, visitorId: "visitor-rahul-0001", channel: "WHATSAPP", landingPath: "/signup" },
    });
    assert.equal(click.response.status, 200, JSON.stringify(click.data));
    assert.equal(click.data.tracked, true);

    rahul = await signup({ name: "Rahul Mehta", email: "rahul.friend@example.test", phone: "+919822200002", visitorId: "visitor-rahul-0001" });
    assert.deepEqual(rahul.referral, { referred: true });

    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { token: rahul.token, body: quoteInput });
    assert.equal(quote.response.status, 200, JSON.stringify(quote.data));
    assert.equal(quote.data.quote.referral.eligible, true);
    assert.equal(quote.data.quote.referral.referrerFirstName, "Priya");
    assert.ok(quote.data.quote.referral.discountInr > 0);
    assert.equal("commissionAmount" in quote.data.quote, false, "commission is never sent to the browser");
  });

  await t.test("the booking charges the discounted price and still reconciles with the supplier payout", async () => {
    const created = await requestJson(api.baseUrl, "/api/bookings", {
      token: rahul.token,
      headers: { "Idempotency-Key": "referral-rahul-booking-1" },
      body: { ...quoteInput, traveler_name: "Rahul Mehta", traveler_email: "rahul.friend@example.test", traveler_phone: "+919822200002", payment_method: "DEMO" },
    });
    assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
    rahulBooking = created.data;
    assert.ok(rahulBooking.referral_discount_inr > 0);
    assert.equal(rahulBooking.amount_inr, rahulBooking.original_amount_inr - rahulBooking.referral_discount_inr);

    withDatabase((database) => {
      const row = database.prepare("SELECT * FROM bookings WHERE id = ?").get(rahulBooking.bookingId);
      assert.equal(row.referral_discount_inr, Math.floor(row.commission_amount * 0.1));
      assert.equal(
        Math.round((row.amount_inr + row.wallet_credit_applied_inr + row.referral_discount_inr) * 100),
        Math.round((row.commission_amount + row.supplier_payout_amount) * 100),
        "discounts come out of commission, not the supplier's payout",
      );
      const reward = database.prepare("SELECT * FROM referral_rewards WHERE booking_id = ?").get(rahulBooking.bookingId);
      assert.equal(reward.status, "ACCRUED");
      assert.equal(reward.referrer_amount_inr, Math.floor(row.commission_amount * 0.1));
      referrerCredit = reward.referrer_amount_inr;
    });

    const payment = await requestJson(api.baseUrl, "/api/checkout/demo-payment", { token: rahul.token, body: { bookingId: rahulBooking.bookingId } });
    assert.equal(payment.response.status, 200, `${JSON.stringify(payment.data)}\n${api.output()}`);

    const invoice = await requestJson(api.baseUrl, `/api/bookings/${rahulBooking.ref}/documents/invoice`, { token: rahul.token });
    assert.equal(invoice.response.status, 200);
    assert.match(invoice.data, /Friend referral discount/);

    // The voucher carries Rahul's own invite link, so the loop continues.
    const voucher = await requestJson(api.baseUrl, `/api/bookings/${rahulBooking.ref}/documents/voucher`, { token: rahul.token });
    assert.equal(voucher.response.status, 200);
    assert.match(voucher.data, /signup\?ref=REF-[A-Z0-9]+&amp;ch=VOUCHER/);
  });

  await t.test("the referrer is credited only after the trip and the clearing hold", async () => {
    withDatabase((database) => {
      database.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(rahulBooking.bookingId);
      database.transaction(() => markReferralTripCompleted(database, rahulBooking.bookingId))();
      processReferralLifecycle(database);
    });
    const clearing = await requestJson(api.baseUrl, "/api/referral/me", { token: priya.token });
    assert.equal(clearing.response.status, 200, JSON.stringify(clearing.data));
    assert.equal(clearing.data.wallet.balanceInr, 0);
    assert.equal(clearing.data.totals.clearingInr, referrerCredit);
    assert.equal(clearing.data.rewards[0].stage, "CLEARING");

    withDatabase((database) => processReferralLifecycle(database, { now: new Date(Date.now() + 8 * 86_400_000) }));
    const credited = await requestJson(api.baseUrl, "/api/loyalty/profile", { token: priya.token });
    assert.equal(credited.data.walletBalanceInr, referrerCredit);
    assert.equal(credited.data.successfulReferralsCount, 1);
    assert.equal(credited.data.friends[0].firstName, "Rahul");

    // A second booking by the same friend: no friend discount, but the referrer earns again.
    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { token: rahul.token, body: { ...quoteInput, activity_date: futureDate(40) } });
    assert.equal(quote.data.quote.referral.eligible, false);
    assert.equal(quote.data.quote.referral.reason, "FIRST_TRIP_USED");
  });

  await t.test("the referrer spends the credit on their own booking, through the ledger", async () => {
    const created = await requestJson(api.baseUrl, "/api/bookings", {
      token: priya.token,
      headers: { "Idempotency-Key": "referral-priya-booking-1" },
      body: {
        ...quoteInput, activity_date: futureDate(30),
        traveler_name: "Priya Menon", traveler_email: "priya.referrer@example.test", traveler_phone: "+919811100001",
        payment_method: "DEMO", wallet_credit_inr: referrerCredit,
      },
    });
    assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
    assert.equal(created.data.wallet_credit_applied_inr, referrerCredit);
    assert.equal(created.data.referral_discount_inr, 0, "the referrer is not their own friend");

    withDatabase((database) => {
      const ledger = database.prepare("SELECT entry_type, amount_inr FROM wallet_transactions WHERE user_id = ? ORDER BY created_at, id").all(priya.user.id);
      assert.deepEqual(ledger.map((row) => row.entry_type).sort(), ["REDEMPTION", "REFERRAL_CLEARED"]);
      assert.ok(reconcileWalletBalance(database, priya.user.id).matches);
    });

    // Asking for more credit than the balance holds is capped, never overdrawn.
    const greedy = await requestJson(api.baseUrl, "/api/bookings", {
      token: priya.token,
      headers: { "Idempotency-Key": "referral-priya-booking-2" },
      body: {
        ...quoteInput, activity_date: futureDate(31),
        traveler_name: "Priya Menon", traveler_email: "priya.referrer@example.test", traveler_phone: "+919811100001",
        payment_method: "DEMO", wallet_credit_inr: 5000,
      },
    });
    assert.equal(greedy.response.status, 201, JSON.stringify(greedy.data));
    assert.equal(greedy.data.wallet_credit_applied_inr, 0);
  });

  await t.test("a second account on the referrer's phone gets no discount and is blocked", async () => {
    const click = await requestJson(api.baseUrl, "/api/referral/track-click", { body: { referralCode, visitorId: "visitor-alt-00001" } });
    assert.equal(click.data.tracked, true);
    const alt = await signup({ name: "P M", email: "priya.second@example.test", phone: "9811100001", visitorId: "visitor-alt-00001" });
    assert.equal(alt.referral, null);

    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { token: alt.token, body: { ...quoteInput, referral_code: referralCode } });
    assert.equal(quote.data.quote.referral.eligible, false);
    assert.equal(quote.data.quote.referral.reason, "BLOCKED");
  });

  await t.test("operations see the program's cost as a share of margin and the blocked pairing", async () => {
    withDatabase((database) => {
      database.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_referral_admin', 'Ops Admin', ?, ?, 'ADMIN')")
        .run(ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD));
    });
    const login = await requestJson(api.baseUrl, "/api/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    assert.equal(login.response.status, 200, JSON.stringify(login.data));

    const forbidden = await requestJson(api.baseUrl, "/api/referral/admin/metrics", { token: rahul.token });
    assert.equal(forbidden.response.status, 403);

    const metrics = await requestJson(api.baseUrl, "/api/referral/admin/metrics?days=30", { token: login.data.token });
    assert.equal(metrics.response.status, 200, JSON.stringify(metrics.data));
    assert.equal(metrics.data.referredFirstTrips, 1);
    assert.ok(metrics.data.costPctOfMargin > 0 && metrics.data.costPctOfMargin <= 20, `cost was ${metrics.data.costPctOfMargin}%`);
    assert.equal(metrics.data.walletDiscrepancies, 0);

    const queue = await requestJson(api.baseUrl, "/api/referral/admin/review", { token: login.data.token });
    assert.equal(queue.response.status, 200);
    assert.equal(queue.data.blockedRelationships.length, 1);
    assert.equal(queue.data.blockedRelationships[0].blocked_reason, "SAME_PHONE");
  });
});
