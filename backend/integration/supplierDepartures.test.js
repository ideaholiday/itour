import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";

/**
 * Supplier day-of-operations (docs/SUPPLIER_OPERATIONS.md): scan a voucher to check a
 * traveler in, mark a no-show, download the guest list, and cancel a whole departure
 * with every paid booking refunded to the traveler's wallet.
 */

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function insertBooking(db, { ref, userId, productId, supplierId, date, time, adults = 2, name = "Departure Traveler", paymentStatus = "PAID", status = "confirmed", amountInr = 3000 }) {
  const id = `bk_${ref.toLowerCase().replace(/-/g, "_")}`;
  db.prepare(`
    INSERT INTO bookings (id, ref, user_id, product_id, supplier_id, product_type, activity_date, pickup_time,
      pickup_location, adults, children, traveler_name, traveler_phone, traveler_email,
      amount_inr, payment_method, payment_status, status)
    VALUES (?, ?, ?, ?, ?, 'EXPERIENCE', ?, ?, 'Fort Kochi jetty', ?, 0, ?, '+919876500777', 'departure.traveler@example.test', ?, 'DEMO', ?, ?)
  `).run(id, ref, userId, productId, supplierId, date, time, adults, name, amountInr, paymentStatus, status);
  return id;
}

test("a supplier checks travelers in, downloads the guest list and cancels a departure", async (t) => {
  const api = await startTestServer();
  t.after(() => api.stop());
  const db = new Database(api.databasePath);
  t.after(() => db.close());

  const user = db.prepare("SELECT * FROM users WHERE role = 'SUPPLIER' LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers WHERE LOWER(email) = ?").get(user.email.toLowerCase());
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
  const base = `/api/suppliers/${supplier.id}`;

  const created = await requestJson(api.baseUrl, `${base}/products/v2`, {
    token,
    body: { productType: "EXPERIENCE", productSubType: "TICKET_SIC", title: "Harbour Dolphin Cruise", city: "Kochi", state: "Kerala", priceInr: 1500, status: "PUBLISHED" },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const productId = created.data.productId;
  const inventory = await requestJson(api.baseUrl, `${base}/products/${productId}/inventory`, { token });
  const optionId = inventory.data.options[0].id;
  const saved = await requestJson(api.baseUrl, `${base}/products/${productId}/inventory/${optionId}`, {
    token, method: "PUT",
    body: { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00", "17:00"], capacity: 20, adultPrice: 1500, childPrice: 600, cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [] },
  });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.data));

  const signup = await requestJson(api.baseUrl, "/api/auth/signup", {
    body: { name: "Departure Traveler", email: "departure.traveler@example.test", password: "Integration@2026", phone: "+919876500777" },
  });
  assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
  const travelerId = signup.data.user.id;
  const booking = (fields) => insertBooking(db, { userId: travelerId, productId, supplierId: supplier.id, ...fields });

  const todayId = booking({ ref: "IH-DEPTODAY", date: today, time: "09:00" });
  const morningPaid = booking({ ref: "IH-DEPAM01", date: "2099-12-25", time: "09:00", amountInr: 3000, name: "=HYPERLINK(\"http://evil\")" });
  const morningUnpaid = booking({ ref: "IH-DEPAM02", date: "2099-12-25", time: "09:00", adults: 1, paymentStatus: "PENDING", amountInr: 1500 });
  const evening = booking({ ref: "IH-DEPPM01", date: "2099-12-25", time: "17:00", amountInr: 3000 });
  booking({ ref: "IH-DEPUNPD", date: "2099-12-25", time: "09:00", status: "pending_payment", paymentStatus: "PENDING" });

  // 1. Check-in from the voucher QR link; a second scan says when it was first used.
  const scanned = await requestJson(api.baseUrl, `${base}/check-in`, { token, body: { code: "https://ideaholiday.in/booking-confirmed/IH-DEPTODAY" } });
  assert.equal(scanned.response.status, 200, `${JSON.stringify(scanned.data)}\n${api.output()}`);
  assert.equal(scanned.data.alreadyCheckedIn, false);
  assert.equal(scanned.data.booking.attendanceStatus, "CHECKED_IN");
  const row = db.prepare("SELECT attendance_status, checked_in_by FROM bookings WHERE id = ?").get(todayId);
  assert.deepEqual({ ...row }, { attendance_status: "CHECKED_IN", checked_in_by: user.id });

  const rescanned = await requestJson(api.baseUrl, `${base}/check-in`, { token, body: { code: "ih-deptoday" } });
  assert.equal(rescanned.data.alreadyCheckedIn, true);

  const otherDay = await requestJson(api.baseUrl, `${base}/check-in`, { token, body: { code: "IH-DEPPM01" } });
  assert.equal(otherDay.response.status, 409);
  assert.equal(otherDay.data.code, "WRONG_DATE", JSON.stringify(otherDay.data));
  assert.match(otherDay.data.error, /IH-DEPPM01 is for 2099-12-25/);

  const unknown = await requestJson(api.baseUrl, `${base}/check-in`, { token, body: { code: "IH-NOTOURS" } });
  assert.equal(unknown.response.status, 404);
  const traveler = await requestJson(api.baseUrl, `${base}/check-in`, { token: signup.data.token, body: { code: "IH-DEPTODAY" } });
  assert.equal(traveler.response.status, 403);
  const unauthenticated = await requestJson(api.baseUrl, `${base}/check-in`, { body: { code: "IH-DEPTODAY" } });
  assert.equal(unauthenticated.response.status, 401);

  // 2. No-shows can't be recorded before the trip date; attendance can be cleared.
  const early = await requestJson(api.baseUrl, `${base}/bookings/${evening}/attendance`, { token, method: "PATCH", body: { status: "NO_SHOW" } });
  assert.equal(early.response.status, 409);
  const cleared = await requestJson(api.baseUrl, `${base}/bookings/${todayId}/attendance`, { token, method: "PATCH", body: { status: "NONE" } });
  assert.equal(cleared.response.status, 200, JSON.stringify(cleared.data));
  assert.equal(db.prepare("SELECT attendance_status FROM bookings WHERE id = ?").get(todayId).attendance_status, null);
  const noShow = await requestJson(api.baseUrl, `${base}/bookings/${todayId}/attendance`, { token, method: "PATCH", body: { status: "NO_SHOW" } });
  assert.equal(noShow.data.booking.attendanceStatus, "NO_SHOW");

  // 3. The guest list leaves out unpaid bookings, and the CSV cannot smuggle a spreadsheet formula.
  const manifest = await requestJson(api.baseUrl, `${base}/manifest?productId=${productId}&date=2099-12-25`, { token });
  assert.equal(manifest.response.status, 200, JSON.stringify(manifest.data));
  assert.deepEqual(manifest.data.manifest.departureTimes, ["09:00", "17:00"]);
  assert.deepEqual(manifest.data.manifest.totals, { bookings: 3, guests: 5, checkedIn: 0, noShow: 0, cancelledBookings: 0 });
  const morning = await requestJson(api.baseUrl, `${base}/manifest?productId=${productId}&date=2099-12-25&time=09:00`, { token });
  assert.deepEqual(morning.data.manifest.bookings.map((item) => item.ref).sort(), ["IH-DEPAM01", "IH-DEPAM02"]);
  const csv = await requestJson(api.baseUrl, `${base}/manifest?productId=${productId}&date=2099-12-25&time=09:00&format=csv`, { token });
  assert.equal(csv.response.status, 200);
  assert.match(csv.response.headers.get("content-type"), /text\/csv/);
  assert.match(csv.data, /^Reference,Traveler,Phone/);
  assert.match(csv.data, /"'=HYPERLINK\(""http:\/\/evil""\)"/);
  const foreign = await requestJson(api.baseUrl, `${base}/manifest?productId=prd_someone_else&date=2099-12-25`, { token });
  assert.equal(foreign.response.status, 404);

  // 4. Preview, then cancel the 09:00 departure: every booking ends, even one still awaiting payment,
  //    and only the paid one is refunded to the wallet.
  const cancelPath = `${base}/products/${productId}/departures/cancel`;
  const preview = await requestJson(api.baseUrl, cancelPath, { token, body: { date: "2099-12-25", time: "09:00", reason: "Cyclone warning at sea", dryRun: true } });
  assert.equal(preview.response.status, 200, JSON.stringify(preview.data));
  assert.deepEqual(
    { bookings: preview.data.bookings, guests: preview.data.guests, paid: preview.data.paidBookings, refund: preview.data.walletRefundInr, options: preview.data.closesOptions },
    { bookings: 3, guests: 5, paid: 1, refund: 3000, options: 1 },
  );
  assert.equal(db.prepare("SELECT status FROM bookings WHERE id = ?").get(morningPaid).status, "confirmed", "a preview changes nothing");

  const cancelled = await requestJson(api.baseUrl, cancelPath, { token, body: { date: "2099-12-25", time: "09:00", reason: "Cyclone warning at sea" } });
  assert.equal(cancelled.response.status, 200, `${JSON.stringify(cancelled.data)}\n${api.output()}`);
  assert.deepEqual(cancelled.data.cancelled.map((item) => [item.ref, item.walletCreditInr]).sort(), [["IH-DEPAM01", 3000], ["IH-DEPAM02", null], ["IH-DEPUNPD", null]]);
  const statuses = db.prepare("SELECT id, status, payment_status FROM bookings WHERE id IN (?, ?, ?)").all(morningPaid, morningUnpaid, evening);
  assert.deepEqual(Object.fromEntries(statuses.map((item) => [item.id, `${item.status}/${item.payment_status}`])), {
    [morningPaid]: "cancelled/REFUNDED_TO_WALLET",
    [morningUnpaid]: "cancelled/PENDING",
    [evening]: "confirmed/PAID",
  });
  assert.equal(db.prepare("SELECT wallet_balance_inr FROM users WHERE id = ?").get(travelerId).wallet_balance_inr, 3000);

  const availability = await requestJson(api.baseUrl, `/api/availability/native/${productId}?optionId=${optionId}&date=2099-12-25`, {});
  const slot = (time) => availability.data.slots.find((item) => item.localTime === time);
  assert.equal(slot("09:00").status, "CLOSED");
  assert.equal(slot("09:00").supplierNote, "Cyclone warning at sea");
  assert.equal(slot("17:00").status, "AVAILABLE", "the other departure keeps selling");

  const deadline = Date.now() + 5_000;
  let notices = [];
  while (Date.now() < deadline && notices.length < 2) {
    notices = db.prepare("SELECT channel FROM notification_deliveries WHERE event_type = 'BOOKING_CANCELLED' AND event_key LIKE ?").all(`${morningPaid}:%`);
    if (notices.length < 2) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.deepEqual(notices.map((item) => item.channel).sort(), ["EMAIL", "WHATSAPP"], api.output());

  // 5. Refusals: a past date, and a departure where a trip has already started.
  const past = await requestJson(api.baseUrl, cancelPath, { token, body: { date: "2020-01-01", reason: "Too late" } });
  assert.equal(past.response.status, 409);
  db.prepare("UPDATE bookings SET status = 'in_progress' WHERE id = ?").run(evening);
  const started = await requestJson(api.baseUrl, cancelPath, { token, body: { date: "2099-12-25", time: "17:00", reason: "Engine trouble" } });
  assert.equal(started.response.status, 409);
  assert.equal(started.data.code, "DEPARTURE_STARTED");
  assert.match(started.data.error, /IH-DEPPM01/);
  const stillOpen = await requestJson(api.baseUrl, `/api/availability/native/${productId}?optionId=${optionId}&date=2099-12-25`, {});
  assert.equal(stillOpen.data.slots.find((item) => item.localTime === "17:00").status, "AVAILABLE", "a refused cancellation closes nothing");
});
