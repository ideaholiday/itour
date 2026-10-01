import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * IdeaHoliday B2B agent bookings (ADR 054, plan B2): an approved agency pays
 * its agent price, out of IdeaHoliday's commission, with no coupon; the booking
 * is IH_B2B; the agency gets the invoice and the guest gets the voucher only.
 * Circuits freeze the agent discount in the quote.
 */

let api;
before(async () => { api = await startTestServer(); });
after(async () => { await api?.stop(); });

const futureDate = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const withDatabase = (work) => {
  const database = new Database(api.databasePath);
  try { return work(database); } finally { database.close(); }
};
const waitFor = async (read, ready) => {
  let value = read();
  for (let i = 0; i < 40 && !ready(value); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = read();
  }
  return value;
};

test("an approved agency books at its agent price, single and circuit", async (t) => {
  const activities = await requestJson(api.baseUrl, "/api/activities?destination=Goa&type=DAY_TOUR");
  const products = activities.data.slice(0, 2);
  assert.equal(products.length, 2, "demo data has two Goa tours");

  const signup = async (name, email, phone) => (await requestJson(api.baseUrl, "/api/auth/signup", { body: { name, email, password: "Integration@2026", phone } })).data;
  const agent = await signup("Sana Mirza", "sana.agent@example.test", "+919876522233");
  const traveler = await signup("Ravi Shah", "ravi.b2c@example.test", "+919876522244");
  withDatabase((database) => database.prepare(`INSERT INTO travel_agencies (id, user_id, agency_name, contact_name, phone, gstin, pan, city, state, discount_pct, status)
    VALUES ('agy_it_awadh', ?, 'Awadh Holidays', 'Sana Mirza', '+919876522233', '09ABCDE1234F1Z5', 'ABCDE1234F', 'Lucknow', 'Uttar Pradesh', 8, 'APPROVED')`).run(agent.user.id));

  const quoteInput = { product_id: products[0].id, activity_date: futureDate(20), adults: 2, children: 0, luggage_bags: 0, pickup_time: "09:00", pickup_location: "Calangute, Goa" };
  const guest = { traveler_name: "Meera Kapoor", traveler_email: "meera.client@example.test", traveler_phone: "+919811100001", payment_method: "DEMO" };

  await t.test("the quote shows the agent price; a traveler's doesn't", async () => {
    const quote = await requestJson(api.baseUrl, "/api/bookings/quote", { token: agent.token, body: { ...quoteInput, promo_code: "ANYCODE" } });
    assert.equal(quote.response.status, 200, JSON.stringify(quote.data));
    const { agent: price, breakdown } = quote.data.quote;
    assert.equal(price.discountPct, 8);
    assert.equal(price.websitePriceInr, breakdown.totalAmount);
    assert.equal(price.discountInr, Math.round(breakdown.totalAmount * 0.08));
    assert.equal(price.agentPriceInr, breakdown.totalAmount - price.discountInr);
    assert.equal(quote.data.quote.coupon, null, "no coupon for agents");
    const plain = await requestJson(api.baseUrl, "/api/bookings/quote", { token: traveler.token, body: quoteInput });
    assert.equal(plain.data.quote.agent, undefined);
  });

  let bookingId;
  await t.test("the booking charges the agent price, out of commission", async () => {
    const withCoupon = await requestJson(api.baseUrl, "/api/bookings", { token: agent.token, headers: { "Idempotency-Key": "agent-coupon-0001" }, body: { ...quoteInput, ...guest, promo_code: "ITFLAT50" } });
    assert.equal(withCoupon.response.status, 400, JSON.stringify(withCoupon.data));
    assert.equal(withCoupon.data.code, "AGENT_NO_COUPONS");

    const created = await requestJson(api.baseUrl, "/api/bookings", { token: agent.token, headers: { "Idempotency-Key": "agent-booking-0001" }, body: { ...quoteInput, ...guest } });
    assert.equal(created.response.status, 201, `${JSON.stringify(created.data)}\n${api.output()}`);
    bookingId = created.data.bookingId;
    const row = withDatabase((database) => database.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId));
    assert.equal(row.source, "IH_B2B");
    assert.equal(row.agency_id, "agy_it_awadh");
    assert.equal(row.user_id, agent.user.id, "the agency owns the booking");
    assert.equal(row.traveler_name, "Meera Kapoor");
    assert.equal(row.agent_discount_inr, Math.round(created.data.original_amount_inr * 0.08));
    assert.equal(row.amount_inr, created.data.original_amount_inr - row.agent_discount_inr);
    assert.ok(row.agent_discount_inr < row.commission_amount, "the discount stays below the commission");
    assert.equal(row.amount_inr + row.agent_discount_inr, row.commission_amount + row.supplier_payout_amount, "the supplier's payout is untouched");
    const payout = withDatabase((database) => database.prepare("SELECT gross_amount, net_payout FROM payouts WHERE booking_id = ?").get(bookingId));
    assert.deepEqual([payout.gross_amount, payout.net_payout], [created.data.original_amount_inr, row.supplier_payout_amount]);

    const paid = await requestJson(api.baseUrl, "/api/checkout/demo-payment", { token: agent.token, body: { bookingId } });
    assert.equal(paid.response.status, 200, `${JSON.stringify(paid.data)}\n${api.output()}`);
  });

  await t.test("the agency gets the invoice; the guest gets the voucher only", async () => {
    const ref = withDatabase((database) => database.prepare("SELECT ref FROM bookings WHERE id = ?").get(bookingId).ref);
    const invoice = await fetch(`${api.baseUrl}/api/bookings/${ref}/documents/invoice`, { headers: { Authorization: `Bearer ${agent.token}` } });
    assert.equal(invoice.status, 200);
    const html = await invoice.text();
    assert.ok(html.includes("Awadh Holidays") && html.includes("09ABCDE1234F1Z5"), "billed to the agency with its GSTIN");
    assert.ok(html.includes("Agent discount (8%)"));

    const deliveries = await waitFor(
      () => withDatabase((database) => database.prepare("SELECT recipient_address, body FROM notification_deliveries WHERE event_type = 'BOOKING_CONFIRMED' AND channel = 'EMAIL' AND event_key LIKE ?").all(`${bookingId}:%`)),
      (rows) => rows.some((row) => row.recipient_address === "meera.client@example.test") && rows.some((row) => row.recipient_address === "sana.agent@example.test"),
    );
    const toGuest = deliveries.find((row) => row.recipient_address === "meera.client@example.test");
    const toAgent = deliveries.find((row) => row.recipient_address === "sana.agent@example.test");
    assert.ok(toGuest && toAgent, JSON.stringify(deliveries));
    assert.ok(toGuest.body.includes("Voucher:") && !toGuest.body.includes("Invoice"), "the guest never sees the invoice or price");
    assert.ok(toGuest.body.includes("Booked for you by Awadh Holidays"));
    assert.ok(toAgent.body.includes("Invoice (for Awadh Holidays)"));
  });

  await t.test("the dashboard lists the agency's bookings, totals and CSV statement", async () => {
    assert.equal((await requestJson(api.baseUrl, "/api/agents/bookings", { token: traveler.token })).data.code, "NO_AGENCY");
    const listed = await requestJson(api.baseUrl, "/api/agents/bookings?status=upcoming", { token: agent.token });
    assert.equal(listed.response.status, 200, JSON.stringify(listed.data));
    const [row] = listed.data.bookings;
    assert.equal(listed.data.bookings.length, 1);
    assert.equal(row.id, bookingId);
    assert.equal(row.guestName, "Meera Kapoor");
    assert.equal(row.paid, true);
    assert.equal(row.canCancel, true);
    assert.equal(row.websitePriceInr - row.agentDiscountInr, row.paidInr);
    assert.deepEqual(
      [listed.data.totals.bookings, listed.data.totals.guests, listed.data.totals.paidInr, listed.data.totals.agentDiscountInr],
      [1, 2, row.paidInr, row.agentDiscountInr],
    );
    assert.equal((await requestJson(api.baseUrl, "/api/agents/bookings?status=cancelled", { token: agent.token })).data.bookings.length, 0);
    assert.equal((await requestJson(api.baseUrl, "/api/agents/bookings?q=nobody", { token: agent.token })).data.bookings.length, 0);
    assert.equal((await requestJson(api.baseUrl, `/api/agents/bookings?dateBy=booked&from=${futureDate(1)}`, { token: agent.token })).data.bookings.length, 0,
      "booked today, so nothing from tomorrow on");

    const csv = await fetch(`${api.baseUrl}/api/agents/bookings.csv?from=2020-01-01&to=bad"value`, { headers: { Authorization: `Bearer ${agent.token}` } });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-disposition"), /agent_statement_2020-01-01\.csv/, "only a valid date reaches the filename");
    const lines = (await csv.text()).trim().split("\r\n");
    assert.match(lines[0], /^Reference,Booked on,Trip date/);
    assert.ok(lines[1].includes("Meera Kapoor"));
    assert.ok(lines.at(-1).startsWith("Total,"));
  });

  await t.test("the agency cancels its booking and hears about the refund", async () => {
    const cancelled = await requestJson(api.baseUrl, "/api/checkout/cancel-booking", { token: agent.token, body: { bookingId, reason: "Client changed plans" } });
    assert.equal(cancelled.response.status, 200, `${JSON.stringify(cancelled.data)}\n${api.output()}`);
    const listed = await requestJson(api.baseUrl, "/api/agents/bookings?status=cancelled", { token: agent.token });
    assert.equal(listed.data.bookings.length, 1);
    const [row] = listed.data.bookings;
    assert.equal(row.canCancel, false);
    assert.equal(row.netInr, row.paidInr - row.refundInr);
    const refundTo = await waitFor(
      () => withDatabase((database) => database.prepare(`SELECT d.recipient_address FROM notification_deliveries d JOIN refunds r ON d.event_key LIKE r.id || ':%'
        WHERE r.booking_id = ? AND d.event_type = 'REFUND_STATUS' AND d.channel = 'EMAIL'`).all(bookingId).map((r) => r.recipient_address)),
      (rows) => rows.length > 0,
    );
    assert.ok(refundTo.includes("sana.agent@example.test") && !refundTo.includes("meera.client@example.test"), `refund news goes to the agency: ${refundTo}`);
  });

  await t.test("a circuit quote freezes the agent discount and the order charges it", async () => {
    const travelDate = futureDate(25);
    const itinerary = await requestJson(api.baseUrl, "/api/itineraries", {
      token: agent.token,
      body: {
        title: "Agent Goa circuit", destination: "Goa", startDate: travelDate, daysCount: 2, adultsCount: 2, childrenCount: 0,
        items: products.map((product, index) => ({ id: `agent_item_${index + 1}`, dayNumber: index + 1, title: product.title, location: "Goa",
          productId: product.id, type: "TOUR", timeSlot: "MORNING", vehicleCategory: product.groupType === "SHARED" ? "SHARED_SEAT" : "SEDAN" })),
      },
    });
    assert.equal(itinerary.response.status, 201, JSON.stringify(itinerary.data));
    const quote = await requestJson(api.baseUrl, `/api/itineraries/${itinerary.data.itinerary.id}/quote`, { token: agent.token, body: { startDate: travelDate, adultsCount: 2, childrenCount: 0 } });
    assert.equal(quote.response.status, 201, JSON.stringify(quote.data));
    const circuit = quote.data.quote;
    const expected = circuit.lineItems.reduce((sum, line) => sum + Math.round(line.breakdown.totalAmount * 0.08), 0);
    assert.equal(circuit.agent.discountInr, expected);
    assert.equal(circuit.agent.payableAmount, circuit.breakdown.totalAmount - expected);

    const order = await requestJson(api.baseUrl, "/api/circuit-orders", { token: agent.token, headers: { "Idempotency-Key": "agent-circuit-0001" }, body: { quoteId: circuit.quoteId } });
    assert.equal(order.response.status, 201, `${JSON.stringify(order.data)}\n${api.output()}`);
    assert.equal(order.data.order.breakdown.agentDiscountAmount, expected);
    assert.equal(order.data.order.breakdown.totalAmount, circuit.breakdown.totalAmount - expected);
    const children = withDatabase((database) => database.prepare("SELECT source, amount_inr, agent_discount_inr, commission_amount, supplier_payout_amount FROM bookings WHERE circuit_order_id = ?").all(order.data.order.orderId));
    assert.equal(children.length, 2);
    for (const child of children) {
      assert.equal(child.source, "IH_B2B");
      assert.equal(child.amount_inr + child.agent_discount_inr, child.commission_amount + child.supplier_payout_amount);
    }
    assert.equal(children.reduce((sum, child) => sum + child.amount_inr, 0), order.data.order.breakdown.totalAmount, "the order charges what its bookings cost");

    const paid = await requestJson(api.baseUrl, `/api/circuit-orders/${order.data.order.orderId}/demo-payment`, { token: agent.token, body: {} });
    assert.equal(paid.response.status, 200, `${JSON.stringify(paid.data)}\n${api.output()}`);

    // A quote priced for an agency that is then suspended is not honoured.
    const second = await requestJson(api.baseUrl, `/api/itineraries/${itinerary.data.itinerary.id}/quote`, { token: agent.token, body: { startDate: futureDate(30), adultsCount: 2, childrenCount: 0 } });
    withDatabase((database) => database.prepare("UPDATE travel_agencies SET status = 'SUSPENDED' WHERE id = 'agy_it_awadh'").run());
    const refused = await requestJson(api.baseUrl, "/api/circuit-orders", { token: agent.token, headers: { "Idempotency-Key": "agent-circuit-0002" }, body: { quoteId: second.data.quote.quoteId } });
    assert.equal(refused.response.status, 409, JSON.stringify(refused.data));
    assert.equal(refused.data.code, "AGENCY_NOT_APPROVED");

    // Suspended: back to the website price.
    const after = await requestJson(api.baseUrl, "/api/bookings/quote", { token: agent.token, body: quoteInput });
    assert.equal(after.data.quote.agent, undefined);
  });
});
