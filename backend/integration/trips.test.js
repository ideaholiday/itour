import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { requestJson, startTestServer } from "./helpers/serverHarness.js";
import { saveInventoryRules } from "../src/services/nativeInventoryService.js";

// Running a trip after its quotation is accepted (ADR 045).

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
const addDriver = (db, ctx, id, extra = {}) => {
  const row = { status: "AVAILABLE", insurance_expiry: null, ...extra };
  db.prepare(`INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, seat_capacity, status, insurance_expiry)
    VALUES (?, ?, ?, '+919811111111', 'Toyota Innova', ?, 6, ?, ?)`).run(id, ctx.supplier.id, `Driver ${id}`, `RJ14-${id}`, row.status, row.insurance_expiry);
};

test("an accepted trip is arranged line by line, cars get drivers without clashes, vendors are paid and the itinerary goes out when all is confirmed", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const start = day(3);

  const hotelWithRate = async (name, net) => {
    const hotel = (await call(api, ctx, "/hotels", { body: { name, city: "Jaipur" } })).data.hotel;
    await call(api, ctx, `/hotels/${hotel.id}/rates`, { body: { roomType: "Deluxe", mealPlan: "CP", validFrom: day(0), validTo: day(30), netPerNightInr: net } });
    return hotel;
  };
  const inn = await hotelWithRate("Pink City Inn", 3000);
  const palace = await hotelWithRate("Amber Palace", 5000);
  const cab = (await call(api, ctx, "/cab-types", { body: { name: "Innova", seats: 6 } })).data.cabType;
  const tour = (await call(api, ctx, "/services", { body: { kind: "SIGHTSEEING", name: "Jaipur sightseeing", startTime: "09:30" } })).data.service;
  await call(api, ctx, `/services/${tour.id}/rates`, { body: { cabTypeId: cab.id, validFrom: day(0), validTo: day(30), vehicleInr: 2500 } });
  const fort = (await call(api, ctx, "/services", { body: { kind: "ACTIVITY", name: "Amber Fort entry" } })).data.service;
  await call(api, ctx, `/services/${fort.id}/rates`, { body: { validFrom: day(0), validTo: day(30), adultInr: 500 } });

  const stay = (hotel, option) => ({ kind: "HOTEL", option, dayNumber: 1, title: "Stay", hotelId: hotel.id, roomType: "Deluxe", mealPlan: "CP", checkIn: start, nights: 2, rooms: 1 });
  const draft = {
    title: "Jaipur Weekend", customerName: "Kavya Rao", customerPhone: "+919800000002", customerEmail: "kavya@example.com",
    startDate: start, adults: 2, children: 0, markupPct: 10, options: [{ name: "3 Star" }, { name: "4 Star" }],
    lines: [
      stay(inn, 1), stay(palace, 2),
      { kind: "TRANSPORT", dayNumber: 2, serviceId: tour.id, cabTypeId: cab.id, date: day(4) },
      { kind: "ACTIVITY", dayNumber: 2, serviceId: fort.id, date: day(4) },
      { kind: "CUSTOM", dayNumber: 3, title: "Train tickets", date: day(5), amountInr: 1200 },
      { kind: "LISTING", dayNumber: 3, title: "Dolphin trip", productId: ctx.product.id, productOptionId: ctx.option.id, date: day(5), pickupTime: "09:00", adults: 2 },
    ],
  };
  const quotation = (await call(api, ctx, "/quotations", { body: draft })).data.quotation;
  assert.equal(quotation.trip, null, "no trip file before acceptance");
  const line = (view, predicate) => view.lines.find(predicate);
  const arrange = (id, body) => call(api, ctx, `/quotations/${quotation.id}/lines/${id}/arrangement`, { method: "PATCH", body });
  const hotelLine = line(quotation, (item) => item.hotelId === inn.id);
  assert.equal((await arrange(hotelLine.id, { status: "CONFIRMED" })).data.code, "NOT_ACCEPTED");

  await call(api, ctx, `/quotations/${quotation.id}/send`, { body: { email: false } });
  const accepted = (await call(api, ctx, `/quotations/${quotation.id}/status`, { body: { status: "ACCEPTED", option: 1 } })).data.quotation;
  // The chosen option's hotel, the car, the activity and the custom line; the listing is a booking.
  assert.deepEqual([accepted.trip.items, accepted.trip.toBook, accepted.trip.unbookedListings], [4, 4, 1]);
  assert.equal(accepted.trip.alerts.length, 4, "everything is within a week and unconfirmed");
  assert.equal((await arrange(line(accepted, (item) => item.hotelId === palace.id).id, { status: "CONFIRMED" })).data.code, "NOT_ARRANGED");
  assert.equal((await arrange(line(accepted, (item) => item.kind === "LISTING").id, { status: "CONFIRMED" })).data.code, "NOT_ARRANGED");

  // Hotel request: needs the hotel's email; without an email provider in tests it is not marked requested.
  const request = () => call(api, ctx, `/quotations/${quotation.id}/lines/${hotelLine.id}/request`, { body: {} });
  assert.equal((await request()).data.code, "HOTEL_EMAIL_MISSING");
  await call(api, ctx, `/hotels/${inn.id}`, { method: "PUT", body: { name: "Pink City Inn", city: "Jaipur", email: "Reservations@PinkCity.example" } });
  const requested = await request();
  assert.equal(requested.response.status, 200, JSON.stringify(requested.data));
  assert.notEqual(requested.data.email.status, "SENT");
  assert.equal(line(requested.data.quotation, (item) => item.id === hotelLine.id).arrangementStatus, "TO_BOOK");
  const confirmed = (await arrange(hotelLine.id, { status: "CONFIRMED", confirmationRef: "PC-7781", vendorName: "Pink City Inn" })).data.quotation;
  assert.deepEqual([line(confirmed, (item) => item.id === hotelLine.id).confirmationRef, confirmed.trip.confirmed, confirmed.trip.alerts.length], ["PC-7781", 1, 3]);

  // Drivers: the supplier's, one per car, available, papers valid, not on another trip or booking those days.
  const carLine = line(accepted, (item) => item.kind === "TRANSPORT");
  addDriver(db, ctx, "drv_a");
  addDriver(db, ctx, "drv_b", { insurance_expiry: day(1) });
  addDriver(db, ctx, "drv_c", { status: "SUSPENDED" });
  addDriver(db, ctx, "drv_d");
  assert.equal((await arrange(carLine.id, { driverIds: ["drv_a", "drv_d"] })).data.code, "TOO_MANY_DRIVERS");
  assert.equal((await arrange(carLine.id, { driverIds: ["drv_b"] })).data.code, "FLEET_DOCUMENT_EXPIRED");
  assert.equal((await arrange(carLine.id, { driverIds: ["drv_c"] })).data.code, "DRIVER_UNAVAILABLE");
  assert.equal((await arrange(carLine.id, { driverIds: ["nobody"] })).data.code, "DRIVER_NOT_FOUND");
  assert.equal((await arrange(line(accepted, (item) => item.kind === "ACTIVITY").id, { driverIds: ["drv_a"] })).data.code, "NOT_A_CAR");
  const withDriver = await arrange(carLine.id, { driverIds: ["drv_a"], status: "CONFIRMED" });
  assert.deepEqual(line(withDriver.data.quotation, (item) => item.id === carLine.id).driverIds, ["drv_a"]);

  // The same driver on another accepted trip the same day is refused.
  const other = (await call(api, ctx, `/quotations/${quotation.id}/copy`, { body: { startDate: start, customerName: "Anita Das" } })).data.quotation;
  await call(api, ctx, `/quotations/${other.id}/send`, { body: { email: false } });
  const otherAccepted = (await call(api, ctx, `/quotations/${other.id}/status`, { body: { status: "ACCEPTED", option: 1 } })).data.quotation;
  const otherCar = line(otherAccepted, (item) => item.kind === "TRANSPORT");
  const busy = await call(api, ctx, `/quotations/${other.id}/lines/${otherCar.id}/arrangement`, { method: "PATCH", body: { driverIds: ["drv_a"] } });
  assert.equal(busy.data.code, "DRIVER_BUSY");
  assert.match(busy.data.error, new RegExp(quotation.ref));

  // Book the listing; a driver on that booking is busy that day too.
  const booked = await call(api, ctx, `/quotations/${quotation.id}/lines/${line(accepted, (item) => item.kind === "LISTING").id}/book`, { body: {} });
  assert.equal(booked.response.status, 201, JSON.stringify(booked.data));
  db.prepare(`INSERT INTO driver_assignments (id, booking_id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, supplier_driver_id)
    VALUES ('das_d', ?, ?, 'Driver drv_d', '+919811111111', 'Toyota Innova', 'RJ14-drv_d', 'drv_d')`).run(booked.data.booking.id, ctx.supplier.id);
  db.prepare("UPDATE bookings SET activity_date = ? WHERE id = ?").run(day(4), booked.data.booking.id);
  assert.equal((await call(api, ctx, `/quotations/${other.id}/lines/${otherCar.id}/arrangement`, { method: "PATCH", body: { driverIds: ["drv_d"] } })).data.code, "DRIVER_BUSY");
  db.prepare("UPDATE bookings SET activity_date = ? WHERE id = ?").run(day(5), booked.data.booking.id);

  // The car schedule shows both trips' cars with their drivers.
  const schedule = await call(api, ctx, `/car-schedule?from=${day(4)}&days=1`);
  assert.equal(schedule.response.status, 200, JSON.stringify(schedule.data));
  const scheduled = schedule.data.cars.find((car) => car.lineId === carLine.id);
  assert.deepEqual([scheduled.ref, scheduled.startTime, scheduled.cabType, scheduled.drivers.map((driver) => driver.vehicleNumber)], [quotation.ref, "09:30", "Innova", ["RJ14-drv_a"]]);
  assert.equal(schedule.data.cars.length, 2);
  assert.ok(schedule.data.fleet.some((driver) => driver.id === "drv_d"));

  // The itinerary waits for every line.
  const early = await call(api, ctx, `/quotations/${quotation.id}/itinerary/send`, { body: {} });
  assert.equal(early.data.code, "NOT_ALL_CONFIRMED");
  assert.match(early.data.error, /Amber Fort entry, Train tickets/);
  await arrange(line(accepted, (item) => item.kind === "ACTIVITY").id, { status: "CONFIRMED" });

  // Vendor money: never more than owed; a changed cost and a cancelled line change what is owed.
  const trainLine = line(accepted, (item) => item.kind === "CUSTOM");
  const pay = (id, amount) => call(api, ctx, `/quotations/${quotation.id}/lines/${id}/vendor-payments`, { body: { mode: "BANK", amount_inr: amount } });
  assert.equal((await pay(hotelLine.id, 6001)).data.code, "OVERPAYMENT");
  const paid = await pay(hotelLine.id, 4000);
  assert.equal(paid.response.status, 201, JSON.stringify(paid.data));
  await arrange(trainLine.id, { status: "CONFIRMED", payableInr: 1500 });
  const money = (await call(api, ctx, `/quotations/${quotation.id}`)).data.quotation.trip.money;
  // Owed: hotel 6000 + car 2500 + tickets 1000 + trains 1500 = 11000; paid 4000.
  assert.deepEqual([money.vendorPayableInr, money.vendorPaidInr, money.vendorDueInr], [11000, 4000, 7000]);
  const quoteNow = (await call(api, ctx, `/quotations/${quotation.id}`)).data.quotation;
  assert.equal(money.marginInr, quoteNow.totals.subtotalInr - 11000);
  const cancelled = (await arrange(trainLine.id, { status: "CANCELLED" })).data.quotation.trip;
  assert.deepEqual([cancelled.money.vendorPayableInr, cancelled.cancelled], [9500, 1]);

  // All confirmed or cancelled and the listing booked: the itinerary goes out with its own link.
  const sent = await call(api, ctx, `/quotations/${quotation.id}/itinerary/send`, { body: {} });
  assert.equal(sent.response.status, 200, JSON.stringify(sent.data));
  assert.match(sent.data.whatsappText, /is confirmed/);
  const link = new URL(sent.data.shareUrl).pathname;
  const pdf = await fetch(`${api.baseUrl}${link}`);
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  // An itinerary token doesn't open the quotation link, nor the other way round.
  assert.equal((await fetch(`${api.baseUrl}${link.replace("/itinerary/", "/share/")}`)).status, 404);
  const quotationLink = new URL((await call(api, ctx, `/quotations/${quotation.id}/send`, { body: { email: false } })).data.shareUrl).pathname;
  assert.equal((await fetch(`${api.baseUrl}${quotationLink.replace("/share/", "/itinerary/")}`)).status, 404);
  assert.equal((await fetch(`${api.baseUrl}/api/suppliers/${ctx.supplier.id}/quotations/${quotation.id}/itinerary`, { headers: { authorization: `Bearer ${ctx.ownerToken}` } })).status, 200);
});

test("trip operations are manager work", async t => {
  const api = await startTestServer(); t.after(() => api.stop());
  const db = new Database(api.databasePath); t.after(() => db.close());
  const ctx = setup(db);
  const staff = await call(api, ctx, "/staff", { body: { name: "Counter", email: "desk-trips@example.com", role: "FRONT_DESK" } });
  const desk = (await requestJson(api.baseUrl, "/api/auth/login", { body: { email: "desk-trips@example.com", password: staff.data.temporaryPassword, portal: "supplier" } })).data.token;
  assert.equal((await requestJson(api.baseUrl, `/api/suppliers/${ctx.supplier.id}/car-schedule?from=${day(1)}`, { token: desk })).response.status, 403);
});
