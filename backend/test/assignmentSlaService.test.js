import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { respondToSupplierAssignment, supplierAcceptanceDeadline } from "../src/services/assignmentSlaService.js";

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
