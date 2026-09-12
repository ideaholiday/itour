import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

// Exercises the supplier extranet additions from docs/RESERVATION_ENGINE_V2_PLAN.md
// over real HTTP: seasonal rates and per-departure calendar control, and their
// effect on what a traveler sees on the public availability endpoint.
test("supplier seasonal rates and calendar overrides drive public availability", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());

  const user = db.prepare("SELECT * FROM users WHERE role = 'SUPPLIER' LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers WHERE LOWER(email) = ?").get(user.email.toLowerCase());
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, "integration-jwt-secret-with-at-least-32-characters");
  const base = `/api/suppliers/${supplier.id}/products`;

  const created = await requestJson(api.baseUrl, `${base}/v2`, {
    token,
    body: { productType: "EXPERIENCE", productSubType: "TICKET_SIC", title: "Backwater Sunset Cruise", city: "Kochi", state: "Kerala", priceInr: 1500, status: "PUBLISHED" },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const productId = created.data.productId;

  const inventory = await requestJson(api.baseUrl, `${base}/${productId}/inventory`, { token });
  const optionId = inventory.data.options[0].id;

  const rules = { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00", "17:00"], capacity: 12, adultPrice: 1500, childPrice: 600, cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [], minPartySize: 2, maxPartySize: 8 };
  const saved = await requestJson(api.baseUrl, `${base}/${productId}/inventory/${optionId}`, { token, method: "PUT", body: rules });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));

  // 2099-12-25 is a Friday; 2099-12-28 is a Monday.
  const peak = await requestJson(api.baseUrl, `${base}/${productId}/inventory/${optionId}/rates`, {
    token,
    body: { label: "Christmas week", startsOn: "2099-12-20", endsOn: "2099-12-26", weekdays: [5], adultPrice: 4000, childPrice: 1800, priority: 10 },
  });
  assert.equal(peak.response.status, 201, JSON.stringify(peak.data));

  const availability = (date) => requestJson(api.baseUrl, `/api/availability/native/${productId}?optionId=${optionId}&date=${date}`, {});

  const friday = await availability("2099-12-25");
  assert.equal(friday.response.status, 200, JSON.stringify(friday.data));
  assert.equal(friday.data.slots[0].adultPrice, 4000, "the seasonal rate reaches the traveler");
  assert.equal(friday.data.slots[0].priceScheduleLabel, "Christmas week");
  assert.equal(friday.data.slots[0].minPartySize, 2);
  assert.equal(friday.data.slots[0].maxPartySize, 8);

  const monday = await availability("2099-12-28");
  assert.equal(monday.data.slots[0].adultPrice, 1500, "dates outside the schedule keep the base rate");

  // Close only the 09:00 departure on the peak date.
  const closed = await requestJson(api.baseUrl, `${base}/${productId}/inventory/${optionId}/calendar`, {
    token, method: "PUT",
    body: { localDate: "2099-12-25", localTime: "09:00", closed: true, note: "Crew on leave" },
  });
  assert.equal(closed.response.status, 200, JSON.stringify(closed.data));

  const afterClose = await availability("2099-12-25");
  const morning = afterClose.data.slots.find(s => s.localTime === "09:00");
  const evening = afterClose.data.slots.find(s => s.localTime === "17:00");
  assert.equal(morning.status, "CLOSED");
  assert.equal(morning.supplierNote, "Crew on leave");
  assert.equal(evening.status, "AVAILABLE", "closing one departure leaves the rest sellable");

  // Shrink capacity on the surviving departure, then confirm it is published.
  const resized = await requestJson(api.baseUrl, `${base}/${productId}/inventory/${optionId}/calendar`, {
    token, method: "PUT", body: { localDate: "2099-12-25", localTime: "17:00", capacity: 4 },
  });
  assert.equal(resized.response.status, 200, JSON.stringify(resized.data));
  const resizedSlots = await availability("2099-12-25");
  assert.equal(resizedSlots.data.slots.find(s => s.localTime === "17:00").capacity, 4);

  const listed = await requestJson(api.baseUrl, `${base}/${productId}/inventory/${optionId}/calendar`, { token });
  assert.equal(listed.data.overrides.length, 2);

  // Removing the override restores the weekly rule capacity.
  const removed = await requestJson(api.baseUrl, `${base}/${productId}/inventory/${optionId}/calendar?localDate=2099-12-25&localTime=17:00`, { token, method: "DELETE" });
  assert.equal(removed.response.status, 200, JSON.stringify(removed.data));
  const restored = await availability("2099-12-25");
  assert.equal(restored.data.slots.find(s => s.localTime === "17:00").capacity, 12);

  // Another supplier's id must not reach this product's rates.
  const foreign = await requestJson(api.baseUrl, `/api/suppliers/does-not-exist/products/${productId}/inventory/${optionId}/rates`, { token });
  assert.ok(foreign.response.status === 403 || foreign.response.status === 404, `expected denial, got ${foreign.response.status}`);
});

// P1: a senior/infant breakdown must price distinctly and reach the booking.
test("multi-unit-type holds price seniors and infants distinctly over HTTP", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());

  const supplierUser = db.prepare("SELECT * FROM users WHERE role = 'SUPPLIER' LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers WHERE LOWER(email) = ?").get(supplierUser.email.toLowerCase());
  const supplierToken = jwt.sign({ id: supplierUser.id, email: supplierUser.email, role: supplierUser.role }, "integration-jwt-secret-with-at-least-32-characters");
  const base = `/api/suppliers/${supplier.id}/products`;

  const created = await requestJson(api.baseUrl, `${base}/v2`, {
    token: supplierToken,
    body: { productType: "EXPERIENCE", productSubType: "TICKET_SIC", title: "Heritage Walk With Seniors Rate", city: "Jaipur", state: "Rajasthan", priceInr: 900, status: "PUBLISHED" },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const productId = created.data.productId;
  const optionId = (await requestJson(api.baseUrl, `${base}/${productId}/inventory`, { token: supplierToken })).data.options[0].id;

  const saved = await requestJson(api.baseUrl, `${base}/${productId}/inventory/${optionId}`, {
    token: supplierToken, method: "PUT",
    body: { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["10:00"], capacity: 20, adultPrice: 1000, childPrice: 400, cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [], unitPrices: { SENIOR: 700, INFANT: 0 } },
  });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));

  const slots = await requestJson(api.baseUrl, `/api/availability/native/${productId}?optionId=${optionId}&date=2099-07-15`, {});
  assert.equal(slots.response.status, 200, JSON.stringify(slots.data));
  assert.deepEqual(slots.data.slots[0].unitPrices, { ADULT: 1000, CHILD: 400, SENIOR: 700, INFANT: 0 });

  // Hold 2 seniors + 1 infant: 2x700 + 1x0 = 1400, not the 2x1000 adults would cost.
  const signup = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Unit Pricing Traveler", email: `units-${Date.now()}@example.com`, password: "Integration@2026", phone: "+919876543211" },
  });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
  const travelerToken = signup.data.token;
  const hold = await requestJson(api.baseUrl, "/api/availability/native/hold", {
    token: travelerToken,
    body: { productId, optionId, localDate: "2099-07-15", localTime: "10:00", adults: 2, children: 1, unitItems: [{ unitType: "SENIOR", quantity: 2 }, { unitType: "INFANT", quantity: 1 }], requestKey: `unit-${Date.now()}` },
  });
  assert.equal(hold.response.status, 201, JSON.stringify(hold.data));

  const stored = db.prepare("SELECT * FROM native_reservations WHERE id = ?").get(hold.data.holdId);
  assert.deepEqual(JSON.parse(stored.unit_items), [{ unitType: "INFANT", quantity: 1 }, { unitType: "SENIOR", quantity: 2 }]);
  assert.equal(JSON.parse(stored.pricing_snapshot).unitTotal, 1400, "seniors bill at the senior rate");
  assert.equal(Number(stored.adults), 2, "seniors still occupy adult seats for capacity");
  assert.equal(Number(stored.children), 1, "infants still occupy child seats for capacity");
});
