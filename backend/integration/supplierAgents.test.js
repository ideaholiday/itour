import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";

// Supplier agents (ADR 039): staff book for an agent at a net rate, on credit.

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";

function setup(db) {
  const product = db.prepare("SELECT * FROM products WHERE product_type = 'DAY_TOUR' AND group_type = 'SHARED' AND status = 'PUBLISHED' LIMIT 1").get();
  const option = db.prepare("SELECT * FROM product_options WHERE product_id = ? LIMIT 1").get(product.id);
  saveInventoryRules(db, product.id, option.id, { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00"], capacity: 30, adultPrice: 1000, childPrice: 400, cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [] });
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(product.supplier_id);
  let owner = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!owner) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_owner', 'Owner', ?, 'x', 'SUPPLIER')").run(supplier.email);
    owner = db.prepare("SELECT * FROM users WHERE id = 'usr_owner'").get();
  }
  return { product, option, supplier, ownerToken: jwt.sign({ id: owner.id, email: owner.email, role: "SUPPLIER" }, JWT_SECRET) };
}

const call = (api, ctx, token, path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}${path}`, { token, ...options });
const date = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
const later = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const booking = (ctx, agentId, extra = {}) => ({
  source: "AGENT", agent_id: agentId, product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "09:00",
  adults: 2, children: 0, traveler_name: "Agent Guest", traveler_phone: "+919812345678", ...extra,
});

test("an agent books at their net rate on credit, is refused over the limit, and pays on account oldest first", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);

  const created = await call(api, ctx, ctx.ownerToken, "/agents", { body: { name: "Sunrise Travels", phone: "+919811111111", commissionPct: 10, creditLimitInr: 2000 } });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const agentId = created.data.agent.id;

  // 2 adults at ₹1000 + 5% GST = ₹2100; 10% commission leaves ₹1890 net.
  const quote = await call(api, ctx, ctx.ownerToken, "/bookings/quote", { body: { product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "09:00", adults: 2, children: 0, agent_id: agentId } });
  assert.equal(quote.response.status, 200, JSON.stringify(quote.data));
  assert.deepEqual([quote.data.quote.totalAmount, quote.data.quote.agentCommissionInr, quote.data.quote.amountDueInr, quote.data.quote.agentAvailableCreditInr], [2100, 210, 1890, 2000]);

  const first = await call(api, ctx, ctx.ownerToken, "/bookings", { body: booking(ctx, agentId) });
  assert.equal(first.response.status, 201, JSON.stringify(first.data));
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(first.data.booking.id);
  assert.deepEqual([row.source, row.payment_status, row.amount_inr, row.agent_commission_inr, row.balance_due_inr, row.supplier_payout_amount, row.commission_amount],
    ["AGENT", "OFFLINE", 1890, 210, 1890, 1890, 0]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM payouts WHERE booking_id = ?").get(row.id).count, 0);

  // ₹110 of credit left: another ₹1890 is refused unless ₹1780 is paid now.
  const refused = await call(api, ctx, ctx.ownerToken, "/bookings", { body: booking(ctx, agentId) });
  assert.equal(refused.response.status, 409);
  assert.equal(refused.data.code, "AGENT_CREDIT_LIMIT");
  assert.match(refused.data.error, /at least ₹1,780/);
  const bookedSeats = () => db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE agent_id = ?").get(agentId).count;
  assert.equal(bookedSeats(), 1);
  // A later trip, so payments on account reach it after the first.
  const second = await call(api, ctx, ctx.ownerToken, "/bookings", { body: booking(ctx, agentId, { activity_date: later, payments: [{ mode: "UPI", amount_inr: 1800 }] }) });
  assert.equal(second.response.status, 201, JSON.stringify(second.data));

  // A discount on top of the commission is refused.
  assert.equal((await call(api, ctx, ctx.ownerToken, "/bookings", { body: booking(ctx, agentId, { discount_inr: 100 }) })).data.code, "AGENT_DISCOUNT");

  let agents = await call(api, ctx, ctx.ownerToken, "/agents");
  assert.deepEqual([agents.data.agents[0].owedInr, agents.data.agents[0].availableCreditInr], [1980, 20]);

  // The guest is never asked to pay at the meeting point.
  const manifest = await call(api, ctx, ctx.ownerToken, `/manifest?productId=${ctx.product.id}&date=${date}`);
  assert.ok(manifest.data.manifest.bookings.every((entry) => entry.balanceDueInr === 0));

  // ₹1900 on account clears the first booking and ₹10 of the second.
  assert.equal((await call(api, ctx, ctx.ownerToken, `/agents/${agentId}/payments`, { body: { mode: "BANK", amount_inr: 5000 } })).data.code, "OVERPAYMENT");
  const paid = await call(api, ctx, ctx.ownerToken, `/agents/${agentId}/payments`, { body: { mode: "BANK", amount_inr: 1900, reference: "NEFT-42" } });
  assert.equal(paid.response.status, 201, JSON.stringify(paid.data));
  assert.deepEqual(paid.data.applied.map((entry) => entry.amountInr), [1890, 10]);
  assert.equal(paid.data.agent.owedInr, 80);

  // A special rate for this listing: 20% makes the net ₹1680.
  const rates = await call(api, ctx, ctx.ownerToken, `/agents/${agentId}/rates`, { method: "PUT", body: { rates: [{ productId: ctx.product.id, commissionPct: 20 }] } });
  assert.equal(rates.response.status, 200, JSON.stringify(rates.data));
  const special = await call(api, ctx, ctx.ownerToken, "/bookings/quote", { body: { product_id: ctx.product.id, product_option_id: ctx.option.id, activity_date: date, pickup_time: "09:00", adults: 2, children: 0, agent_id: agentId } });
  assert.equal(special.data.quote.amountDueInr, 1680);

  // Cancelling the second booking removes what's still owed on it.
  assert.equal((await call(api, ctx, ctx.ownerToken, `/bookings/${second.data.booking.id}/cancel`, { body: { reason: "Agent's group cancelled" } })).response.status, 200);
  const statement = await call(api, ctx, ctx.ownerToken, `/agents/${agentId}/statement`);
  assert.equal(statement.response.status, 200, JSON.stringify(statement.data));
  assert.deepEqual(statement.data.totals, { bookings: 1, grossInr: 2100, commissionInr: 210, netInr: 1890, paidInr: 1890, dueInr: 0 });
  assert.equal(statement.data.payments.length, 3);
  agents = await call(api, ctx, ctx.ownerToken, "/agents");
  assert.equal(agents.data.agents[0].owedInr, 0);

  // Inactive agents can't book.
  await call(api, ctx, ctx.ownerToken, `/agents/${agentId}`, { method: "PUT", body: { name: "Sunrise Travels", commissionPct: 10, creditLimitInr: 2000, status: "INACTIVE" } });
  assert.equal((await call(api, ctx, ctx.ownerToken, "/bookings", { body: booking(ctx, agentId) })).data.code, "AGENT_INACTIVE");
});

test("front desk picks an agent to book for, but doesn't manage agents; another supplier's agent is refused", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const agentId = (await call(api, ctx, ctx.ownerToken, "/agents", { body: { name: "Hotel Sea View", commissionPct: 15, creditLimitInr: 50000 } })).data.agent.id;

  const staff = await call(api, ctx, ctx.ownerToken, "/staff", { body: { name: "Counter", email: "desk@example.com", role: "FRONT_DESK" } });
  const desk = (await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "desk@example.com", password: staff.data.temporaryPassword, portal: "supplier" } })).data.token;
  assert.equal((await call(api, ctx, desk, "/agents")).response.status, 200);
  assert.equal((await call(api, ctx, desk, "/bookings", { body: booking(ctx, agentId) })).response.status, 201);
  assert.equal((await call(api, ctx, desk, "/agents", { body: { name: "Rogue", commissionPct: 80 } })).response.status, 403);
  assert.equal((await call(api, ctx, desk, `/agents/${agentId}/payments`, { body: { mode: "CASH", amount_inr: 100 } })).response.status, 403);
  assert.equal((await call(api, ctx, desk, `/agents/${agentId}/statement`)).response.status, 403);

  db.prepare("INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state) VALUES ('sup_other_agents', 'Other Operator', 'Other', 'other-operator@example.com', '+919800000000', 'Goa', 'Goa')").run();
  db.prepare("INSERT INTO supplier_agents (id, supplier_id, name, commission_pct, credit_limit_inr) VALUES ('agt_other', 'sup_other_agents', 'Elsewhere', 50, 100000)").run();
  const foreign = await call(api, ctx, ctx.ownerToken, "/bookings", { body: booking(ctx, "agt_other") });
  assert.equal(foreign.response.status, 404);
  assert.equal(foreign.data.code, "AGENT_NOT_FOUND");
});
