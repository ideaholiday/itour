import QRCode from "qrcode";
import { trackedShareUrl } from "./supplierShareKitService.js";
import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { countryTime } from "../lib/localTime.js";
import { GST_FREE_COUNTRIES } from "../lib/productTax.js";
import { isServiceablePayment, isSupplierDirect } from "../lib/bookingSources.js";

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

// An agent's client gets the voucher once and keeps it until the trip, which
// may be months away: those links last to 7 days after the trip, at least 30 days.
function agentLinkLifetime(booking, now = Date.now()) {
  if (!booking?.agency_id || !/^\d{4}-\d{2}-\d{2}/.test(String(booking.activity_date || ""))) return undefined;
  const untilTrip = Math.floor((Date.parse(`${String(booking.activity_date).slice(0, 10)}T00:00:00Z`) + 8 * 86_400_000 - now) / 1000);
  return Math.max(30 * 24 * 60 * 60, untilTrip);
}

export function guestDocumentLinks(booking, { expiresInSeconds, baseUrl } = {}) {
  const resolvedBaseUrl = resolveGuestDocumentBaseUrl(baseUrl);
  expiresInSeconds ??= agentLinkLifetime(booking);
  const make = (documentType) => {
    const token = createGuestDocumentToken({ bookingId: booking.id, bookingRef: booking.ref, documentType, expiresInSeconds });
    return `${resolvedBaseUrl}/api/bookings/${encodeURIComponent(booking.ref)}/documents/${documentType.toLowerCase()}?token=${encodeURIComponent(token)}`;
  };
  return { voucherUrl: make("VOUCHER"), invoiceUrl: make("INVOICE") };
}

// The client of a travel agent sees the agency's brand on the voucher, never
// ours (ADR 055). The logo is an image the agency uploaded to our storage.
function agencyBrand(booking) {
  const logo = /^(https:\/\/|\/uploads\/)/.test(String(booking.agency_logo_url || "")) ? booking.agency_logo_url : null;
  const contact = [booking.agency_phone, booking.agency_email].filter(Boolean).map(escapeHtml).join(" · ");
  return `<div>${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(booking.agency_name)}" style="max-height:56px;max-width:220px;display:block;margin-bottom:6px">` : ""}<div class="brand" style="font-size:${logo ? 18 : 26}px">${escapeHtml(booking.agency_name)}</div><div class="muted">${contact}</div></div>`;
}

function documentShell(title, booking, body, { brand } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#17233a;font:14px/1.55 Arial,sans-serif}.page{width:min(840px,calc(100% - 24px));margin:24px auto;background:#fff;padding:38px;border-radius:18px;box-shadow:0 18px 55px #17233a22}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #f1ad2b;padding-bottom:20px}.brand{font-size:28px;font-weight:800}.brand i{color:#f1ad2b;font-style:normal}.muted{color:#667085}.ref{font:700 17px monospace;color:#c27900}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:22px 0}.card{border:1px solid #e5e7eb;border-radius:12px;padding:13px}.label{display:block;color:#667085;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.section{margin-top:24px}.section h2{font-size:16px;margin:0 0 10px}.row{display:flex;justify-content:space-between;gap:24px;padding:9px 0;border-bottom:1px solid #eef0f3}.total{font-size:20px;font-weight:800;color:#087f5b}.notice{background:#fff8e6;border:1px solid #f6d48c;border-radius:12px;padding:13px;margin-top:18px}.actions{margin:20px 0 0;text-align:right}.actions button{border:0;border-radius:999px;background:#17233a;color:#fff;padding:11px 18px;font-weight:700;cursor:pointer}@media(max-width:600px){.page{padding:22px}.top{display:block}.grid{grid-template-columns:1fr}.actions{display:none}}@media print{body{background:#fff}.page{width:100%;margin:0;padding:18px;box-shadow:none;border-radius:0}.actions{display:none}}
  </style></head><body><main class="page"><div class="top">${brand || `<div><div class="brand"><i>idea</i>holiday.</div><div class="muted">Travel More Across ${escapeHtml(booking.product_country || "India")}</div></div>`}<div><span class="label">Booking reference</span><div class="ref">${escapeHtml(booking.ref)}</div></div></div>${body}<div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div></main></body></html>`;
}

function voucherQr(booking) {
  if (!isServiceablePayment(booking) || booking.status === "cancelled") return "";
  // The reference opens an authenticated trip page; the QR contains no guest PII or pickup secret.
  const qr = QRCode.create(`${resolveGuestDocumentBaseUrl()}/booking-confirmed/${encodeURIComponent(booking.ref)}`, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  let path = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.modules.get(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  return `<svg role="img" aria-label="Booking QR code" xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 ${size + 8} ${size + 8}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
}

/**
 * Share kit (docs/SHARE_KIT.md): a QR that, after the trip, takes the traveler
 * to the operator's review link through the tracked /go/s redirect. The review
 * still needs this booking's reference, which is printed on the voucher.
 */
function operatorReviewQr(booking) {
  const visible = String(booking.supplier_profile_status || "PUBLISHED").toUpperCase() === "PUBLISHED"
    && String(booking.supplier_kyb_status || "").toUpperCase() !== "SUSPENDED";
  if (!booking.supplier_public_slug || !visible || booking.status === "cancelled") return "";
  const url = trackedShareUrl(booking.supplier_public_slug, { target: "REVIEW", channel: "VOUCHER" });
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  let path = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.modules.get(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  const svg = `<svg role="img" aria-label="Review QR code" xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 ${size + 8} ${size + 8}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
  return `<section class="section"><h2>After your trip</h2><div class="card">${svg}<br>Scan to review ${escapeHtml(booking.supplier_name || "your operator")}. You'll need booking reference <strong>${escapeHtml(booking.ref)}</strong>.</div></section>`;
}

export function renderGuestDocument(documentType, booking) {
  const type = String(documentType || "").toUpperCase();
  if (!documentTypes.has(type)) throw Object.assign(new Error("Document type is not supported"), { status: 404 });
  if (type === "VOUCHER") {
    let logistics = {};
    try { logistics = typeof booking.logistics_snapshot === "string" ? JSON.parse(booking.logistics_snapshot || "{}") : (booking.logistics_snapshot || {}); } catch {}
    const driver = booking.driver_name ? `${escapeHtml(booking.driver_name)} · ${escapeHtml(booking.driver_phone)}<br>${escapeHtml(booking.vehicle_model)} · <strong>${escapeHtml(booking.vehicle_number)}</strong>` : "Driver details will be shared before pickup.";
    // A clock time is in the trip city's zone: IST in India, ICT in Thailand (ADR 023).
    const pickupTime = /^\d{1,2}:\d{2}$/.test(String(booking.pickup_time || "").trim())
      ? `${String(booking.pickup_time).trim()} ${booking.product_time_label || countryTime(booking.product_country).label}`
      : booking.pickup_time;
    // A client of a travel agent sees who booked them and whom to call about changes (ADR 054, B4). No price.
    const whiteLabel = Boolean(booking.agency_name);
    const agencyCard = whiteLabel
      ? `<div class="card"><span class="label">Your travel agent</span><strong>${escapeHtml(booking.agency_name)}</strong><br>${escapeHtml(booking.agency_phone || "")}<br><span class="muted">Contact your travel agent for changes or cancellation.</span></div>`
      : "";
    const securityNotice = whiteLabel
      ? "Check the driver and vehicle plate before sharing the private pickup code. Your travel agent shares the code with you before the trip; it is not on this voucher."
      : "Check the driver and vehicle plate before sharing the private pickup code shown only in My Trips. The code is intentionally excluded from this shareable voucher.";
    const pickupStatus = booking.confirmation_status === "PENDING_SUPPLIER" || logistics.pendingSupplier ? "Pickup details pending supplier confirmation" : `${pickupTime || "Time TBC"} · ${booking.pickup_location || "See meeting point"}`;
    const body = `<h1>Booking voucher</h1>${voucherQr(booking)}<p class="muted">Present this mobile voucher at pickup. Government-issued identification may be requested.</p><div class="grid"><div class="card"><span class="label">Experience / option</span><strong>${escapeHtml(booking.product_title || booking.product_type)}</strong><br><span class="muted">${escapeHtml(booking.confirmation_status || booking.status || "PENDING")}</span></div><div class="card"><span class="label">Traveler</span><strong>${escapeHtml(booking.traveler_name)}</strong><br>${escapeHtml(booking.traveler_phone)}</div><div class="card"><span class="label">Date and pickup window</span><strong>${escapeHtml(booking.activity_date)} · ${escapeHtml(pickupStatus)}</strong></div><div class="card"><span class="label">Operator</span><strong>${escapeHtml(booking.supplier_name || (whiteLabel ? "Local operator" : "Idea Holiday partner"))}</strong><br>${escapeHtml(booking.supplier_phone || "")}</div>${agencyCard}</div><section class="section"><h2>Pickup / meeting point</h2><div class="card">${escapeHtml(booking.pickup_location || logistics.pickupLocation || "Pending confirmation")}${booking.pickup_instructions ? `<br><span class="muted">${escapeHtml(booking.pickup_instructions)}</span>` : ""}${logistics.meetingPointLabel ? `<br><span class="muted">Meeting point: ${escapeHtml(logistics.meetingPointLabel)}</span>` : ""}</div></section>${booking.drop_location ? `<section class="section"><h2>Drop-off</h2><div class="card">${escapeHtml(booking.drop_location)}</div></section>` : ""}<section class="section"><h2>Driver and vehicle</h2><div class="card">${driver}</div></section><div class="notice"><strong>Pickup security:</strong> ${securityNotice}</div>${booking.traveler_invite_link ? `<section class="section"><h2>Travelling with friends?</h2><div class="card">Anyone who signs up with this link gets a discount on their first Idea Holiday trip:<br><strong>${escapeHtml(booking.traveler_invite_link)}</strong></div></section>` : ""}${whiteLabel ? "" : operatorReviewQr(booking)}`;
    return documentShell(`Voucher ${booking.ref}`, booking, body, whiteLabel ? { brand: agencyBrand(booking) } : {});
  }

  // A supplier-direct booking was paid to the operator, not to IdeaHoliday, so
  // IdeaHoliday issues no invoice or receipt for it: only what is paid and owed.
  if (isSupplierDirect(booking)) {
    const amount = Number(booking.amount_inr || 0);
    const balance = Number(booking.balance_due_inr || 0);
    const discount = Number(booking.direct_discount_inr || 0);
    const body = `<h1>Payment summary</h1><div class="grid"><div class="card"><span class="label">Booked with</span><strong>${escapeHtml(booking.supplier_name || "Your operator")}</strong></div><div class="card"><span class="label">Guest</span><strong>${escapeHtml(booking.traveler_name)}</strong><br>${escapeHtml(booking.traveler_phone || "")}</div></div><section class="section"><h2>${escapeHtml(booking.product_title || booking.product_type)} · ${escapeHtml(booking.activity_date)}</h2>${discount > 0 ? `<div class="row"><span>Discount from the operator</span><strong>− ${money(discount)}</strong></div>` : ""}<div class="row"><span>Booking total</span><strong>${money(amount)}</strong></div><div class="row"><span>Paid to the operator</span><strong>${money(amount - balance)}</strong></div><div class="row total"><span>${balance > 0 ? "Balance due" : "Fully paid"}</span><span>${money(balance)}</span></div></section><p class="muted">You paid ${escapeHtml(booking.supplier_name || "the operator")} directly. Tax invoices and refunds for this booking come from the operator.</p>`;
    return documentShell(`Payment summary ${booking.ref}`, booking, body);
  }

  const total = Number(booking.amount_inr || 0);
  const friendDiscount = Number(booking.referral_discount_inr || 0);
  const walletCredit = Number(booking.wallet_credit_applied_inr || 0);
  const couponDiscount = Number(booking.coupon_discount_inr || 0);
  const agentDiscount = Number(booking.agent_discount_inr || 0);
  const discounts = friendDiscount + walletCredit + couponDiscount + agentDiscount;
  // An agent booking is billed to the agency that paid, with its GSTIN (ADR 054).
  const billedTo = booking.agency_name
    ? `<strong>${escapeHtml(booking.agency_name)}</strong>${booking.agency_gstin ? `<br>GSTIN ${escapeHtml(booking.agency_gstin)}` : ""}${booking.agency_address ? `<br>${escapeHtml(booking.agency_address)}` : ""}<br><span class="muted">Guest: ${escapeHtml(booking.traveler_name)}</span>`
    : `<strong>${escapeHtml(booking.traveler_name)}</strong><br>${escapeHtml(booking.traveler_email)}<br>${escapeHtml(booking.traveler_phone)}`;
  const agentRow = agentDiscount > 0 ? `<div class="row"><span>Agent discount (${escapeHtml(String(Number(booking.agent_discount_pct || 0)))}%)</span><strong>− ${money(agentDiscount)}</strong></div>` : "";
  const charges = Math.min(total + discounts, Number(booking.tolls_and_tax_amount || 0));
  const serviceValue = Math.max(0, total + discounts - charges);
  const businessName = process.env.BUSINESS_LEGAL_NAME || "Idea Holiday";
  const businessGstin = process.env.BUSINESS_GSTIN || "GSTIN available on request";
  // An agent booking (ADR 054, 055): IdeaHoliday invoices the agency for the trip at
  // its agent price, with 18% GST on IdeaHoliday's service fee added, under the
  // travel-agent SAC 998551 (owner's CA, 2026-10-01; BUSINESS_AGENT_SAC overrides it).
  if (booking.agency_id && booking.agency_name) {
    const agentPrice = total + walletCredit - Number(booking.agent_service_gst_inr || 0);
    const serviceFee = Number(booking.agent_service_fee_inr || 0);
    const serviceGst = Number(booking.agent_service_gst_inr || 0);
    const sac = String(process.env.BUSINESS_AGENT_SAC || "998551").trim();
    const body = `<h1>Tax invoice</h1><div class="grid"><div class="card"><span class="label">Invoice number</span><strong>INV-${escapeHtml(String(booking.ref).replace(/^IH-/, ""))}</strong><br><span class="muted">Issued ${escapeHtml(String(booking.created_at || "").slice(0, 10))}</span></div><div class="card"><span class="label">Payment</span><strong>${escapeHtml(booking.payment_status)} · ${escapeHtml(booking.payment_method)}</strong><br><span class="muted">${escapeHtml(booking.cashfree_payment_id || booking.razorpay_payment_id || "Recorded by Idea Holiday")}</span></div><div class="card"><span class="label">Billed to</span>${billedTo}</div><div class="card"><span class="label">Issued by</span><strong>${escapeHtml(businessName)}</strong><br>${escapeHtml(businessGstin)}<br>${escapeHtml(process.env.BUSINESS_ADDRESS || "India")}</div></div><section class="section"><h2>Invoice items</h2><div class="row"><span>${escapeHtml(booking.product_title || booking.product_type)} · ${escapeHtml(booking.activity_date)} · website price</span><strong>${money(agentPrice + agentDiscount)}</strong></div>${agentRow}<div class="row"><span>Agent price</span><strong>${money(agentPrice)}</strong></div><div class="row"><span>of which Idea Holiday service fee${sac ? ` (SAC ${escapeHtml(sac)})` : ""}</span><strong>${money(serviceFee)}</strong></div><div class="row"><span>GST @ 18% on the service fee</span><strong>+ ${money(serviceGst)}</strong></div>${walletCredit > 0 ? `<div class="row"><span>Idea Holiday wallet credit</span><strong>− ${money(walletCredit)}</strong></div>` : ""}<div class="row total"><span>Total paid</span><span>${money(total)}</span></div>${Number(booking.refunded_amount || 0) > 0 ? `<div class="row"><span>Refunded</span><strong>− ${money(booking.refunded_amount)}</strong></div>` : ""}</section><p class="muted">Travel services are provided by ${escapeHtml(booking.supplier_name || "the operator")}; taxes on the trip are included in its price. Idea Holiday's service fee is invoiced to your agency with GST at 18%.</p>`;
    return documentShell(`Invoice ${booking.ref}`, booking, body);
  }

  // A booking with no GST, such as a Thai supplier's product in Thailand (ADR 023), gets a
  // receipt, not a GST invoice. An Indian supplier's product abroad carries GST (ADR 024).
  if (booking.gst_free ?? GST_FREE_COUNTRIES.includes(booking.product_country)) {
    const body = `<h1>Booking receipt</h1><div class="grid"><div class="card"><span class="label">Receipt number</span><strong>RCP-${escapeHtml(String(booking.ref).replace(/^IH-/, ""))}</strong><br><span class="muted">Issued ${escapeHtml(String(booking.created_at || "").slice(0, 10))}</span></div><div class="card"><span class="label">Payment</span><strong>${escapeHtml(booking.payment_status)} · ${escapeHtml(booking.payment_method)}</strong><br><span class="muted">${escapeHtml(booking.cashfree_payment_id || booking.razorpay_payment_id || "Recorded by Idea Holiday")}</span></div><div class="card"><span class="label">Billed to</span>${billedTo}</div><div class="card"><span class="label">Issued by</span><strong>${escapeHtml(businessName)}</strong><br>${escapeHtml(process.env.BUSINESS_ADDRESS || "India")}</div></div><section class="section"><h2>Receipt items</h2><div class="row"><span>${escapeHtml(booking.product_title || booking.product_type)} · ${escapeHtml(booking.activity_date)}</span><strong>${money(serviceValue)}</strong></div>${charges > 0 ? `<div class="row"><span>Tolls and charges included</span><strong>${money(charges)}</strong></div>` : ""}${agentRow}${couponDiscount > 0 ? `<div class="row"><span>Promo code discount${booking.promo_code ? ` (${escapeHtml(booking.promo_code)})` : ""}</span><strong>− ${money(couponDiscount)}</strong></div>` : ""}${friendDiscount > 0 ? `<div class="row"><span>Friend referral discount</span><strong>− ${money(friendDiscount)}</strong></div>` : ""}${walletCredit > 0 ? `<div class="row"><span>Idea Holiday wallet credit</span><strong>− ${money(walletCredit)}</strong></div>` : ""}<div class="row total"><span>Total paid</span><span>${money(total)}</span></div>${Number(booking.refunded_amount || 0) > 0 ? `<div class="row"><span>Refunded</span><strong>− ${money(booking.refunded_amount)}</strong></div>` : ""}</section><p class="muted">This electronic receipt is linked to booking ${escapeHtml(booking.ref)}. No GST is charged on experiences in ${escapeHtml(booking.product_country)}.</p>`;
    return documentShell(`Receipt ${booking.ref}`, booking, body);
  }
  const body = `<h1>Booking invoice</h1><div class="grid"><div class="card"><span class="label">Invoice number</span><strong>INV-${escapeHtml(String(booking.ref).replace(/^IH-/, ""))}</strong><br><span class="muted">Issued ${escapeHtml(String(booking.created_at || "").slice(0, 10))}</span></div><div class="card"><span class="label">Payment</span><strong>${escapeHtml(booking.payment_status)} · ${escapeHtml(booking.payment_method)}</strong><br><span class="muted">${escapeHtml(booking.cashfree_payment_id || booking.razorpay_payment_id || "Recorded by Idea Holiday")}</span></div><div class="card"><span class="label">Billed to</span>${billedTo}</div><div class="card"><span class="label">Issued by</span><strong>${escapeHtml(businessName)}</strong><br>${escapeHtml(businessGstin)}<br>${escapeHtml(process.env.BUSINESS_ADDRESS || "India")}</div></div><section class="section"><h2>Invoice items</h2><div class="row"><span>${escapeHtml(booking.product_title || booking.product_type)} · ${escapeHtml(booking.activity_date)}</span><strong>${money(serviceValue)}</strong></div><div class="row"><span>Taxes, tolls and statutory charges included</span><strong>${money(charges)}</strong></div>${agentRow}${couponDiscount > 0 ? `<div class="row"><span>Promo code discount${booking.promo_code ? ` (${escapeHtml(booking.promo_code)})` : ""}</span><strong>− ${money(couponDiscount)}</strong></div>` : ""}${friendDiscount > 0 ? `<div class="row"><span>Friend referral discount</span><strong>− ${money(friendDiscount)}</strong></div>` : ""}${walletCredit > 0 ? `<div class="row"><span>Idea Holiday wallet credit</span><strong>− ${money(walletCredit)}</strong></div>` : ""}<div class="row total"><span>Total paid</span><span>${money(total)}</span></div>${Number(booking.refunded_amount || 0) > 0 ? `<div class="row"><span>Refunded</span><strong>− ${money(booking.refunded_amount)}</strong></div>` : ""}</section><p class="muted">This electronic invoice is linked to booking ${escapeHtml(booking.ref)}. Supplier-specific tax documentation, where applicable, is issued under the operator’s registered details.</p>`;
  return documentShell(`Invoice ${booking.ref}`, booking, body);
}

export function logGuestDocumentAccess(database, { bookingId, documentType, accessedBy, accessMethod }) {
  database.prepare("INSERT INTO guest_document_access (id, booking_id, document_type, accessed_by, access_method) VALUES (?, ?, ?, ?, ?)")
    .run(`gda_${nanoid(12)}`, bookingId, String(documentType).toUpperCase(), accessedBy || null, accessMethod);
}
