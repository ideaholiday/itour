import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  activatePickupOtp,
  calculateBookingQuote,
  canTransitionBooking,
  decryptPickupOtp,
  encryptPickupOtp,
  generatePickupOtp,
  getPickupOtpExpiry,
  hashPickupOtp,
  pickupOtpMatches,
  publicQuote,
  withoutPickupOtpSecrets
} from "../src/services/bookingService.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";
import { migratedDb } from "./helpers/migratedDb.js";

test("pickup OTP is six digits, encrypted at rest and timing-safe verifiable", () => {
  const booking = { id: "bk_test", activity_date: "2030-01-15", pickup_time: "10:30" };
  const activated = activatePickupOtp(booking);
  assert.match(activated.otp, /^\d{6}$/);
  assert.equal(decryptPickupOtp(activated.otpEncrypted), activated.otp);
  assert.equal(pickupOtpMatches(booking.id, activated.otp, activated.otpHash), true);
  assert.equal(pickupOtpMatches(booking.id, "000000", activated.otpHash), activated.otp === "000000");
  assert.notEqual(activated.otpHash, activated.otp);
});

test("OTP hashing is scoped to a booking", () => {
  const otp = generatePickupOtp();
  assert.notEqual(hashPickupOtp("bk_one", otp), hashPickupOtp("bk_two", otp));
});

test("booking state machine requires OTP path before trip completion", () => {
  assert.equal(canTransitionBooking("pending_payment", "confirmed"), true);
  assert.equal(canTransitionBooking("confirmed", "driver_assigned"), true);
  assert.equal(canTransitionBooking("driver_assigned", "in_progress"), true);
  assert.equal(canTransitionBooking("confirmed", "completed"), false);
  assert.equal(canTransitionBooking("in_progress", "completed"), true);
  assert.equal(canTransitionBooking("completed", "in_progress"), false);
});

test("booking creation SQL statement has equal column and value expressions", () => {
  const routeSource = readFileSync(new URL("../src/routes/bookings.js", import.meta.url), "utf8");
  const insertMatch = routeSource.match(/`INSERT INTO bookings \(([\s\S]+?)\) VALUES \(([\s\S]+?)\)`/i);
  assert.ok(insertMatch, "Should find the production booking insert");

  const columns = insertMatch[1].split(",").map((value) => value.trim()).filter(Boolean);
  const values = insertMatch[2].split(",").map((value) => value.trim()).filter(Boolean);

  assert.equal(columns.length, 49, "Production booking insert must include all 49 target columns");
  assert.equal(values.length, 49, "Production booking insert must provide all 49 value expressions");
  assert.equal(columns.length, values.length, "Target columns count must equal value expressions count");
});

test("a pickup OTP that is missing, malformed or tampered never decrypts or matches", () => {
  assert.equal(decryptPickupOtp(null), null);
  assert.equal(decryptPickupOtp("not-a-ciphertext"), null);
  const [iv, tag, body] = encryptPickupOtp("123456").split(".");
  const flipped = body[0] === "A" ? `B${body.slice(1)}` : `A${body.slice(1)}`;
  assert.equal(decryptPickupOtp(`${iv}.${tag}.${flipped}`), null);

  const hash = hashPickupOtp("bk_x", "123456");
  assert.equal(pickupOtpMatches("bk_x", "12345", hash), false);
  assert.equal(pickupOtpMatches("bk_x", "12345a", hash), false);
  assert.equal(pickupOtpMatches("bk_x", undefined, hash), false);
  assert.equal(pickupOtpMatches("bk_x", "123456", null), false);
  assert.equal(pickupOtpMatches("bk_x", "123456", "short"), false);
});

test("a pickup OTP lasts until a day after pickup, and at least a day from now", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const expiry = (date, time) => Date.parse(getPickupOtpExpiry(date, time));
  const local = (value) => new Date(value).getTime();
  assert.equal(expiry("2099-01-01", "02:30 PM"), local("2099-01-01T14:30:00") + DAY);
  assert.equal(expiry("2099-01-01", "12:15 am"), local("2099-01-01T00:15:00") + DAY);
  assert.equal(expiry("2099-01-01", "12:15 PM"), local("2099-01-01T12:15:00") + DAY);
  // Unreadable times fall back to 09:00; impossible ones and bad dates to the one-day minimum.
  assert.equal(expiry("2099-01-01", "noon"), local("2099-01-01T09:00:00") + DAY);
  for (const [date, time] of [["2099-01-01", "25:00"], ["2099-01-01", "10:75"], ["01/01/2099", "10:00"], ["2000-01-01", "10:00"]]) {
    const before = Date.now() + DAY;
    const value = expiry(date, time);
    assert.ok(value >= before && value <= Date.now() + DAY, `${date} ${time}`);
  }
});

test("unknown booking statuses allow no transition, and OTP secrets are stripped", () => {
  assert.equal(canTransitionBooking("mystery", "confirmed"), false);
  assert.equal(canTransitionBooking(null, "confirmed"), false);
  assert.equal(canTransitionBooking("CONFIRMED", "Cancelled"), true);
  assert.deepEqual(
    withoutPickupOtpSecrets({ id: "bk_1", otp_code: "1", otp_hash: "h", otp_encrypted: "e", status: "confirmed" }),
    { id: "bk_1", status: "confirmed" }
  );
});

// calculateBookingQuote runs against a copy of the migrated test database.
const TRIP_DATE = "2099-06-15";

function quoteDb(t) {
  const db = migratedDb(t);
  db.prepare(`INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, kyb_status, subscription_exempt)
    VALUES ('sup_q', 'Quote Tours', 'Q', 'quote@example.test', '+919000000001', 'Goa', 'Goa', 'APPROVED', 1)`).run();
  return db;
}

function addProduct(db, fields = {}) {
  const row = {
    id: "prd_q", supplier_id: "sup_q", product_type: "ACTIVITY", product_sub_type: null, title: "Quote test",
    city: "Goa", state: "Goa", category: "Tours", price_inr: 1000, group_type: "PRIVATE", duration_days: 1,
    commission_override_rate: 20, ...fields
  };
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO products (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(row));
  return row.id;
}

const quote = (db, input = {}, options) =>
  calculateBookingQuote(db, { product_id: "prd_q", activity_date: TRIP_DATE, adults: 2, ...input }, options);

function assertRejected(fn, status, message, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.status, status);
    assert.match(error.message, message);
    if (code) assert.equal(error.code, code);
    return true;
  });
}

test("a quote is refused for a missing, unpublished or hidden product", t => {
  const db = quoteDb(t);
  assertRejected(() => quote(db), 404, /not available for booking/);
  addProduct(db, { status: "DRAFT" });
  assertRejected(() => quote(db), 404, /not available/);
  db.prepare("UPDATE products SET status = 'PUBLISHED', is_published = 0 WHERE id = 'prd_q'").run();
  assertRejected(() => quote(db), 404, /not available/);
});

test("a quote is refused when the supplier is missing, not KYB-approved or not covered by a subscription", t => {
  const db = quoteDb(t);
  addProduct(db, { supplier_id: null });
  assertRejected(() => quote(db), 409, /not accepting bookings/);
  db.prepare("UPDATE products SET supplier_id = 'sup_q' WHERE id = 'prd_q'").run();
  db.prepare("UPDATE suppliers SET kyb_status = 'PENDING' WHERE id = 'sup_q'").run();
  assertRejected(() => quote(db), 409, /not accepting bookings/);
  db.prepare("UPDATE suppliers SET kyb_status = 'APPROVED', subscription_exempt = 0 WHERE id = 'sup_q'").run();
  assertRejected(() => quote(db), 409, /not accepting bookings/, "SUPPLIER_SUBSCRIPTION_REQUIRED");
});

test("a quote is refused for a bad or past date and impossible traveler counts", t => {
  const db = quoteDb(t);
  addProduct(db);
  assertRejected(() => quote(db, { activity_date: "15-06-2099" }), 400, /valid travel date/);
  assertRejected(() => quote(db, { activity_date: undefined }), 400, /valid travel date/);
  assertRejected(() => quote(db, { activity_date: "2000-01-01" }), 400, /cannot be in the past/);
  for (const counts of [{ adults: 0 }, { children: -1 }, { adults: 20, children: 7 }, { luggage_bags: -1 }]) {
    assertRejected(() => quote(db, counts), 400, /valid traveler and luggage count/, undefined);
  }
  // A count that isn't a whole number falls back to its default instead of failing.
  assert.equal(quote(db, { adults: "two", children: 1.5 }).adults, 1);
  assert.equal(quote(db, { adults: undefined, passengers: 3 }).adults, 3);
});

test("a date the supplier blocked quotes as sold out unless availability is not enforced", t => {
  const db = quoteDb(t);
  addProduct(db);
  db.prepare("INSERT INTO blocked_dates (id, supplier_id, start_date, end_date, capacity_limit, reason) VALUES ('blk_q', 'sup_q', ?, ?, 0, 'Staff holiday')")
    .run(TRIP_DATE, TRIP_DATE);
  assertRejected(() => quote(db), 409, /^Sold out on the selected date/);
  assert.equal(quote(db, {}, { enforceListingSupplierAvailability: false }).totalAmount, 1050);
});

test("a private vehicle is checked against its category's seats and bags; packages and tickets are not", t => {
  const db = quoteDb(t);
  addProduct(db);
  assertRejected(() => quote(db, { vehicle_category: "spaceship" }), 400, /supported vehicle category/);
  assertRejected(() => quote(db, { adults: 5 }), 409, /Sedan .* allows up to 4 passengers/);
  assertRejected(() => quote(db, { adults: 1, luggage: 9 }), 409, /bags/);
  db.prepare("UPDATE products SET product_type = 'PACKAGE' WHERE id = 'prd_q'").run();
  assert.equal(quote(db, { adults: 5 }).adults, 5);
  db.prepare("UPDATE products SET product_type = 'ACTIVITY', product_sub_type = 'TICKET_ONLY' WHERE id = 'prd_q'").run();
  assert.equal(quote(db, { adults: 5 }).adults, 5);
});

test("a private product is priced once; a shared one per person with children at half", t => {
  const db = quoteDb(t);
  addProduct(db);
  const fixed = quote(db, { children: 1 });
  assert.equal(fixed.pricingModel, "FIXED");
  assert.equal(fixed.vehicleCategory, "SEDAN");
  assert.deepEqual([fixed.baseAmount, fixed.gstAmount, fixed.totalAmount], [1000, 50, 1050]);
  assert.deepEqual([fixed.commissionRate, fixed.commissionAmount, fixed.supplierPayoutAmount], [20, 210, 840]);

  db.prepare("UPDATE products SET group_type = 'SHARED' WHERE id = 'prd_q'").run();
  const shared = quote(db, { children: 1 });
  assert.equal(shared.pricingModel, "PER_PERSON");
  assert.equal(shared.vehicleCategory, "SHARED_SEAT");
  assert.deepEqual([shared.baseAmount, shared.gstAmount, shared.totalAmount], [2500, 125, 2625]);

  const view = publicQuote(shared);
  assert.equal(view.nativeSlot, null);
  assert.equal(view.productId, "prd_q");
  assert.equal(view.currency, "INR");
  assert.deepEqual(view.breakdown, { baseAmount: 2500, fastagTolls: 0, stateTax: 0, gstAmount: 125, nightAllowance: 0, totalAmount: 2625 });
});

test("a pricing variant matches by name, then by vehicle keyword, then falls back to the first", t => {
  const db = quoteDb(t);
  addProduct(db);
  const variant = db.prepare(`INSERT INTO product_pricing (id, product_id, variant_name, pricing_model, base_price, estimated_fastag_tolls, estimated_state_tax, tax_percentage)
    VALUES (?, 'prd_q', ?, ?, ?, ?, ?, ?)`);
  variant.run("pp_1", "Innova Crysta", "FIXED", 3000, 0, 0, 5);
  variant.run("pp_2", "Swift Dzire", "FIXED", 2000, 0, 0, 5);
  variant.run("pp_3", "Walking group", "PER_PERSON", 800, 100, 40, 12);

  const named = quote(db, { variant_name: "  walking GROUP " });
  assert.equal(named.variantName, "Walking group");
  assert.equal(named.pricingModel, "PER_PERSON");
  assert.deepEqual([named.baseAmount, named.tolls, named.stateTax], [1600, 100, 40]);
  assert.equal(named.gstAmount, Math.round(1740 * 0.12));
  assert.equal(named.totalAmount, 1740 + named.gstAmount);

  assert.equal(quote(db, { vehicle_category: "sedan" }).baseAmount, 2000);
  assert.equal(quote(db, { vehicle_category: "PREMIUM_MUV" }).baseAmount, 3000);
  const fallback = quote(db, { vehicle_category: "LUXURY" });
  assert.equal(fallback.variantName, "Innova Crysta");
});

test("a product's own vehicle option sets a per-vehicle price", t => {
  const db = quoteDb(t);
  addProduct(db);
  db.prepare("INSERT INTO product_vehicle_options (id, product_id, vehicle_type, label, max_pax, price_inr) VALUES ('pvo_1', 'prd_q', 'SUV', 'Ertiga SUV', 6, 4500)").run();
  const suv = quote(db, { vehicle_category: "SUV" });
  assert.equal(suv.pricingModel, "PER_VEHICLE");
  assert.equal(suv.variantName, "Ertiga SUV");
  assert.equal(suv.baseAmount, 4500);
  db.prepare("UPDATE product_vehicle_options SET is_active = 0").run();
  assert.equal(quote(db, { vehicle_category: "SUV" }).baseAmount, 1000);
});

test("ticket tiers price the chosen counts, skip free tiers, and fall back to the list price when nothing is chosen", t => {
  const db = quoteDb(t);
  addProduct(db);
  const tier = db.prepare("INSERT INTO product_ticket_tiers (id, product_id, tier_name, price_inr, is_free, sort_order) VALUES (?, 'prd_q', ?, ?, ?, ?)");
  tier.run("tt_adult", "Adult", 700, 0, 1);
  tier.run("tt_child", "Child", 300, 0, 2);
  tier.run("tt_infant", "Infant", 250, 1, 3);

  const chosen = quote(db, { ticket_selections: { tt_adult: 2, Child: 1, tt_infant: 1 } });
  assert.equal(chosen.baseAmount, 1700);
  assert.equal(chosen.pricingModel, "PER_PERSON");
  assert.equal(quote(db, { ticket_selections: {} }).baseAmount, 1000);
  assert.equal(quote(db, { ticket_selections: "2 adults" }).baseAmount, 2000);
});

test("a hotel tier adds a per-person, per-night surcharge with children at half", t => {
  const db = quoteDb(t);
  addProduct(db, { product_type: "MULTI_DAY_PACKAGE", price_inr: 10000, duration_days: 4 });
  db.prepare("INSERT INTO product_hotel_tiers (id, product_id, tier_name, price_per_person_per_night_inr) VALUES ('ht_4', 'prd_q', '4-star', 1500)").run();
  db.prepare("INSERT INTO product_hotel_tiers (id, product_id, tier_name, price_per_person_per_night_inr) VALUES ('ht_std', 'prd_q', 'Standard', 0)").run();
  // 3 nights: 1500 x 2 adults x 3 + 750 x 1 child x 3 on top of 10000 x 2 + 5000.
  assert.equal(quote(db, { children: 1, hotel_tier_id: "ht_4" }).baseAmount, 25000 + 11250);
  assert.equal(quote(db, { children: 1, hotelTierId: "ht_std" }).baseAmount, 25000);
  assert.equal(quote(db, { children: 1, hotel_tier_id: "ht_missing" }).baseAmount, 25000);
});

test("a transfer inside India is priced by distance, with a night allowance for late flights", t => {
  const db = quoteDb(t);
  addProduct(db, { product_type: "TRANSFER" });
  db.prepare(`INSERT INTO transfer_routes (id, product_id, route_type, origin_name, origin_lat, origin_lng, dest_name, dest_lat, dest_lng, vehicle_category, max_passengers, max_luggage, night_allowance_inr)
    VALUES ('tr_q', 'prd_q', 'AIRPORT_PICKUP', 'Goa Airport', 15.38, 73.83, 'Panjim', 15.49, 73.82, 'SEDAN', 4, 3, 300)`).run();
  const route = { pickup_lat: 15.38, pickup_lng: 73.83, drop_lat: 15.49, drop_lng: 73.82 };

  const day = quote(db, { ...route, flight_arrival_time: "06:00" });
  assert.equal(day.nightAllowance, 0);
  assert.ok(day.baseAmount > 0);
  assert.equal(day.totalAmount, day.baseAmount + day.tolls + day.stateTax + day.gstAmount);
  const night = quote(db, { ...route, flight_arrival_time: "22:00" });
  assert.equal(night.nightAllowance, 300);
  assert.equal(night.baseAmount, day.baseAmount + 300);

  // A drop to the airport looks at the departing flight instead.
  db.prepare("UPDATE transfer_routes SET route_type = 'AIRPORT_DROP' WHERE id = 'tr_q'").run();
  assert.equal(quote(db, { ...route, flight_arrival_time: "23:30" }).nightAllowance, 0);
  assert.equal(quote(db, { ...route, flight_departure_time: "05:10" }).nightAllowance, 300);

  // Coordinates outside India, or missing, fall back to the listed price.
  const abroad = quote(db, { pickup_lat: 13.69, pickup_lng: 100.75, drop_lat: 13.75, drop_lng: 100.5 });
  assert.equal(abroad.baseAmount, 1000);
  assert.equal(quote(db, { ...route, drop_lng: "" }).baseAmount, 1000);
});

test("a native departure prices each unit from its rate and skips the vehicle seat check", t => {
  const db = quoteDb(t);
  addProduct(db);
  db.prepare("INSERT INTO product_options (id, product_id, option_code, name) VALUES ('opt_q', 'prd_q', 'STD', 'Standard')").run();
  saveInventoryRules(db, "prd_q", "opt_q", {
    operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00"], capacity: 10,
    adultPrice: 1000, childPrice: 400, cutoffMinutes: 0, cancellationHours: 24, blackoutDates: []
  });
  const native = quote(db, { product_option_id: "opt_q", pickup_time: "09:00", adults: 5, children: 1 });
  assert.ok(native.nativeSlot);
  assert.equal(native.pricingModel, "PER_PERSON");
  assert.deepEqual([native.baseAmount, native.tolls, native.stateTax, native.gstAmount], [5400, 0, 0, 270]);
  assert.equal(native.totalAmount, 5670);
  assert.equal(publicQuote(native).nativeSlot, native.nativeSlot);
});
