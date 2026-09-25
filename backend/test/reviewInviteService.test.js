import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  claimShareLink, consumeInvite, createShareLink, inviteStats, issueBookingInvite,
  listShareLinks, resolveInvite, resolveShareLink, setShareLinkActive,
} from "../src/services/reviewInviteService.js";
import { translateSqliteSql } from "../src/postgresSyncDb.js";

function inviteDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, supplier_id TEXT, title TEXT, hero_image TEXT, category TEXT DEFAULT 'TOURS', rating REAL, review_count INTEGER DEFAULT 0, status TEXT DEFAULT 'PUBLISHED');
    CREATE TABLE suppliers (id TEXT PRIMARY KEY, company_name TEXT, rating REAL);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, ref TEXT, user_id TEXT, product_id TEXT, supplier_id TEXT,
      traveler_name TEXT, traveler_phone TEXT, traveler_email TEXT, activity_date TEXT, status TEXT);
    CREATE TABLE driver_assignments (id TEXT PRIMARY KEY, booking_id TEXT, supplier_driver_id TEXT, driver_name TEXT, assignment_status TEXT);
    CREATE TABLE reviews (id TEXT PRIMARY KEY, booking_id TEXT UNIQUE, product_id TEXT, supplier_id TEXT);
    CREATE TABLE review_share_links (id TEXT PRIMARY KEY, supplier_id TEXT, product_id TEXT, slug TEXT UNIQUE,
      label TEXT, is_active INTEGER NOT NULL DEFAULT 1, view_count INTEGER NOT NULL DEFAULT 0,
      claim_count INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE review_invites (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE, booking_id TEXT, product_id TEXT,
      supplier_id TEXT, channel TEXT, share_link_id TEXT, created_by TEXT, expires_at TEXT, opened_at TEXT,
      used_at TEXT, review_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));

    INSERT INTO suppliers (id, company_name) VALUES ('supplier_1', 'Awadh Express Cabs');
    INSERT INTO suppliers (id, company_name) VALUES ('supplier_2', 'Other Operator');
    INSERT INTO products (id, supplier_id, title) VALUES ('product_1', 'supplier_1', 'Lucknow Heritage Day Tour');
    INSERT INTO products (id, supplier_id, title) VALUES ('product_2', 'supplier_2', 'Someone Else Tour');
    INSERT INTO bookings VALUES ('booking_1', 'IH-9A82B1', 'user_1', 'product_1', 'supplier_1', 'Amit Kumar', '+919876500123', 'amit@example.com', '2026-08-15', 'completed');
    INSERT INTO bookings VALUES ('booking_2', 'IH-77C31D', 'user_2', 'product_1', 'supplier_1', 'Sneha Kapoor', '+919920334455', 'sneha@example.com', '2026-09-01', 'confirmed');
  `);
  return database;
}

test("an invite token opens exactly one booking, once", () => {
  const database = inviteDatabase();
  const issued = issueBookingInvite(database, { bookingId: "booking_1", channel: "EMAIL" });
  assert.ok(issued.token);
  assert.match(issued.url, /\/review\//);

  const { booking, invite } = resolveInvite(database, issued.token);
  assert.equal(booking.ref, "IH-9A82B1");
  assert.equal(booking.product_title, "Lucknow Heritage Day Tour");
  assert.ok(database.prepare("SELECT opened_at FROM review_invites WHERE id = ?").get(invite.id).opened_at, "opening is recorded");

  // The plaintext token is never stored, so the row cannot be replayed.
  assert.equal(database.prepare("SELECT COUNT(*) c FROM review_invites WHERE token_hash = ?").get(issued.token).c, 0);

  consumeInvite(database, invite.id, "rev_1");
  assert.throws(() => resolveInvite(database, issued.token), /already been used/);
  assert.throws(() => resolveInvite(database, "not-a-real-token"), /not valid/);
  database.close();
});

test("issuing an invite uses SQL the production Postgres adapter can run", () => {
  const database = inviteDatabase();
  const statements = [];
  const recording = { prepare: (sql) => { statements.push(translateSqliteSql(sql)); return database.prepare(sql); } };
  const issued = issueBookingInvite(recording, { bookingId: "booking_1" });
  assert.ok(issued.token);
  for (const sql of statements) {
    assert.doesNotMatch(sql, /CAST\('now'/i, sql);
    assert.doesNotMatch(sql, /expires_at\s*[<>]=?\s*CURRENT_TIMESTAMP/i, sql);
  }
  // Still a SQLite-style text timestamp about 30 days out, which resolveInvite parses.
  const { expires_at: expiresAt } = database.prepare("SELECT expires_at FROM review_invites").get();
  assert.match(expiresAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const days = (new Date(`${expiresAt.replace(" ", "T")}Z`) - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days <= 30, `expires in ${days} days`);
  assert.equal(issueBookingInvite(recording, { bookingId: "booking_1" }).reused, true, "a live invite is found again");
  database.close();
});

test("an expired invite is refused", () => {
  const database = inviteDatabase();
  const issued = issueBookingInvite(database, { bookingId: "booking_1" });
  database.prepare("UPDATE review_invites SET expires_at = datetime('now', '-1 day')").run();
  assert.throws(() => resolveInvite(database, issued.token), /expired/);
  database.close();
});

test("invites are only issued for a completed booking that has no review", () => {
  const database = inviteDatabase();
  assert.throws(() => issueBookingInvite(database, { bookingId: "booking_2" }), /completed/);
  assert.throws(() => issueBookingInvite(database, { bookingId: "nope" }), /not found/);

  // A resend reuses the live invite rather than minting a second working link.
  const first = issueBookingInvite(database, { bookingId: "booking_1" });
  const second = issueBookingInvite(database, { bookingId: "booking_1" });
  assert.equal(second.reused, true);
  assert.equal(second.token, null);
  assert.equal(database.prepare("SELECT COUNT(*) c FROM review_invites").get().c, 1);

  database.prepare("INSERT INTO reviews (id, booking_id, product_id, supplier_id) VALUES ('rev_1', 'booking_1', 'product_1', 'supplier_1')").run();
  assert.throws(() => issueBookingInvite(database, { bookingId: "booking_1" }), /already has a review/);
  assert.throws(() => resolveInvite(database, first.token), /already has a review/);
  database.close();
});

test("a share link is claimed with a booking reference and the phone's last four digits", () => {
  const database = inviteDatabase();
  const link = createShareLink(database, { supplierId: "supplier_1", label: "Vehicle QR" });
  assert.match(link.url, /\/r\//);

  const publicView = resolveShareLink(database, link.slug);
  assert.equal(publicView.supplierName, "Awadh Express Cabs");
  assert.equal(publicView.productTitle, null, "an all-products link names no listing");
  assert.equal(database.prepare("SELECT view_count FROM review_share_links WHERE id = ?").get(link.id).view_count, 1);

  const claim = claimShareLink(database, { slug: link.slug, bookingRef: "IH-9A82B1", phoneLast4: "0123" });
  assert.ok(claim.token);
  const resolved = resolveInvite(database, claim.token);
  assert.equal(resolved.booking.id, "booking_1");
  assert.equal(resolved.invite.share_link_id, link.id);
  assert.equal(database.prepare("SELECT claim_count FROM review_share_links WHERE id = ?").get(link.id).claim_count, 1);
  database.close();
});

test("a claim reveals nothing about bookings it does not match", () => {
  const database = inviteDatabase();
  const link = createShareLink(database, { supplierId: "supplier_1" });
  const wrongPhone = /could not match that booking reference/;

  // Same generic answer whether the reference is unknown, belongs to another
  // supplier, or the phone digits are wrong — no oracle for guessing.
  assert.throws(() => claimShareLink(database, { slug: link.slug, bookingRef: "IH-000000", phoneLast4: "0123" }), wrongPhone);
  assert.throws(() => claimShareLink(database, { slug: link.slug, bookingRef: "IH-9A82B1", phoneLast4: "9999" }), wrongPhone);

  const otherSupplierLink = createShareLink(database, { supplierId: "supplier_2" });
  assert.throws(() => claimShareLink(database, { slug: otherSupplierLink.slug, bookingRef: "IH-9A82B1", phoneLast4: "0123" }), wrongPhone);

  // A booking that is not finished says so plainly — it is the traveler's own.
  assert.throws(() => claimShareLink(database, { slug: link.slug, bookingRef: "IH-77C31D", phoneLast4: "4455" }), /once it is completed/);
  database.close();
});

test("a product-scoped link only accepts bookings for that listing", () => {
  const database = inviteDatabase();
  database.prepare("INSERT INTO products (id, supplier_id, title) VALUES ('product_3', 'supplier_1', 'Another Listing')").run();
  const link = createShareLink(database, { supplierId: "supplier_1", productId: "product_3" });
  assert.throws(() => claimShareLink(database, { slug: link.slug, bookingRef: "IH-9A82B1", phoneLast4: "0123" }), /could not match/);

  assert.throws(() => createShareLink(database, { supplierId: "supplier_1", productId: "product_2" }), /another supplier/);
  database.close();
});

test("a deactivated link stops answering, and stats follow the funnel", () => {
  const database = inviteDatabase();
  const link = createShareLink(database, { supplierId: "supplier_1" });
  claimShareLink(database, { slug: link.slug, bookingRef: "IH-9A82B1", phoneLast4: "0123" });

  const beforeSubmit = inviteStats(database, "supplier_1");
  assert.equal(beforeSubmit.issued, 1);
  assert.equal(beforeSubmit.submitted, 0);

  const invite = database.prepare("SELECT id FROM review_invites").get();
  consumeInvite(database, invite.id, "rev_1");
  const afterSubmit = inviteStats(database, "supplier_1");
  assert.equal(afterSubmit.submitted, 1);
  assert.equal(afterSubmit.conversionPct, 100);
  assert.equal(listShareLinks(database, "supplier_1")[0].reviews_submitted, 1);

  setShareLinkActive(database, { id: link.id, supplierId: "supplier_1", isActive: false });
  assert.throws(() => resolveShareLink(database, link.slug), /no longer active/);
  assert.throws(() => setShareLinkActive(database, { id: link.id, supplierId: "supplier_2", isActive: true }), /another supplier/);
  database.close();
});

test("claiming a link when an emailed invite is already outstanding retires the old link", () => {
  const database = inviteDatabase();
  const emailed = issueBookingInvite(database, { bookingId: "booking_1", channel: "EMAIL" });
  const link = createShareLink(database, { supplierId: "supplier_1" });

  // The traveler is standing at the QR code; the emailed token's plaintext is
  // gone, so the claim mints a fresh one and the old link stops working.
  const claim = claimShareLink(database, { slug: link.slug, bookingRef: "IH-9A82B1", phoneLast4: "0123" });
  assert.ok(claim.token);
  assert.notEqual(claim.token, emailed.token);
  assert.throws(() => resolveInvite(database, emailed.token), /already been used/);

  const resolved = resolveInvite(database, claim.token);
  assert.equal(resolved.booking.id, "booking_1");
  assert.equal(resolved.invite.share_link_id, link.id);

  // Still exactly one review possible for the booking.
  consumeInvite(database, resolved.invite.id, "rev_1");
  database.prepare("INSERT INTO reviews (id, booking_id, product_id, supplier_id) VALUES ('rev_1', 'booking_1', 'product_1', 'supplier_1')").run();
  assert.throws(() => claimShareLink(database, { slug: link.slug, bookingRef: "IH-9A82B1", phoneLast4: "0123" }), /already has a review/);
  database.close();
});
