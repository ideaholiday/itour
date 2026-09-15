import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { executeMigrationSql } from "../src/services/migrationRunner.js";
import { addSupplier, addUser, supplierProfileDatabase } from "./fixtures/supplierProfileDatabase.js";
import {
  recordShareVisit, renderReviewWidget, renderSharePrintSheet, shareQrForSlug, supplierShareKit, trackedShareUrl,
} from "../src/services/supplierShareKitService.js";
import { renderGuestDocument } from "../src/services/guestDocumentService.js";

const upSql = (name) => fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").split("-- @down")[0];

function database() {
  const db = supplierProfileDatabase();
  executeMigrationSql(db, upSql("028_review_invites_and_share_links.sql"));
  executeMigrationSql(db, upSql("044_supplier_share_kit.sql"));
  const supplier = addSupplier(db, { public_slug: "awadh-express-cabs" });
  addUser(db);
  return { db, supplier };
}

const scans = (db) => db.prepare("SELECT target, channel, share_link_id IS NOT NULL AS has_link FROM supplier_share_scans ORDER BY rowid").all()
  .map((row) => [row.target, row.channel, Boolean(row.has_link)]);

test("the share kit gives a supplier tracked links, QR and print URLs, and an embed code", () => {
  const { db, supplier } = database();
  const previous = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://ideaholiday.in";
  try {
    const kit = supplierShareKit(db, supplier.id, { actorId: "user_amit" });
    assert.equal(kit.profileUrl, "https://ideaholiday.in/suppliers/awadh-express-cabs");
    assert.match(kit.reviewLinkUrl, /^https:\/\/ideaholiday\.in\/r\/awadh-express-/, "a review link is made on first use");
    assert.equal(kit.links.review.tracked, "https://ideaholiday.in/go/s/awadh-express-cabs?t=review&c=link");
    assert.equal(kit.links.profile.qrSvg, "/api/share/s/awadh-express-cabs/qr.svg?t=profile&c=qr");
    assert.match(kit.embedCode, /<iframe src="https:\/\/ideaholiday\.in\/api\/share\/s\/awadh-express-cabs\/widget"/);
    assert.equal(supplierShareKit(db, supplier.id).reviewLinkUrl, kit.reviewLinkUrl, "the same link next time");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM review_share_links").get().n, 1);
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = previous;
  }
});

test("a visit through /go/s is counted by target and channel and redirected", () => {
  const { db, supplier } = database();
  assert.match(recordShareVisit(db, "awadh-express-cabs", { target: "review", channel: "standee" }), /\/suppliers\/awadh-express-cabs$/, "no review link yet: the profile");
  supplierShareKit(db, supplier.id);
  assert.match(recordShareVisit(db, "awadh-express-cabs", { target: "review", channel: "voucher" }), /\/r\/awadh-express-/);
  recordShareVisit(db, "awadh-express-cabs", { target: "nonsense", channel: "carrier-pigeon" });
  assert.deepEqual(scans(db), [["PROFILE", "STANDEE", false], ["REVIEW", "VOUCHER", true], ["PROFILE", "LINK", false]]);
  assert.deepEqual(supplierShareKit(db, supplier.id).scans.map((row) => [row.target, row.channel, row.total, row.last30Days]),
    [["PROFILE", "LINK", 1, 1], ["PROFILE", "STANDEE", 1, 1], ["REVIEW", "VOUCHER", 1, 1]]);

  db.prepare("UPDATE suppliers SET profile_status = 'HIDDEN' WHERE id = ?").run(supplier.id);
  assert.equal(recordShareVisit(db, "awadh-express-cabs", { target: "profile" }), null, "a hidden profile is not reachable");
  assert.equal(recordShareVisit(db, "no-such-supplier", {}), null);
});

test("QR codes, print sheets and the widget show only public information", async () => {
  const { db, supplier } = database();
  const svg = await shareQrForSlug(db, "awadh-express-cabs", { target: "profile", format: "svg" });
  assert.match(svg, /^<svg/);
  const png = await shareQrForSlug(db, "awadh-express-cabs", { target: "review", format: "png" });
  assert.deepEqual([...png.subarray(1, 4)].map((byte) => String.fromCharCode(byte)).join(""), "PNG");
  await assert.rejects(shareQrForSlug(db, "no-such-supplier", {}), (e) => e.status === 404);

  const standee = renderSharePrintSheet(db, "awadh-express-cabs", { format: "standee", target: "review" });
  assert.match(standee, /size:A5 portrait/);
  assert.match(standee, /Leave us a review/);
  assert.match(renderSharePrintSheet(db, "awadh-express-cabs", { format: "sticker" }), /size:3in 3in/);

  db.prepare(`INSERT INTO reviews (id, user_id, product_id, supplier_id, experience_rating, supplier_rating, title, comment, status, source)
    VALUES ('rev_1', 'user_amit', 'prd_x', ?, 5, 5, 'Great driver', 'On time <b>and</b> friendly', 'PUBLISHED', 'VERIFIED')`).run(supplier.id);
  const widget = renderReviewWidget(db, "awadh-express-cabs");
  assert.match(widget, /5 from 1 verified review/);
  assert.match(widget, /On time &lt;b&gt;and&lt;\/b&gt; friendly/, "review text is escaped");
  assert.match(widget, /go\/s\/awadh-express-cabs\?t=profile&amp;c=widget/);
  for (const secret of [supplier.email, supplier.phone, supplier.gstin, supplier.pan_number, supplier.id]) {
    assert.equal(widget.includes(secret) || standee.includes(secret), false, `never exposes ${secret}`);
  }
});

test("a voucher carries a review QR for the operator, but not once cancelled", () => {
  const booking = {
    id: "bk_1", ref: "IH-ABC1234", status: "confirmed", payment_status: "PAID", product_title: "Airport cab",
    traveler_name: "Amit", traveler_phone: "+919800000000", activity_date: "2026-10-01",
    supplier_name: "Awadh Express Cabs", supplier_public_slug: "awadh-express-cabs", supplier_profile_status: "PUBLISHED", supplier_kyb_status: "APPROVED",
  };
  const voucher = renderGuestDocument("VOUCHER", booking);
  assert.match(voucher, /After your trip/);
  assert.match(voucher, /booking reference <strong>IH-ABC1234<\/strong>/);
  assert.equal(renderGuestDocument("VOUCHER", { ...booking, status: "cancelled" }).includes("After your trip"), false);
  assert.equal(renderGuestDocument("VOUCHER", { ...booking, supplier_profile_status: "HIDDEN" }).includes("After your trip"), false);
  assert.ok(trackedShareUrl("awadh-express-cabs", { target: "REVIEW", channel: "VOUCHER" }).endsWith("?t=review&c=voucher"));
});
