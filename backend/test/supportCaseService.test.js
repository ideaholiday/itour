import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  addSupportEvidence,
  addSupportMessage,
  createSupportCase,
  supportCase,
  updateSupportCase,
} from "../src/services/supportCaseService.js";

function supportDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT);
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, company_name TEXT);
    CREATE TABLE products (id TEXT PRIMARY KEY, title TEXT, cancellation_policy TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, supplier_id TEXT, product_id TEXT, traveler_name TEXT, traveler_email TEXT, traveler_phone TEXT, activity_date TEXT, pickup_time TEXT, pickup_location TEXT, amount_inr REAL, payment_status TEXT, status TEXT, razorpay_payment_id TEXT);
    CREATE TABLE refunds (id TEXT PRIMARY KEY);
    CREATE TABLE support_cases (id TEXT PRIMARY KEY, case_ref TEXT UNIQUE, booking_id TEXT, supplier_id TEXT, opened_by_user_id TEXT, case_type TEXT, category TEXT, subject TEXT, description TEXT, priority TEXT, status TEXT, requested_refund_percentage INTEGER, policy_refund_percentage INTEGER, policy_refund_amount REAL, approved_refund_percentage INTEGER, refund_id TEXT, assigned_to TEXT, resolution TEXT, first_response_due_at TEXT, resolution_due_at TEXT, first_responded_at TEXT, resolved_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE support_case_messages (id TEXT PRIMARY KEY, case_id TEXT, author_id TEXT, author_role TEXT, author_name TEXT, message TEXT, is_internal INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE support_case_evidence (id TEXT PRIMARY KEY, case_id TEXT, submitted_by TEXT, submitted_role TEXT, evidence_url TEXT, display_name TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE support_case_events (id TEXT PRIMARY KEY, case_id TEXT, actor_id TEXT, actor_role TEXT, event_type TEXT, previous_status TEXT, next_status TEXT, note TEXT, metadata TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE staff_tasks (id TEXT PRIMARY KEY, task_type TEXT, booking_id TEXT, assigned_staff_name TEXT, priority TEXT, status TEXT, notes TEXT);
    INSERT INTO users VALUES ('guest_1', 'Goa Guest', 'guest@example.com');
    INSERT INTO suppliers VALUES ('supplier_1', 'Goa Tours');
    INSERT INTO products VALUES ('product_1', 'Goa private tour', 'FLEXIBLE_24H');
    INSERT INTO bookings VALUES ('booking_1', 'IH-GOA-1', 'guest_1', 'supplier_1', 'product_1', 'Goa Guest', 'guest@example.com', '9876500001', '2099-08-28', '09:00', 'Calangute', 10000, 'PAID', 'confirmed', 'pay_demo_test');
  `);
  return database;
}

test("cancellation requests create a policy-backed case, timeline and support task", () => {
  const database = supportDatabase();
  const booking = database.prepare("SELECT b.*, p.cancellation_policy FROM bookings b JOIN products p ON p.id = b.product_id").get();
  const item = createSupportCase(database, {
    booking,
    actor: { id: "guest_1", role: "TRAVELER", name: "Goa Guest" },
    caseType: "CANCELLATION",
    category: "CHANGE_OF_PLANS",
    subject: "Please cancel my Goa tour",
    description: "My flight was cancelled and I cannot reach Goa.",
  });
  assert.match(item.case_ref, /^SUP-/);
  assert.equal(item.status, "OPEN");
  assert.equal(item.policy_refund_percentage, 100);
  assert.equal(item.messages.length, 1);
  assert.equal(item.events[0].event_type, "CASE_OPENED");
  assert.equal(database.prepare("SELECT task_type FROM staff_tasks").get().task_type, "SUPPORT_CASE");
  assert.throws(() => createSupportCase(database, { booking, actor: { id: "guest_1", role: "TRAVELER" }, caseType: "CANCELLATION", description: "Another cancellation request" }), /already exists/);
  database.close();
});

test("case conversations protect internal notes and evidence URLs", () => {
  const database = supportDatabase();
  const booking = database.prepare("SELECT b.*, p.cancellation_policy FROM bookings b JOIN products p ON p.id = b.product_id").get();
  const created = createSupportCase(database, { booking, actor: { id: "guest_1", role: "TRAVELER" }, caseType: "COMPLAINT", category: "SERVICE_QUALITY", description: "The supplied itinerary did not match the listing." });
  const item = supportCase(database, created.id);
  assert.throws(() => addSupportMessage(database, item, { actor: { id: "guest_1", role: "TRAVELER" }, message: "private", isInternal: true }), /Only operations/);
  const withNote = addSupportMessage(database, item, { actor: { id: "staff_1", role: "STAFF", name: "Support" }, message: "Contacting the supplier for evidence.", isInternal: true });
  assert.equal(withNote.messages.at(-1).is_internal, 1);
  assert.throws(() => addSupportEvidence(database, item, { actor: { id: "guest_1", role: "TRAVELER" }, evidenceUrl: "javascript:alert(1)" }), /HTTP or HTTPS/);
  const withEvidence = addSupportEvidence(database, item, { actor: { id: "guest_1", role: "TRAVELER" }, evidenceUrl: "https://example.com/evidence.jpg", displayName: "Photo" });
  assert.equal(withEvidence.evidence[0].display_name, "Photo");
  database.close();
});

test("operations status changes are recorded in the immutable case timeline", () => {
  const database = supportDatabase();
  const booking = database.prepare("SELECT b.*, p.cancellation_policy FROM bookings b JOIN products p ON p.id = b.product_id").get();
  const created = createSupportCase(database, { booking, actor: { id: "guest_1", role: "TRAVELER" }, caseType: "SAFETY", category: "DRIVER_SAFETY", description: "The driver was using the phone while driving." });
  const updated = updateSupportCase(database, supportCase(database, created.id), { actor: { id: "staff_1", role: "STAFF" }, status: "UNDER_REVIEW", priority: "URGENT", assignedTo: "Safety Team", resolution: "Immediate safety review started" });
  assert.equal(updated.status, "UNDER_REVIEW");
  assert.equal(updated.assigned_to, "Safety Team");
  assert.equal(updated.events.at(-1).event_type, "STATUS_CHANGED");
  database.close();
});
