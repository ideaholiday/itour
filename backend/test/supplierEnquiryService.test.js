import test from "node:test";
import assert from "node:assert/strict";
import { addEnquiryMessage, closeEnquiry, createEnquiry, enquiryThread, listEnquiries } from "../src/services/supplierEnquiryService.js";
import { backfillSupplierSlugs } from "../src/services/supplierProfileService.js";
import { addSupplier, addUser, supplierProfileDatabase } from "./fixtures/supplierProfileDatabase.js";

const TODAY = new Date("2026-09-13T10:00:00.000Z");

function setup() {
  const db = supplierProfileDatabase();
  addSupplier(db);
  // Startup gives every supplier a profile link.
  backfillSupplierSlugs(db);
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = 'sup_awadh'").get();
  const traveler = addUser(db);
  const supplierActor = { id: "user_owner", role: "SUPPLIER", supplier_id: supplier.id, email: supplier.email, name: "Rakesh" };
  return { db, supplier, traveler, supplierActor };
}

test("a traveler's enquiry reaches the supplier, who replies on the platform", () => {
  const { db, supplier, traveler, supplierActor } = setup();

  const { enquiry, reused } = createEnquiry(db, {
    supplier, actor: traveler, message: "Do you have an Innova for 6 people to Ayodhya?", travelDate: "2026-10-02", travelers: 6, today: TODAY,
  });
  assert.equal(reused, false);
  assert.match(enquiry.ref, /^ENQ-[A-Z2-9]{8}$/);
  assert.equal(enquiry.status, "OPEN");
  assert.equal(enquiry.travelers, 6);
  assert.equal(enquiry.supplierPath, "/suppliers/awadh-express-cabs");

  const notification = db.prepare("SELECT * FROM supplier_notifications WHERE supplier_id = ?").get(supplier.id);
  assert.equal(notification.type, "ENQUIRY");
  assert.match(notification.action_url, new RegExp(enquiry.ref));

  const [inboxItem] = listEnquiries(db, supplierActor);
  assert.equal(inboxItem.travelerName, "Amit", "the supplier sees a first name only");
  assert.equal(JSON.stringify(inboxItem).includes(traveler.email), false);
  assert.match(inboxItem.lastMessage, /Innova/);

  const replied = addEnquiryMessage(db, enquiry.ref, supplierActor, "Yes, an Innova Crysta is free that day.");
  assert.equal(replied.status, "REPLIED");
  assert.deepEqual(replied.messages.map((m) => m.authorRole), ["TRAVELER", "SUPPLIER"]);
  assert.equal(listEnquiries(db, traveler, { status: "REPLIED" }).length, 1);

  // A second enquiry from the same traveler continues the open thread.
  const again = createEnquiry(db, { supplier, actor: traveler, message: "Great, what would it cost roughly?", today: TODAY });
  assert.equal(again.reused, true);
  assert.equal(again.enquiry.ref, enquiry.ref);
  assert.equal(again.enquiry.status, "OPEN");
  assert.equal(again.enquiry.travelDate, "2026-10-02", "details sent earlier are kept");

  closeEnquiry(db, enquiry.ref, traveler);
  assert.throws(() => addEnquiryMessage(db, enquiry.ref, supplierActor, "Are you still interested in this?"), (error) => error.status === 409);
  assert.equal(createEnquiry(db, { supplier, actor: traveler, message: "Starting a new trip question now", today: TODAY }).reused, false);
  db.close();
});

test("contact details, bad input and the wrong people are refused", () => {
  const { db, supplier, traveler, supplierActor } = setup();
  const send = (overrides) => createEnquiry(db, { supplier, actor: traveler, message: "Is a sunrise pickup possible?", today: TODAY, ...overrides });

  assert.throws(() => send({ message: "Call me on 98765 43210 please" }), /Keep the conversation on Idea Holiday/);
  assert.throws(() => send({ message: "short" }), /at least 10/);
  assert.throws(() => send({ travelDate: "2026-09-01" }), /past/);
  assert.throws(() => send({ travelDate: "02/10/2026" }), /YYYY-MM-DD/);
  assert.throws(() => send({ travelers: 0 }), /between 1 and 100/);
  assert.throws(() => send({ actor: null }), (error) => error.status === 401);
  assert.throws(() => send({ actor: supplierActor }), (error) => error.status === 403, "a supplier can't enquire with themselves");
  assert.throws(() => send({ actor: { id: "user_x", role: "TRAVELER", email: supplier.email } }), (error) => error.status === 403, "nor through a traveler account on the same email");
  assert.throws(() => send({ supplier: { ...supplier, profile_status: "HIDDEN" } }), (error) => error.status === 404);

  const { enquiry } = send();
  const stranger = addUser(db, { id: "user_other", email: "other@example.com" });
  const otherSupplier = { id: "user_2", role: "SUPPLIER", supplier_id: "sup_other" };
  assert.throws(() => enquiryThread(db, enquiry.ref, stranger), (error) => error.status === 404);
  assert.throws(() => enquiryThread(db, enquiry.ref, otherSupplier), (error) => error.status === 404);
  assert.throws(() => addEnquiryMessage(db, enquiry.ref, supplierActor, "Mail me: owner@awadh.example"), /Keep the conversation/);
  assert.equal(listEnquiries(db, stranger).length, 0);
  assert.equal(listEnquiries(db, otherSupplier).length, 0);
  assert.equal(enquiryThread(db, enquiry.ref.toLowerCase(), { id: "staff", role: "STAFF" }).ref, enquiry.ref, "staff can read any thread");
  assert.throws(() => addEnquiryMessage(db, enquiry.ref, { id: "staff", role: "STAFF" }, "Staff should not post here"), (error) => error.status === 404);
  assert.throws(() => listEnquiries(db, traveler, { status: "LOST" }), /Status must be/);
  db.close();
});
