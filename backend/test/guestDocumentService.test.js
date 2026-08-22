import test from "node:test";
import assert from "node:assert/strict";
import {
  createGuestDocumentToken,
  guestDocumentLinks,
  renderGuestDocument,
  verifyGuestDocumentToken,
} from "../src/services/guestDocumentService.js";

const booking = {
  id: "bk_secure_1",
  ref: "IH-SECURE1",
  product_title: "Goa private tour",
  product_type: "PACKAGE",
  traveler_name: "Guest <script>alert(1)</script>",
  traveler_phone: "+919876500001",
  traveler_email: "guest@example.com",
  activity_date: "2026-08-28",
  pickup_time: "09:00",
  pickup_location: "Calangute, Goa",
  supplier_name: "Goa Partner",
  supplier_phone: "+919000000001",
  driver_name: "Ramesh",
  driver_phone: "+919000000002",
  vehicle_model: "Sedan",
  vehicle_number: "GA-01-AB-1234",
  amount_inr: 10499,
  tolls_and_tax_amount: 500,
  payment_status: "PAID",
  payment_method: "ONLINE",
  created_at: "2026-08-17 12:00:00",
  otp_code: "123456",
};

test("guest document tokens are booking-scoped, type-scoped and expiring", () => {
  const now = Date.parse("2026-08-17T12:00:00Z");
  const token = createGuestDocumentToken({ bookingId: booking.id, bookingRef: booking.ref, documentType: "VOUCHER", expiresInSeconds: 60 }, now);
  assert.equal(verifyGuestDocumentToken(token, { bookingId: booking.id, bookingRef: booking.ref, documentType: "VOUCHER" }, now + 30_000), true);
  assert.equal(verifyGuestDocumentToken(token, { bookingId: booking.id, bookingRef: booking.ref, documentType: "INVOICE" }, now + 30_000), false);
  assert.equal(verifyGuestDocumentToken(token, { bookingId: booking.id, bookingRef: "IH-OTHER", documentType: "VOUCHER" }, now + 30_000), false);
  assert.equal(verifyGuestDocumentToken(token, { bookingId: booking.id, bookingRef: booking.ref, documentType: "VOUCHER" }, now + 61_000), false);
});

test("shareable voucher includes dispatch details but excludes private pickup codes", () => {
  const html = renderGuestDocument("VOUCHER", booking);
  assert.match(html, /GA-01-AB-1234/);
  assert.match(html, /Ramesh/);
  assert.doesNotMatch(html, /123456/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /Guest &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("invoice renders recorded totals without exposing unsafe markup", () => {
  const html = renderGuestDocument("INVOICE", booking);
  assert.match(html, /10,499\.00/);
  assert.match(html, /500\.00/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("guest document links use the provided base URL", () => {
  const links = guestDocumentLinks(booking, { baseUrl: "https://ideaholiday.in" });
  assert.match(links.voucherUrl, /^https:\/\/ideaholiday\.in\/api\/bookings\/IH-SECURE1\/documents\/voucher\?token=/);
  assert.match(links.invoiceUrl, /^https:\/\/ideaholiday\.in\/api\/bookings\/IH-SECURE1\/documents\/invoice\?token=/);
  const voucherToken = new URL(links.voucherUrl).searchParams.get("token");
  assert.equal(verifyGuestDocumentToken(voucherToken, { bookingId: booking.id, bookingRef: booking.ref, documentType: "VOUCHER" }), true);
});
