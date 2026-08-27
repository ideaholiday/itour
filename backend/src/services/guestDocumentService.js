import crypto from "node:crypto";
import { nanoid } from "nanoid";

const documentTypes = new Set(["VOUCHER", "INVOICE"]);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const secret = () => process.env.DOCUMENT_LINK_SECRET || process.env.OTP_SECRET || process.env.JWT_SECRET || "idea-holiday-local-document-secret-change-me";
const sign = (payload) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function createGuestDocumentToken({ bookingId, bookingRef, documentType, expiresInSeconds = 30 * 24 * 60 * 60 }, now = Date.now()) {
  const type = String(documentType || "").toUpperCase();
  if (!bookingId || !bookingRef || !documentTypes.has(type)) throw Object.assign(new Error("Valid booking and document type are required"), { status: 400 });
  const payload = encode({ bookingId, bookingRef, documentType: type, exp: Math.floor(now / 1000) + expiresInSeconds });
  return `${payload}.${sign(payload)}`;
}

export function verifyGuestDocumentToken(token, { bookingId, bookingRef, documentType }, now = Date.now()) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature) return false;
    const expected = Buffer.from(sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.bookingId === bookingId
      && data.bookingRef === bookingRef
      && data.documentType === String(documentType).toUpperCase()
      && Number(data.exp) >= Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function resolveGuestDocumentBaseUrl(baseUrl) {
  const configured = String(baseUrl || process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "https://ideaholiday.in" : "http://localhost:8080";
}

export function guestDocumentLinks(booking, { expiresInSeconds, baseUrl } = {}) {
  const resolvedBaseUrl = resolveGuestDocumentBaseUrl(baseUrl);
  const make = (documentType) => {
    const token = createGuestDocumentToken({ bookingId: booking.id, bookingRef: booking.ref, documentType, expiresInSeconds });
    return `${resolvedBaseUrl}/api/bookings/${encodeURIComponent(booking.ref)}/documents/${documentType.toLowerCase()}?token=${encodeURIComponent(token)}`;
  };
  return { voucherUrl: make("VOUCHER"), invoiceUrl: make("INVOICE") };
}

function documentShell(title, booking, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#17233a;font:14px/1.55 Arial,sans-serif}.page{width:min(840px,calc(100% - 24px));margin:24px auto;background:#fff;padding:38px;border-radius:18px;box-shadow:0 18px 55px #17233a22}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #f1ad2b;padding-bottom:20px}.brand{font-size:28px;font-weight:800}.brand i{color:#f1ad2b;font-style:normal}.muted{color:#667085}.ref{font:700 17px monospace;color:#c27900}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:22px 0}.card{border:1px solid #e5e7eb;border-radius:12px;padding:13px}.label{display:block;color:#667085;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.section{margin-top:24px}.section h2{font-size:16px;margin:0 0 10px}.row{display:flex;justify-content:space-between;gap:24px;padding:9px 0;border-bottom:1px solid #eef0f3}.total{font-size:20px;font-weight:800;color:#087f5b}.notice{background:#fff8e6;border:1px solid #f6d48c;border-radius:12px;padding:13px;margin-top:18px}.actions{margin:20px 0 0;text-align:right}.actions button{border:0;border-radius:999px;background:#17233a;color:#fff;padding:11px 18px;font-weight:700;cursor:pointer}@media(max-width:600px){.page{padding:22px}.top{display:block}.grid{grid-template-columns:1fr}.actions{display:none}}@media print{body{background:#fff}.page{width:100%;margin:0;padding:18px;box-shadow:none;border-radius:0}.actions{display:none}}
  </style></head><body><main class="page"><div class="top"><div><div class="brand"><i>idea</i>holiday.</div><div class="muted">Travel More Across India</div></div><div><span class="label">Booking reference</span><div class="ref">${escapeHtml(booking.ref)}</div></div></div>${body}<div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div></main></body></html>`;
}

export function renderGuestDocument(documentType, booking) {
  const type = String(documentType || "").toUpperCase();
  if (!documentTypes.has(type)) throw Object.assign(new Error("Document type is not supported"), { status: 404 });
  if (type === "VOUCHER") {
    let logistics = {};
    try { logistics = typeof booking.logistics_snapshot === "string" ? JSON.parse(booking.logistics_snapshot || "{}") : (booking.logistics_snapshot || {}); } catch {}
    const driver = booking.driver_name ? `${escapeHtml(booking.driver_name)} · ${escapeHtml(booking.driver_phone)}<br>${escapeHtml(booking.vehicle_model)} · <strong>${escapeHtml(booking.vehicle_number)}</strong>` : "Driver details will be shared before pickup.";
    const pickupStatus = booking.confirmation_status === "PENDING_SUPPLIER" || logistics.pendingSupplier ? "Pickup details pending supplier confirmation" : `${booking.pickup_time || "Time TBC"} · ${booking.pickup_location || "See meeting point"}`;
    const body = `<h1>Booking voucher</h1><p class="muted">Present this mobile voucher at pickup. Government-issued identification may be requested.</p><div class="grid"><div class="card"><span class="label">Experience / option</span><strong>${escapeHtml(booking.product_title || booking.product_type)}</strong><br><span class="muted">${escapeHtml(booking.confirmation_status || booking.status || "PENDING")}</span></div><div class="card"><span class="label">Traveler</span><strong>${escapeHtml(booking.traveler_name)}</strong><br>${escapeHtml(booking.traveler_phone)}</div><div class="card"><span class="label">Date and pickup window</span><strong>${escapeHtml(booking.activity_date)} · ${escapeHtml(pickupStatus)}</strong></div><div class="card"><span class="label">Operator</span><strong>${escapeHtml(booking.supplier_name || "Idea Holiday partner")}</strong><br>${escapeHtml(booking.supplier_phone || "")}</div></div><section class="section"><h2>Pickup / meeting point</h2><div class="card">${escapeHtml(booking.pickup_location || logistics.pickupLocation || "Pending confirmation")}${booking.pickup_instructions ? `<br><span class="muted">${escapeHtml(booking.pickup_instructions)}</span>` : ""}${logistics.meetingPointLabel ? `<br><span class="muted">Meeting point: ${escapeHtml(logistics.meetingPointLabel)}</span>` : ""}</div></section>${booking.drop_location ? `<section class="section"><h2>Drop-off</h2><div class="card">${escapeHtml(booking.drop_location)}</div></section>` : ""}<section class="section"><h2>Driver and vehicle</h2><div class="card">${driver}</div></section><div class="notice"><strong>Pickup security:</strong> Check the driver and vehicle plate before sharing the private pickup code shown only in My Trips. The code is intentionally excluded from this shareable voucher.</div>`;
    return documentShell(`Voucher ${booking.ref}`, booking, body);
  }

  const total = Number(booking.amount_inr || 0);
  const charges = Math.min(total, Number(booking.tolls_and_tax_amount || 0));
  const serviceValue = Math.max(0, total - charges);
  const businessName = process.env.BUSINESS_LEGAL_NAME || "Idea Holiday";
  const businessGstin = process.env.BUSINESS_GSTIN || "GSTIN available on request";
  const body = `<h1>Booking invoice</h1><div class="grid"><div class="card"><span class="label">Invoice number</span><strong>INV-${escapeHtml(String(booking.ref).replace(/^IH-/, ""))}</strong><br><span class="muted">Issued ${escapeHtml(String(booking.created_at || "").slice(0, 10))}</span></div><div class="card"><span class="label">Payment</span><strong>${escapeHtml(booking.payment_status)} · ${escapeHtml(booking.payment_method)}</strong><br><span class="muted">${escapeHtml(booking.cashfree_payment_id || booking.razorpay_payment_id || "Recorded by Idea Holiday")}</span></div><div class="card"><span class="label">Billed to</span><strong>${escapeHtml(booking.traveler_name)}</strong><br>${escapeHtml(booking.traveler_email)}<br>${escapeHtml(booking.traveler_phone)}</div><div class="card"><span class="label">Issued by</span><strong>${escapeHtml(businessName)}</strong><br>${escapeHtml(businessGstin)}<br>${escapeHtml(process.env.BUSINESS_ADDRESS || "India")}</div></div><section class="section"><h2>Invoice items</h2><div class="row"><span>${escapeHtml(booking.product_title || booking.product_type)} · ${escapeHtml(booking.activity_date)}</span><strong>${money(serviceValue)}</strong></div><div class="row"><span>Taxes, tolls and statutory charges included</span><strong>${money(charges)}</strong></div><div class="row total"><span>Total paid</span><span>${money(total)}</span></div>${Number(booking.refunded_amount || 0) > 0 ? `<div class="row"><span>Refunded</span><strong>− ${money(booking.refunded_amount)}</strong></div>` : ""}</section><p class="muted">This electronic invoice is linked to booking ${escapeHtml(booking.ref)}. Supplier-specific tax documentation, where applicable, is issued under the operator’s registered details.</p>`;
  return documentShell(`Invoice ${booking.ref}`, booking, body);
}

export function logGuestDocumentAccess(database, { bookingId, documentType, accessedBy, accessMethod }) {
  database.prepare("INSERT INTO guest_document_access (id, booking_id, document_type, accessed_by, access_method) VALUES (?, ?, ?, ?, ?)")
    .run(`gda_${nanoid(12)}`, bookingId, String(documentType).toUpperCase(), accessedBy || null, accessMethod);
}
