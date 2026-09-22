import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";

// ADR 023 step L5: travelers see a Thai product's local time and no GST wording.
test("a traveler booking in Bangkok sees Thailand time and gets a receipt, not a GST invoice", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const product = db.prepare("SELECT * FROM products WHERE product_type = 'DAY_TOUR' AND group_type = 'SHARED' AND status = 'PUBLISHED' LIMIT 1").get();
  assert.ok(product);
  const option = db.prepare("SELECT * FROM product_options WHERE product_id = ? LIMIT 1").get(product.id);
  saveInventoryRules(db, product.id, option.id, { operatingDays: [0,1,2,3,4,5,6], departureTimes: ["09:00"], capacity: 5, adultPrice: 1000, childPrice: 400, cutoffMinutes: 120, cancellationHours: 48, blackoutDates: [] });
  const date = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

  const india = await requestJson(api.baseUrl, `/api/activities/${product.id}`);
  assert.equal(india.response.status, 200);
  assert.deepEqual([india.data.country, india.data.timeZone, india.data.timeLabel, india.data.gstFree], ["India", "Asia/Kolkata", "IST", false]);

  db.prepare("UPDATE products SET city = 'Bangkok', state = 'Bangkok' WHERE id = ?").run(product.id);
  // A Thai supplier's product in Thailand: no GST, so a receipt (an Indian supplier's would carry 18%, ADR 024).
  db.prepare("UPDATE suppliers SET city = 'Bangkok', state = 'Bangkok' WHERE id = (SELECT supplier_id FROM products WHERE id = ?)").run(product.id);
  db.prepare("DELETE FROM product_location_rules WHERE product_id = ?").run(product.id); // the seed's Goa pickup area
  const thai = await requestJson(api.baseUrl, `/api/activities/${product.id}`);
  assert.deepEqual([thai.data.country, thai.data.timeZone, thai.data.timeLabel, thai.data.gstFree], ["Thailand", "Asia/Bangkok", "ICT", true]);

  const slots = await requestJson(api.baseUrl, `/api/availability/native/${product.id}?date=${date}&optionId=${option.id}`);
  assert.equal(slots.data.slots[0].timeZone, "Asia/Bangkok");
  assert.equal(slots.data.slots[0].timeLabel, "ICT");
  assert.equal(slots.data.slots[0].localDateTimeStart, `${date}T09:00:00+07:00`);

  const account = await requestJson(api.baseUrl, "/api/auth/signup", { body: { name: "Bangkok Traveler", email: "bangkok@example.com", password: "Integration@2026", phone: "+66812345678" } });
  assert.equal(account.response.status, 200, JSON.stringify(account.data));
  const token = account.data.token;
  const hold = await requestJson(api.baseUrl, "/api/availability/native/hold", { token, body: { productId: product.id, optionId: option.id, localDate: date, localTime: "09:00", adults: 2, children: 0, requestKey: "bangkok" } });
  assert.equal(hold.response.status, 201, JSON.stringify(hold.data));
  const input = { product_id: product.id, product_option_id: option.id, activity_date: date, pickup_time: "09:00", pickup_location: "Sukhumvit Soi 11, Bangkok", adults: 2, children: 0, luggage_bags: 0, vehicle_category: "SHARED_SEAT", native_hold_id: hold.data.holdId };
  const created = await requestJson(api.baseUrl, "/api/bookings", { token, body: { ...input, traveler_name: "Bangkok Traveler", traveler_email: "bangkok@example.com", traveler_phone: "+66812345678", payment_method: "DEMO", client_request_id: "bangkok-booking" } });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const paid = await requestJson(api.baseUrl, "/api/checkout/demo-payment", { token, body: { bookingId: created.data.bookingId } });
  assert.equal(paid.response.status, 200, JSON.stringify(paid.data));

  const voucher = await requestJson(api.baseUrl, `/api/bookings/${created.data.ref}/documents/voucher`, { token });
  assert.equal(voucher.response.status, 200);
  assert.match(voucher.data, /09:00 ICT/);
  assert.match(voucher.data, /Travel More Across Thailand/);

  const receipt = await requestJson(api.baseUrl, `/api/bookings/${created.data.ref}/documents/invoice`, { token });
  assert.equal(receipt.response.status, 200);
  assert.match(receipt.data, /Booking receipt/);
  assert.doesNotMatch(receipt.data, /GSTIN|Booking invoice|Taxes, tolls and statutory charges/);
});
