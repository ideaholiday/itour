import test from "node:test";
import assert from "node:assert/strict";
import { assignDriverToBooking } from "../src/services/driverDispatchService.js";
import { authenticateDriverAccount, driverEmailFor, driverTripLink, driverTrips, requestDriverCode, verifyDriverCode } from "../src/services/driverAccountService.js";
import { migratedDb } from "./helpers/migratedDb.js";

process.env.JWT_SECRET ||= "unit-test-jwt-secret-with-at-least-32-characters";

function database(t) {
  const db = migratedDb(t);
  db.prepare(`INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, kyb_status, subscription_exempt)
    VALUES ('sup_a', 'Goa Cabs', 'A', 'a@example.test', '+919000000001', 'Goa', 'Goa', 'APPROVED', 1),
           ('sup_b', 'Coast Rides', 'B', 'b@example.test', '+919000000002', 'Goa', 'Goa', 'APPROVED', 1)`).run();
  db.prepare(`INSERT INTO products (id, supplier_id, product_type, title, city, state, category, price_inr, duration_hours)
    VALUES ('prd_a', 'sup_a', 'TRANSFER', 'Airport run', 'Goa', 'Goa', 'Transfers', 1500, 2),
           ('prd_b', 'sup_b', 'TRANSFER', 'Beach drop', 'Goa', 'Goa', 'Transfers', 900, 1)`).run();
  // The same driver works for two suppliers.
  db.prepare(`INSERT INTO supplier_drivers (id, supplier_id, driver_name, driver_phone, vehicle_model, vehicle_number, status, driver_email, seat_capacity)
    VALUES ('drv_a', 'sup_a', 'Ravi Kumar', '+919876543210', 'Swift Dzire Sedan', 'GA-03-AB-1234', 'AVAILABLE', 'Ravi@Example.test', 4),
           ('drv_b', 'sup_b', 'Ravi Kumar', '+919876543210', 'Swift Dzire Sedan', 'GA-03-AB-1234', 'AVAILABLE', 'ravi@example.test', 4),
           ('drv_x', 'sup_a', 'Other Driver', '+919812345678', 'Swift Dzire Sedan', 'GA-03-XY-9999', 'AVAILABLE', 'other@example.test', 4)`).run();
  return db;
}

function assignTrip(db, id, supplierId, driverId, fields = {}) {
  const row = {
    id, ref: `IH-${id}`, supplier_id: supplierId, product_id: supplierId === "sup_a" ? "prd_a" : "prd_b", product_type: "TRANSFER",
    activity_date: "2099-03-10", pickup_time: "09:00", pickup_location: "Goa Airport", amount_inr: 1500, vehicle_category: "SEDAN",
    payment_status: "PAID", supplier_assignment_status: "SUPPLIER_ACCEPTED", status: "confirmed", adults: 2, children: 0,
    traveler_name: "Asha", traveler_phone: "+919111111111", ...fields,
  };
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO bookings (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(row));
  return assignDriverToBooking(db, { supplierId, bookingId: id, supplierDriverId: driverId });
}

function signIn(db, login, now) {
  const sent = [];
  return requestDriverCode(db, login, { send: async (message) => { sent.push(message); }, now }).then((result) => ({ result, sent }));
}
const codeIn = (message) => message.text.match(/\b(\d{6})\b/)[1];

test("a driver signs in with an emailed code typed against their email or mobile", async (t) => {
  const db = database(t);
  const now = new Date("2099-03-01T10:00:00Z");

  assert.equal(driverEmailFor(db, "RAVI@example.test"), "ravi@example.test");
  assert.equal(driverEmailFor(db, "98765 43210"), "ravi@example.test", "the mobile finds the roster email");
  assert.equal(driverEmailFor(db, "stranger@example.test"), null);

  const { result, sent } = await signIn(db, "98765 43210", now);
  assert.equal(result.sent, true);
  assert.equal(sent[0].to, "ravi@example.test");
  assert.doesNotMatch(sent[0].logText, /\d{6}/, "the delivery log never keeps the code");
  const stored = db.prepare("SELECT code_hash FROM driver_login_codes").get();
  assert.notEqual(stored.code_hash, codeIn(sent[0]), "only a hash is stored");

  const token = verifyDriverCode(db, "ravi@example.test", codeIn(sent[0]), now);
  assert.equal(authenticateDriverAccount(token), "ravi@example.test");
  assert.throws(() => verifyDriverCode(db, "ravi@example.test", codeIn(sent[0]), now), { status: 401 }, "a code works once");

  // Nothing is sent for an unknown login, and the route answers the same either way.
  assert.equal((await signIn(db, "stranger@example.test", now)).result.sent, false);
});

test("wrong, expired and repeated codes are refused", async (t) => {
  const db = database(t);
  const now = new Date("2099-03-01T10:00:00Z");
  const { sent } = await signIn(db, "ravi@example.test", now);
  const right = codeIn(sent[0]);
  const wrong = right === "000000" ? "111111" : "000000";

  assert.throws(() => verifyDriverCode(db, "ravi@example.test", right, new Date(now.getTime() + 11 * 60000)), { code: "CODE_EXPIRED" });
  for (let i = 0; i < 5; i += 1) assert.throws(() => verifyDriverCode(db, "ravi@example.test", wrong, now), { code: "WRONG_CODE" });
  assert.throws(() => verifyDriverCode(db, "ravi@example.test", right, now), { code: "TOO_MANY_ATTEMPTS" }, "five wrong tries lock the code");

  for (let i = 0; i < 4; i += 1) await signIn(db, "ravi@example.test", now);
  assert.equal((await signIn(db, "ravi@example.test", now)).result.sent, false, "at most five codes an hour");
  assert.throws(() => authenticateDriverAccount("not-a-token"), { status: 401 });
});

test("the trip list holds every supplier's trips for this driver, and only theirs", (t) => {
  const db = database(t);
  const waiting = assignTrip(db, "bk_wait", "sup_a", "drv_a");
  const accepted = assignTrip(db, "bk_next", "sup_b", "drv_b", { activity_date: "2099-03-12" });
  db.prepare("UPDATE driver_assignments SET acknowledgement = 'ACCEPTED' WHERE id = ?").run(accepted.id);
  const done = assignTrip(db, "bk_done", "sup_a", "drv_a", { activity_date: "2099-02-01" });
  db.prepare("UPDATE driver_assignments SET acknowledgement = 'ACCEPTED', assignment_status = 'COMPLETED' WHERE id = ?").run(done.id);
  assignTrip(db, "bk_other", "sup_a", "drv_x");

  const now = new Date(Date.parse(waiting.response_deadline) - 60000);
  const trips = driverTrips(db, "ravi@example.test", now);
  assert.deepEqual(trips.waiting.map((trip) => trip.bookingRef), ["IH-bk_wait"]);
  assert.deepEqual(trips.upcoming.map((trip) => [trip.bookingRef, trip.supplierName]), [["IH-bk_next", "Coast Rides"]]);
  assert.deepEqual(trips.past.map((trip) => trip.bookingRef), ["IH-bk_done"]);
  assert.equal(trips.past[0].travelerName, "Asha");
  assert.equal(JSON.stringify(trips).includes("+919111111111"), false, "the list never carries the traveler's phone");

  // A request past its deadline leaves the list.
  assert.equal(driverTrips(db, "ravi@example.test", new Date(Date.parse(waiting.response_deadline) + 1000)).waiting.length, 0);

  // Open trips give their link token; another driver's trip and a completed one don't.
  assert.match(driverTripLink(db, "ravi@example.test", waiting.id, now), new RegExp(`^${waiting.id}\\.[a-f0-9]{64}$`));
  assert.throws(() => driverTripLink(db, "other@example.test", waiting.id, now), { status: 404 });
  assert.throws(() => driverTripLink(db, "ravi@example.test", done.id, now), { status: 409 });
});
