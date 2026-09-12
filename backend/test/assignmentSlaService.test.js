import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { respondToSupplierAssignment, supplierAcceptanceDeadline, processExpiredSupplierAssignments } from "../src/services/assignmentSlaService.js";

function acceptanceDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, ref TEXT, supplier_id TEXT, payment_status TEXT,
      supplier_response_status TEXT, supplier_response_deadline TEXT,
      supplier_assignment_status TEXT, supplier_responded_at TEXT,
      supplier_response_note TEXT, assignment_round INTEGER
    );
    CREATE TABLE supplier_assignment_attempts (
      booking_id TEXT, assignment_round INTEGER, decision TEXT,
      response_status TEXT, response_at TEXT, response_note TEXT
    );
  `);
  db.prepare("INSERT INTO bookings VALUES (?, ?, ?, 'PAID', 'PENDING', ?, 'AWAITING_ACCEPTANCE', NULL, NULL, 1)")
    .run("bk_sla", "IH-SLA", "supplier_one", "2030-01-01T00:10:00.000Z");
  db.prepare("INSERT INTO supplier_assignment_attempts VALUES ('bk_sla', 1, 'SELECTED', 'PENDING', NULL, NULL)").run();
  return db;
}

test("supplier acceptance deadline defaults to ten minutes", () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  assert.equal(supplierAcceptanceDeadline(now), "2030-01-01T00:10:00.000Z");
});

test("supplier can accept a paid assignment before its deadline", () => {
  const db = acceptanceDb();
  const result = respondToSupplierAssignment(db, {
    bookingId: "bk_sla",
    supplierId: "supplier_one",
    action: "ACCEPT",
    now: new Date("2030-01-01T00:05:00.000Z"),
  });
  assert.equal(result.status, "SUPPLIER_ACCEPTED");
  assert.equal(db.prepare("SELECT supplier_response_status FROM bookings WHERE id = 'bk_sla'").get().supplier_response_status, "ACCEPTED");
  assert.equal(db.prepare("SELECT response_status FROM supplier_assignment_attempts").get().response_status, "ACCEPTED");
});

test("supplier rejection requires an operational reason", () => {
  const db = acceptanceDb();
  assert.throws(() => respondToSupplierAssignment(db, {
    bookingId: "bk_sla",
    supplierId: "supplier_one",
    action: "REJECT",
    note: "no",
    now: new Date("2030-01-01T00:05:00.000Z"),
  }), /short reason/i);
});

// --- Guard clauses on the supplier response endpoint ---
// This endpoint is reachable by any authenticated supplier, so each gate below
// is what stops one supplier acting on another's booking, or responding at a
// point in the lifecycle where a response is meaningless.

test("a supplier response is rejected when the booking does not exist", () => {
  const db = acceptanceDb();
  assert.throws(
    () => respondToSupplierAssignment(db, { bookingId: "bk_missing", supplierId: "supplier_one", action: "ACCEPT" }),
    (error) => error.status === 404 && /Booking not found/.test(error.message)
  );
});

test("a supplier cannot respond to another supplier's assignment", () => {
  const db = acceptanceDb();
  assert.throws(
    () => respondToSupplierAssignment(db, {
      bookingId: "bk_sla", supplierId: "supplier_two", action: "ACCEPT",
      now: new Date("2030-01-01T00:05:00.000Z"),
    }),
    (error) => error.status === 403 && /belongs to another supplier/.test(error.message)
  );
  assert.equal(
    db.prepare("SELECT supplier_response_status FROM bookings WHERE id = 'bk_sla'").get().supplier_response_status,
    "PENDING",
    "a forbidden attempt must not move the booking"
  );
});

test("a supplier response is refused before payment clears", () => {
  const db = acceptanceDb();
  db.prepare("UPDATE bookings SET payment_status = 'pending_payment' WHERE id = 'bk_sla'").run();
  assert.throws(
    () => respondToSupplierAssignment(db, {
      bookingId: "bk_sla", supplierId: "supplier_one", action: "ACCEPT",
      now: new Date("2030-01-01T00:05:00.000Z"),
    }),
    (error) => error.status === 409 && /starts only after payment/.test(error.message)
  );
});

test("an assignment cannot be answered twice", () => {
  const db = acceptanceDb();
  const now = new Date("2030-01-01T00:05:00.000Z");
  respondToSupplierAssignment(db, { bookingId: "bk_sla", supplierId: "supplier_one", action: "ACCEPT", now });

  assert.throws(
    () => respondToSupplierAssignment(db, { bookingId: "bk_sla", supplierId: "supplier_one", action: "ACCEPT", now }),
    (error) => error.status === 409 && /already accepted/.test(error.message),
    "the second response must report the state, not silently re-accept"
  );
});

test("only ACCEPT or REJECT are valid supplier actions", () => {
  const db = acceptanceDb();
  const now = new Date("2030-01-01T00:05:00.000Z");
  for (const action of [undefined, "", "MAYBE", "accepted", "  "]) {
    assert.throws(
      () => respondToSupplierAssignment(db, { bookingId: "bk_sla", supplierId: "supplier_one", action, now }),
      (error) => error.status === 400 && /Choose ACCEPT or REJECT/.test(error.message),
      `action ${JSON.stringify(action)} must be refused`
    );
  }
  // Case and surrounding whitespace are tolerated for a real action.
  const result = respondToSupplierAssignment(db, { bookingId: "bk_sla", supplierId: "supplier_one", action: " accept ", now });
  assert.equal(result.status, "SUPPLIER_ACCEPTED");
});

test("a supplier assignment can be answered by booking reference as well as id", () => {
  const db = acceptanceDb();
  const result = respondToSupplierAssignment(db, {
    bookingId: "IH-SLA", supplierId: "supplier_one", action: "ACCEPT",
    now: new Date("2030-01-01T00:05:00.000Z"),
  });
  assert.equal(result.bookingId, "bk_sla", "a human-facing reference resolves to the same booking");
  assert.equal(result.bookingRef, "IH-SLA");
});

test("the expiry sweeper ignores bookings awaiting reschedule reconfirmation", () => {
  const db = acceptanceDb();
  const past = "2030-01-01T00:00:00.000Z";
  db.prepare("UPDATE bookings SET supplier_response_deadline = ?, supplier_assignment_status = 'RESCHEDULED_RECONFIRMATION_REQUIRED' WHERE id = 'bk_sla'").run(past);

  const swept = processExpiredSupplierAssignments(db, { now: new Date("2030-01-02T00:00:00.000Z") });
  assert.equal(swept.checked, 0, "a reschedule reconfirmation is owned by operations, not the SLA timer");
  assert.equal(
    db.prepare("SELECT supplier_response_status FROM bookings WHERE id = 'bk_sla'").get().supplier_response_status,
    "PENDING"
  );
});

test("the expiry sweeper leaves assignments still inside their window alone", () => {
  const db = acceptanceDb();
  const swept = processExpiredSupplierAssignments(db, { now: new Date("2030-01-01T00:05:00.000Z") });
  assert.equal(swept.checked, 0);
  assert.equal(swept.reassigned, 0);
  assert.equal(swept.manualReview, 0);
  assert.deepEqual(swept.results, []);
});
