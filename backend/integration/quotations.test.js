import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";

// Package quotations and the hotel rate sheet (ADR 040).

const JWT_SECRET = "integration-jwt-secret-with-at-least-32-characters";
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

function setup(db) {
  const product = db.prepare("SELECT * FROM products WHERE product_type = 'DAY_TOUR' AND group_type = 'SHARED' AND status = 'PUBLISHED' LIMIT 1").get();
  const option = db.prepare("SELECT * FROM product_options WHERE product_id = ? LIMIT 1").get(product.id);
  saveInventoryRules(db, product.id, option.id, { operatingDays: [0, 1, 2, 3, 4, 5, 6], departureTimes: ["09:00"], capacity: 10, adultPrice: 1000, childPrice: 400, cutoffMinutes: 60, cancellationHours: 24, blackoutDates: [] });
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(product.supplier_id);
  let owner = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = 'SUPPLIER'").get(supplier.email);
  if (!owner) {
    db.prepare("INSERT INTO users (id, name, email, password, role) VALUES ('usr_owner', 'Owner', ?, 'x', 'SUPPLIER')").run(supplier.email);
    owner = db.prepare("SELECT * FROM users WHERE id = 'usr_owner'").get();
  }
  return { product, option, supplier, ownerToken: jwt.sign({ id: owner.id, email: owner.email, role: "SUPPLIER" }, JWT_SECRET) };
}

const call = (api, ctx, path, options = {}) => requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}${path}`, { token: ctx.ownerToken, ...options });

test("a package is priced on the server, sent as a PDF link, accepted, booked line by line and paid", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const checkIn = day(30);

  // Rate sheet: ₹4000 a night up to check-in night, ₹5000 from the next night.
  const hotel = (await call(api, ctx, "/hotels", { body: { name: "Sea Breeze Resort", city: "Goa", starRating: 4 } })).data.hotel;
  const season = (body) => call(api, ctx, `/hotels/${hotel.id}/rates`, { body: { roomType: "Deluxe", mealPlan: "CP", ...body } });
  assert.equal((await season({ validFrom: day(20), validTo: checkIn, netPerNightInr: 4000 })).response.status, 201);
  assert.equal((await season({ validFrom: day(31), validTo: day(60), netPerNightInr: 5000 })).response.status, 201);
  const overlap = await season({ validFrom: day(25), validTo: day(35), netPerNightInr: 1 });
  assert.equal(overlap.response.status, 409);
  assert.equal(overlap.data.code, "RATE_OVERLAP");

  const draft = {
    title: "Goa Beach Escape", customerName: "Meera Iyer", customerEmail: "meera@example.com", customerPhone: "+919812345678",
    startDate: checkIn, adults: 2, children: 0, markupPct: 10, notes: "Airport pickup included.",
    lines: [
      { kind: "HOTEL", dayNumber: 1, title: "Stay", hotelId: hotel.id, roomType: "Deluxe", mealPlan: "CP", checkIn, nights: 2, rooms: 2 },
      { kind: "CUSTOM", dayNumber: 1, title: "Airport cab", amountInr: 2000 },
      { kind: "LISTING", dayNumber: 2, title: "Dolphin trip", productId: ctx.product.id, productOptionId: ctx.option.id, date: day(31), pickupTime: "09:00", adults: 2 },
    ],
  };
  const created = await call(api, ctx, "/quotations", { body: draft });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const quotation = created.data.quotation;
  assert.deepEqual(quotation.lines.map((line) => line.priceInr), [18000, 2000, 2000]);
  assert.deepEqual(quotation.totals, { costInr: 20000, listingsInr: 2000, markupInr: 2000, subtotalInr: 24000, gstPct: 5, gstInr: 1200, totalInr: 25200, paidInr: 0, dueInr: 25200, perPersonInr: 12600 });
  assert.match(quotation.ref, /^Q-[A-Z0-9]{6}$/);

  // A night with no season is refused, naming the night.
  const gap = await call(api, ctx, "/quotations", { body: { ...draft, lines: [{ ...draft.lines[0], checkIn: day(59), nights: 3 }] } });
  assert.equal(gap.response.status, 409);
  assert.equal(gap.data.code, "RATE_MISSING");

  // Send: no email provider in tests, but the link works and the draft becomes sent.
  const sent = await call(api, ctx, `/quotations/${quotation.id}/send`, { body: {} });
  assert.equal(sent.response.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.quotation.status, "SENT");
  assert.match(sent.data.whatsappText, /INR 25,200/);
  const path = new URL(sent.data.shareUrl).pathname;
  const pdf = await fetch(`${api.baseUrl}${path}`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  const forged = path.replace(/.$/, (last) => (last === "A" ? "B" : "A"));
  assert.equal((await fetch(`${api.baseUrl}${forged}`)).status, 404);

  // Can't book before it's accepted; after, only listing lines, once each.
  const [hotelLine, , listingLine] = sent.data.quotation.lines;
  assert.equal((await call(api, ctx, `/quotations/${quotation.id}/lines/${listingLine.id}/book`, { body: {} })).data.code, "NOT_ACCEPTED");
  assert.equal((await call(api, ctx, `/quotations/${quotation.id}/status`, { body: { status: "ACCEPTED" } })).response.status, 200);
  assert.equal((await call(api, ctx, `/quotations/${quotation.id}/lines/${hotelLine.id}/book`, { body: {} })).data.code, "NOT_A_LISTING");
  const booked = await call(api, ctx, `/quotations/${quotation.id}/lines/${listingLine.id}/book`, { body: {} });
  assert.equal(booked.response.status, 201, JSON.stringify(booked.data));
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(booked.data.booking.id);
  assert.deepEqual([booking.amount_inr, booking.balance_due_inr, booking.payment_status, booking.quotation_id, booking.activity_date], [2000, 0, "OFFLINE", quotation.id, day(31)]);
  assert.equal((await call(api, ctx, `/quotations/${quotation.id}/lines/${listingLine.id}/book`, { body: {} })).data.code, "ALREADY_BOOKED");
  const seats = await call(api, ctx, `/availability?date=${day(31)}`);
  assert.equal(seats.data.products.find((row) => row.optionId === ctx.option.id).departures[0].vacancies, 8);

  // Accepted is final; the money is tracked on the quotation.
  assert.equal((await call(api, ctx, `/quotations/${quotation.id}`, { method: "PUT", body: draft })).data.code, "QUOTATION_FINAL");
  assert.equal((await call(api, ctx, `/quotations/${quotation.id}/payments`, { body: { mode: "BANK", amount_inr: 30000 } })).data.code, "OVERPAYMENT");
  const paid = await call(api, ctx, `/quotations/${quotation.id}/payments`, { body: { mode: "UPI", amount_inr: 10000, reference: "UPI-1" } });
  assert.equal(paid.response.status, 201, JSON.stringify(paid.data));
  assert.deepEqual([paid.data.quotation.totals.paidInr, paid.data.quotation.totals.dueInr], [10000, 15200]);

  const pdfDownload = await fetch(`${api.baseUrl}/api/suppliers/${ctx.supplier.id}/quotations/${quotation.id}/pdf`, { headers: { authorization: `Bearer ${ctx.ownerToken}` } });
  assert.equal(pdfDownload.status, 200);
});

test("quotations and the rate sheet are manager work", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const staff = await call(api, ctx, "/staff", { body: { name: "Counter", email: "desk@example.com", role: "FRONT_DESK" } });
  const desk = (await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "desk@example.com", password: staff.data.temporaryPassword, portal: "supplier" } })).data.token;
  for (const path of ["/quotations", "/hotels", "/cab-types", "/services"]) {
    assert.equal((await requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}${path}`, { token: desk })).response.status, 403);
  }
});

test("transfers, sightseeing and activities price from the private rate sheet, fill the day text, warn, and copy to a new date", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  // A Monday about six weeks out, so the closed-Friday check has a known weekday.
  const start = (() => { const date = new Date(Date.now() + 42 * 86400000); date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7)); return date.toISOString().slice(0, 10); })();
  const plus = (days) => new Date(Date.parse(`${start}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

  const innova = (await call(api, ctx, "/cab-types", { body: { name: "Innova Crysta", seats: 6 } })).data.cabType;
  const sedan = (await call(api, ctx, "/cab-types", { body: { name: "Sedan", seats: 4 } })).data.cabType;
  const transfer = (await call(api, ctx, "/services", { body: { kind: "TRANSFER", name: "Delhi Airport to Hotel", city: "Delhi", fromPlace: "IGI Airport", toPlace: "Hotel",
    dayTitle: "Arrive in Delhi", dayDescription: "Meet our driver at arrivals and transfer to your hotel." } })).data.service;
  const agra = (await call(api, ctx, "/services", { body: { kind: "SIGHTSEEING", name: "Agra local sightseeing", city: "Agra", closedWeekdays: [5], dayTitle: "Agra: Taj Mahal and Agra Fort" } })).data.service;
  const taj = (await call(api, ctx, "/services", { body: { kind: "ACTIVITY", name: "Taj Mahal entry", city: "Agra", closedWeekdays: [5] } })).data.service;

  const rate = (service, body) => call(api, ctx, `/services/${service.id}/rates`, { body: { validFrom: plus(-10), validTo: plus(60), ...body } });
  assert.equal((await rate(transfer, { cabTypeId: innova.id, vehicleInr: 1500 })).response.status, 201);
  assert.equal((await rate(agra, { cabTypeId: innova.id, vehicleInr: 3500 })).response.status, 201);
  assert.equal((await rate(taj, { adultInr: 1300, childInr: 650 })).response.status, 201);
  assert.equal((await rate(agra, { vehicleInr: 3500 })).data.code, "CAB_TYPE_REQUIRED");
  assert.equal((await rate(taj, { childInr: 10 })).data.code, "PRICE_REQUIRED");
  assert.equal((await rate(agra, { cabTypeId: innova.id, vehicleInr: 1, validFrom: plus(5), validTo: plus(90) })).data.code, "RATE_OVERLAP");

  const hotel = (await call(api, ctx, "/hotels", { body: { name: "Agra Grand", city: "Agra" } })).data.hotel;
  await call(api, ctx, `/hotels/${hotel.id}/rates`, { body: { roomType: "Deluxe", mealPlan: "CP", validFrom: plus(-10), validTo: plus(60), netPerNightInr: 3000 } });

  // 7 adults + 1 child: two Innovas by default (6 seats each), tickets per person.
  const draft = {
    title: "Golden Triangle", destination: "Delhi Agra", customerName: "Rahul Verma", customerPhone: "+919800000001",
    startDate: start, adults: 7, children: 1, markupPct: 10,
    lines: [
      { kind: "TRANSPORT", dayNumber: 1, serviceId: transfer.id, cabTypeId: innova.id, date: start },
      { kind: "HOTEL", dayNumber: 1, title: "Stay", hotelId: hotel.id, roomType: "Deluxe", mealPlan: "CP", checkIn: start, nights: 1, rooms: 4 },
      { kind: "TRANSPORT", dayNumber: 2, serviceId: agra.id, cabTypeId: innova.id, date: plus(1), vehicles: 1 },
      { kind: "ACTIVITY", dayNumber: 2, serviceId: taj.id, date: plus(1) },
      { kind: "CUSTOM", dayNumber: 3, title: "Farewell dinner", date: plus(1), amountInr: 1000 },
    ],
    days: [{ dayNumber: 3, title: "Departure" }],
  };
  const created = await call(api, ctx, "/quotations", { body: draft });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const quotation = created.data.quotation;
  const [airport, stay, sightseeing, tickets] = quotation.lines;
  assert.deepEqual([airport.title, airport.vehicles, airport.priceInr], ["Delhi Airport to Hotel", 2, 3000]);
  assert.equal(stay.priceInr, 12000);
  assert.deepEqual([sightseeing.vehicles, sightseeing.priceInr], [1, 3500]);
  assert.deepEqual([tickets.adults, tickets.children, tickets.priceInr], [7, 1, 7 * 1300 + 650]);
  // Everything from the rate sheet is cost and carries the markup: 3000 + 12000 + 3500 + 9750 + 1000 = 29250.
  assert.deepEqual([quotation.totals.costInr, quotation.totals.markupInr, quotation.totals.totalInr, quotation.totals.perPersonInr], [29250, 2925, 33784, 4223]);
  assert.deepEqual(quotation.days, [
    { dayNumber: 1, title: "Arrive in Delhi", description: "Meet our driver at arrivals and transfer to your hotel." },
    { dayNumber: 2, title: "Agra: Taj Mahal and Agra Fort", description: null },
    { dayNumber: 3, title: "Departure", description: null },
  ]);
  // One Innova for 8 people, a line dated off its day, and no hotel on night 2.
  assert.equal(quotation.warnings.length, 3, JSON.stringify(quotation.warnings));
  assert.match(quotation.warnings.join(" "), /1 × Innova Crysta seat 6, but 8/);
  assert.match(quotation.warnings.join(" "), /Farewell dinner is dated/);
  assert.match(quotation.warnings.join(" "), /No hotel for the night of day 2/);

  // Closed on Fridays; no price for a cab type; another supplier's service is not found.
  const friday = plus(4);
  assert.equal((await call(api, ctx, "/quotations", { body: { ...draft, lines: [{ ...draft.lines[3], date: friday }] } })).data.code, "SERVICE_CLOSED");
  assert.equal((await call(api, ctx, "/quotations", { body: { ...draft, lines: [{ ...draft.lines[0], cabTypeId: sedan.id }] } })).data.code, "RATE_MISSING");
  db.prepare("INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state) VALUES ('sup_other_rates', 'Other Operator', 'Other', 'other-rates@example.com', '+919800000000', 'Agra', 'Uttar Pradesh')").run();
  db.prepare("UPDATE supplier_services SET supplier_id = 'sup_other_rates' WHERE id = ?").run(taj.id);
  assert.equal((await call(api, ctx, "/quotations", { body: { ...draft, lines: [draft.lines[3]] } })).data.code, "SERVICE_NOT_FOUND");
  db.prepare("UPDATE supplier_services SET supplier_id = ? WHERE id = ?").run(ctx.supplier.id, taj.id);

  // The PDF renders day text and cars.
  const pdf = await fetch(`${api.baseUrl}/api/suppliers/${ctx.supplier.id}/quotations/${quotation.id}/pdf`, { headers: { authorization: `Bearer ${ctx.ownerToken}` } });
  assert.equal(pdf.status, 200);

  // Suggestions find it by destination and length; a copy moves every date and prices again.
  const suggested = await call(api, ctx, "/quotations/suggestions?destination=agra&days=3");
  assert.deepEqual(suggested.data.quotations.map((row) => [row.ref, row.days]), [[quotation.ref, 3]]);
  assert.equal((await call(api, ctx, "/quotations/suggestions?destination=agra&days=5")).data.quotations.length, 0);
  const copy = await call(api, ctx, `/quotations/${quotation.id}/copy`, { body: { startDate: plus(7), customerName: "Anita Das" } });
  assert.equal(copy.response.status, 201, JSON.stringify(copy.data));
  assert.notEqual(copy.data.quotation.ref, quotation.ref);
  assert.deepEqual([copy.data.quotation.status, copy.data.quotation.customerName, copy.data.quotation.customerPhone], ["DRAFT", "Anita Das", null]);
  assert.deepEqual(copy.data.quotation.lines.map((line) => line.date), quotation.lines.map((line) => new Date(Date.parse(`${line.date}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10)));
  assert.equal(copy.data.quotation.totals.totalInr, quotation.totals.totalInr);
  assert.deepEqual(copy.data.quotation.days, quotation.days);
  // Moved past the end of the season: refused, naming the service and date.
  const late = await call(api, ctx, `/quotations/${quotation.id}/copy`, { body: { startDate: plus(60) } });
  assert.equal(late.data.code, "RATE_MISSING");

  // The rate sheet never reaches public listings.
  const publicProducts = await requestJson(api.baseUrl, "/api/products?search=Agra%20local");
  assert.ok(!JSON.stringify(publicProducts.data).includes(agra.id));
});

test("hotel options share the itinerary, are priced one by one, and the customer's choice sets the price", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const start = day(40);
  const hotelWithRate = async (name, stars, net) => {
    const hotel = (await call(api, ctx, "/hotels", { body: { name, city: "Jaipur", starRating: stars } })).data.hotel;
    await call(api, ctx, `/hotels/${hotel.id}/rates`, { body: { roomType: "Deluxe", mealPlan: "CP", validFrom: day(30), validTo: day(60), netPerNightInr: net } });
    return hotel;
  };
  const three = await hotelWithRate("Pink City Inn", 3, 3000);
  const four = await hotelWithRate("Amber Palace", 4, 5000);
  const stay = (hotel, option) => ({ kind: "HOTEL", option, dayNumber: 1, title: "Stay", hotelId: hotel.id, roomType: "Deluxe", mealPlan: "CP", checkIn: start, nights: 2, rooms: 1 });
  const draft = {
    title: "Jaipur Weekend", destination: "Jaipur", customerName: "Kavya Rao", customerPhone: "+919800000002", customerEmail: "kavya@example.com",
    startDate: start, adults: 2, children: 0, markupPct: 10,
    options: [{ name: "3 Star" }, { name: "4 Star" }],
    lines: [stay(three, 1), stay(four, 2), { kind: "CUSTOM", dayNumber: 2, title: "City tour", date: day(41), amountInr: 2000 }, { kind: "CUSTOM", dayNumber: 3, title: "Drop", date: day(42), amountInr: 1000 }],
  };

  // A hotel in an option that doesn't exist is refused.
  assert.equal((await call(api, ctx, "/quotations", { body: { ...draft, options: [] } })).data.code, "UNKNOWN_OPTION");

  const created = await call(api, ctx, "/quotations", { body: draft });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const quotation = created.data.quotation;
  // 3 Star: 6000 + 3000 shared = 9000, +10% = 9900, +5% = 10395. 4 Star: 10000 + 3000 = 13000 → 14300 → 15015.
  assert.deepEqual(quotation.options.map((option) => [option.number, option.name, option.totals.totalInr, option.totals.perPersonInr]), [[1, "3 Star", 10395, 5198], [2, "4 Star", 15015, 7508]]);
  assert.equal(quotation.totals.totalInr, 10395, "until the customer picks, the quotation shows option 1");
  assert.deepEqual(quotation.lines.map((line) => line.option), [1, 2, null, null]);
  assert.deepEqual(quotation.warnings, []);

  // An option missing a night is warned by name.
  const short = await call(api, ctx, `/quotations/${quotation.id}`, { method: "PUT", body: { ...draft, lines: [stay(three, 1), { ...stay(four, 2), nights: 1 }, ...draft.lines.slice(2)] } });
  assert.deepEqual(short.data.quotation.warnings, ["4 Star: no hotel for the night of day 2."]);
  await call(api, ctx, `/quotations/${quotation.id}`, { method: "PUT", body: draft });

  const sent = await call(api, ctx, `/quotations/${quotation.id}/send`, { body: {} });
  assert.match(sent.data.whatsappText, /3 Star: INR 10,395\n- 4 Star: INR 15,015/);
  const pdf = await fetch(`${api.baseUrl}/api/suppliers/${ctx.supplier.id}/quotations/${quotation.id}/pdf`, { headers: { authorization: `Bearer ${ctx.ownerToken}` } });
  assert.equal(pdf.status, 200);

  // Accepting needs the option; the chosen option's price becomes the quotation's and is what the customer owes.
  assert.equal((await call(api, ctx, `/quotations/${quotation.id}/status`, { body: { status: "ACCEPTED" } })).data.code, "OPTION_REQUIRED");
  assert.equal((await call(api, ctx, `/quotations/${quotation.id}/status`, { body: { status: "ACCEPTED", option: 3 } })).data.code, "OPTION_REQUIRED");
  const accepted = await call(api, ctx, `/quotations/${quotation.id}/status`, { body: { status: "ACCEPTED", option: 2 } });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.data));
  assert.deepEqual([accepted.data.quotation.status, accepted.data.quotation.selectedOption, accepted.data.quotation.totals.totalInr, accepted.data.quotation.totals.dueInr], ["ACCEPTED", 2, 15015, 15015]);
  assert.equal((await call(api, ctx, `/quotations/${quotation.id}/payments`, { body: { mode: "UPI", amount_inr: 15016 } })).data.code, "OVERPAYMENT");
  const acceptedPdf = await fetch(`${api.baseUrl}/api/suppliers/${ctx.supplier.id}/quotations/${quotation.id}/pdf`, { headers: { authorization: `Bearer ${ctx.ownerToken}` } });
  assert.equal(acceptedPdf.status, 200);

  // A copy keeps the options open again.
  const copy = await call(api, ctx, `/quotations/${quotation.id}/copy`, { body: { startDate: day(45) } });
  assert.equal(copy.response.status, 201, JSON.stringify(copy.data));
  assert.deepEqual([copy.data.quotation.options.length, copy.data.quotation.selectedOption, copy.data.quotation.totals.totalInr], [2, null, 10395]);
});

test("per-km cars charge the greater of km driven and the daily minimum plus driver allowance, and short rooms are warned", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const start = day(40);

  const innova = (await call(api, ctx, "/cab-types", { body: { name: "Innova", seats: 6 } })).data.cabType;
  const outstation = (await call(api, ctx, "/services", { body: { kind: "TRANSFER", name: "Delhi to Jaipur by car", pricing: "PER_KM", distanceKm: 280 } })).data.service;
  assert.deepEqual([outstation.pricing, outstation.distanceKm], ["PER_KM", 280]);
  const season = (body) => call(api, ctx, `/services/${outstation.id}/rates`, { body: { cabTypeId: innova.id, validFrom: day(30), validTo: day(60), ...body } });
  assert.equal((await season({ vehicleInr: 5000 })).data.code, "PRICE_REQUIRED", "a per-km service needs a price per km");
  assert.equal((await season({ perKmInr: 14, minKmPerDay: 250, driverAllowanceInr: 300 })).response.status, 201);
  // Switching to fixed prices would leave the season without a price.
  assert.equal((await call(api, ctx, `/services/${outstation.id}`, { method: "PUT", body: { kind: "TRANSFER", name: "Delhi to Jaipur by car", pricing: "FIXED" } })).data.code, "PRICING_CHANGE");

  const hotel = (await call(api, ctx, "/hotels", { body: { name: "Jaipur Haveli", city: "Jaipur" } })).data.hotel;
  const room = await call(api, ctx, `/hotels/${hotel.id}/rates`, { body: { roomType: "Deluxe", mealPlan: "CP", validFrom: day(30), validTo: day(60), netPerNightInr: 3000, maxGuests: 3 } });
  assert.equal(room.data.hotel.rates[0].maxGuests, 3);

  const car = { kind: "TRANSPORT", dayNumber: 1, serviceId: outstation.id, cabTypeId: innova.id, date: start };
  const draft = {
    title: "Rajasthan drive", customerName: "Arjun Mehta", startDate: start, adults: 7, children: 0, markupPct: 0,
    lines: [
      car, // usual 280 km, 1 day: max(280, 250) × 14 + 300 = 4220 per car, 2 cars for 7
      { ...car, dayNumber: 2, date: day(41), km: 600, carDays: 3, vehicles: 2 }, // max(600, 750) × 14 + 900 = 11400 per car
      { ...car, dayNumber: 3, date: day(42), km: 900, carDays: 3, vehicles: 2 }, // 900 × 14 + 900 = 13500 per car
      { kind: "HOTEL", dayNumber: 1, title: "Stay", hotelId: hotel.id, roomType: "Deluxe", mealPlan: "CP", checkIn: start, nights: 2, rooms: 2 },
    ],
  };
  const created = await call(api, ctx, "/quotations", { body: draft });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const [first, second, third] = created.data.quotation.lines.filter((line) => line.kind === "TRANSPORT");
  assert.deepEqual([first.km, first.carDays, first.vehicles, first.priceInr], [280, 1, 2, 8440]);
  assert.deepEqual([second.km, second.carDays, second.priceInr], [600, 3, 22800]);
  assert.equal(third.priceInr, 27000);
  // 2 rooms × 3 guests = 6 beds for 7 travellers.
  assert.deepEqual(created.data.quotation.warnings, ["Jaipur Haveli: 2 Deluxe rooms sleep 6, but 7 are travelling."]);

  const three = await call(api, ctx, `/quotations/${created.data.quotation.id}`, { method: "PUT", body: { ...draft, lines: [...draft.lines.slice(0, 3), { ...draft.lines[3], rooms: 3 }] } });
  assert.deepEqual(three.data.quotation.warnings, []);

  // No usual distance and no km on the line: refused.
  const noDistance = (await call(api, ctx, "/services", { body: { kind: "SIGHTSEEING", name: "Car at disposal", pricing: "PER_KM" } })).data.service;
  await call(api, ctx, `/services/${noDistance.id}/rates`, { body: { cabTypeId: innova.id, validFrom: day(30), validTo: day(60), perKmInr: 14 } });
  assert.equal((await call(api, ctx, "/quotations", { body: { ...draft, lines: [{ ...car, serviceId: noDistance.id }] } })).data.code, "KM_REQUIRED");

  const pdf = await fetch(`${api.baseUrl}/api/suppliers/${ctx.supplier.id}/quotations/${created.data.quotation.id}/pdf`, { headers: { authorization: `Bearer ${ctx.ownerToken}` } });
  assert.equal(pdf.status, 200);
});
