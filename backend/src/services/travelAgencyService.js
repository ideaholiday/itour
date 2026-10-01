import { nanoid } from "nanoid";
import { toE164 } from "../lib/phone.js";
import { sendEmail } from "./emailService.js";
import { csvCell } from "./supplierDepartureService.js";

/**
 * IdeaHoliday B2B travel agents (ADR 054). An agent is a traveler account with
 * an agency profile: the agency applies with a GSTIN or a PAN, an admin
 * approves it and sets its discount (5–10% below the website price). Only an
 * APPROVED agency gets the agent price; the account stays a TRAVELER, so every
 * traveler page keeps working for it.
 */

export const AGENCY_STATUSES = Object.freeze(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]);
export const AGENCY_DISCOUNT_MIN_PCT = 5;
export const AGENCY_DISCOUNT_MAX_PCT = 10;
// GST on IdeaHoliday's service fee to an agent (ADR 055; owner's CA, 2026-10-01).
export const AGENT_SERVICE_GST_PCT = 18;

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const agencyError = (message, status = 400, code = "INVALID_AGENCY") => Object.assign(new Error(message), { status, code });

const clean = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};
const taxId = (value) => clean(value)?.toUpperCase().replace(/\s+/g, "") || null;

function siteUrl(path) {
  return `${String(process.env.PUBLIC_APP_URL || "https://ideaholiday.in").replace(/\/$/, "")}${path}`;
}

/** Checks the agency's tax ids: a GSTIN or a PAN, and a GSTIN carries its PAN. */
export function normalizeTaxIds({ gstin, pan }) {
  const cleanGstin = taxId(gstin);
  const cleanPan = taxId(pan);
  if (!cleanGstin && !cleanPan) throw agencyError("Enter your agency's GSTIN or PAN", 400, "TAX_ID_REQUIRED");
  if (cleanGstin && !GSTIN_RE.test(cleanGstin)) throw agencyError("That GSTIN doesn't look right: 15 characters, like 09ABCDE1234F1Z5", 400, "INVALID_GSTIN");
  if (cleanPan && !PAN_RE.test(cleanPan)) throw agencyError("That PAN doesn't look right: 10 characters, like ABCDE1234F", 400, "INVALID_PAN");
  if (cleanGstin && cleanPan && cleanGstin.slice(2, 12) !== cleanPan) {
    throw agencyError("The PAN doesn't match the one inside the GSTIN", 400, "PAN_GSTIN_MISMATCH");
  }
  return { gstin: cleanGstin, pan: cleanPan || (cleanGstin ? cleanGstin.slice(2, 12) : null) };
}

export function getAgencyForUser(database, userId) {
  if (!userId) return null;
  return database.prepare("SELECT * FROM travel_agencies WHERE user_id = ?").get(userId) || null;
}

/** The agency whose agent price applies to this user, or null (B2 reads this). */
export function approvedAgencyForUser(database, userId) {
  const agency = getAgencyForUser(database, userId);
  return agency?.status === "APPROVED" ? agency : null;
}

/**
 * The agent price of one booking (ADR 054): the website price less the
 * agency's %, rounded to the rupee. The discount comes out of IdeaHoliday's
 * commission and always stays below it, so the supplier's payout never moves
 * and IdeaHoliday keeps at least ₹1.
 */
export function agentPrice(agency, { totalInr, commissionInr }) {
  const total = Math.max(0, Math.round(Number(totalInr) || 0));
  const pct = Number(agency?.discount_pct);
  if (!agency || !(pct > 0)) return null;
  const offered = Math.round(total * pct / 100);
  const ceiling = Math.max(0, Math.round(Number(commissionInr) || 0) - 1);
  const discountInr = Math.min(offered, ceiling);
  // GST on IdeaHoliday's service fee, added on top (ADR 055): the fee is what
  // IdeaHoliday keeps of the commission after the agent discount.
  const serviceFeeInr = Math.max(0, Math.round(Number(commissionInr) || 0) - discountInr);
  const serviceGstInr = Math.round(serviceFeeInr * AGENT_SERVICE_GST_PCT / 100);
  return {
    agencyId: agency.id,
    agencyName: agency.agency_name,
    discountPct: pct,
    websitePriceInr: total,
    discountInr,
    agentPriceInr: total - discountInr,
    serviceFeeInr,
    serviceGstPct: AGENT_SERVICE_GST_PCT,
    serviceGstInr,
    payableInr: total - discountInr + serviceGstInr,
    cappedByCommission: discountInr < offered,
  };
}

/** Agent bookings take no coupon or creator code; the agent price is the discount. */
export function assertNoAgentCoupon(agency, promoCode) {
  if (agency && String(promoCode || "").trim()) {
    throw agencyError("Coupons and creator codes don't apply to agent bookings; your agent price is already the discount", 400, "AGENT_NO_COUPONS");
  }
}

/** What the agency itself sees. */
export function agencyView(agency) {
  if (!agency) return null;
  return {
    id: agency.id,
    agencyName: agency.agency_name,
    contactName: agency.contact_name,
    phone: agency.phone,
    gstin: agency.gstin,
    pan: agency.pan,
    address: agency.address,
    city: agency.city,
    state: agency.state,
    website: agency.website,
    logoUrl: agency.logo_url || null,
    status: agency.status,
    discountPct: agency.status === "APPROVED" ? Number(agency.discount_pct) : null,
    reviewNote: agency.status === "REJECTED" || agency.status === "SUSPENDED" ? agency.review_note : null,
    createdAt: agency.created_at,
    reviewedAt: agency.reviewed_at,
  };
}

/**
 * Applies, or updates an application. A pending application can be edited; a
 * rejected one goes back to pending. An approved or suspended agency can't
 * apply again (an admin changes those).
 */
export function applyForAgency(database, userId, input) {
  const user = database.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(userId);
  if (!user) throw agencyError("Account not found", 404, "USER_NOT_FOUND");
  if (String(user.role || "").toUpperCase() !== "TRAVELER") {
    throw agencyError("Use a traveler account to apply as a travel agent, not a supplier or staff login", 403, "NOT_A_TRAVELER_ACCOUNT");
  }
  const { gstin, pan } = normalizeTaxIds(input);
  const phone = toE164(input.phone);
  if (!phone) throw agencyError("Enter a mobile number we can reach on WhatsApp", 400, "INVALID_PHONE");
  const fields = {
    agency_name: clean(input.agencyName),
    contact_name: clean(input.contactName) || user.name || null,
    phone,
    gstin,
    pan,
    address: clean(input.address),
    city: clean(input.city),
    state: clean(input.state),
    website: clean(input.website),
  };
  if (!fields.agency_name || !fields.contact_name || !fields.city || !fields.state) {
    throw agencyError("Agency name, contact name, city and state are required");
  }

  const existing = getAgencyForUser(database, userId);
  if (existing && (existing.status === "APPROVED" || existing.status === "SUSPENDED")) {
    throw agencyError(existing.status === "APPROVED" ? "Your agency is already approved" : "Your agency account is suspended; contact IdeaHoliday",
      409, "AGENCY_ALREADY_REVIEWED");
  }
  if (existing) {
    database.prepare(`UPDATE travel_agencies SET agency_name = ?, contact_name = ?, phone = ?, gstin = ?, pan = ?, address = ?,
      city = ?, state = ?, website = ?, status = 'PENDING', review_note = NULL, updated_at = datetime('now') WHERE id = ?`)
      .run(fields.agency_name, fields.contact_name, fields.phone, fields.gstin, fields.pan, fields.address,
        fields.city, fields.state, fields.website, existing.id);
  } else {
    database.prepare(`INSERT INTO travel_agencies (id, user_id, agency_name, contact_name, phone, gstin, pan, address, city, state, website)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(`agy_${nanoid(12)}`, userId, fields.agency_name, fields.contact_name, fields.phone, fields.gstin, fields.pan,
        fields.address, fields.city, fields.state, fields.website);
  }
  return { agency: getAgencyForUser(database, userId), user, resubmitted: Boolean(existing) };
}

/**
 * The agency's logo for its clients' vouchers (ADR 055): an image this same
 * account uploaded through POST /api/uploads, never an outside URL. null removes it.
 */
export function setAgencyLogo(database, userId, logoUrl) {
  const agency = getAgencyForUser(database, userId);
  if (!agency) throw agencyError("Apply as a travel agent first", 404, "NO_AGENCY");
  const url = clean(logoUrl);
  if (url) {
    const upload = database.prepare("SELECT mime_type FROM uploads WHERE url = ? AND user_id = ?").get(url, userId);
    if (!upload || !/^image\/(png|jpe?g|webp)$/i.test(String(upload.mime_type || ""))) {
      throw agencyError("Upload the logo as a PNG, JPG or WEBP image first", 400, "INVALID_LOGO");
    }
  }
  database.prepare("UPDATE travel_agencies SET logo_url = ?, updated_at = datetime('now') WHERE id = ?").run(url, agency.id);
  return getAgencyForUser(database, userId);
}

export function listAgencies(database, { status } = {}) {
  const filter = status && AGENCY_STATUSES.includes(status) ? "WHERE a.status = ?" : "";
  const rows = database.prepare(`SELECT a.*, u.email AS user_email, u.name AS user_name
    FROM travel_agencies a JOIN users u ON u.id = a.user_id ${filter}
    ORDER BY CASE a.status WHEN 'PENDING' THEN 0 ELSE 1 END, a.created_at DESC`).all(...(filter ? [status] : []));
  const counts = Object.fromEntries(AGENCY_STATUSES.map((s) => [s, 0]));
  for (const row of database.prepare("SELECT status, COUNT(*) AS n FROM travel_agencies GROUP BY status").all()) counts[row.status] = Number(row.n);
  return {
    agencies: rows.map((row) => ({ ...agencyView(row), discountPct: Number(row.discount_pct), reviewNote: row.review_note, email: row.user_email, accountName: row.user_name })),
    counts,
  };
}

const ALLOWED_FROM = {
  APPROVED: ["PENDING", "REJECTED", "SUSPENDED", "APPROVED"],
  REJECTED: ["PENDING"],
  SUSPENDED: ["APPROVED"],
};

/**
 * An admin approves (with a discount of 5–10%), rejects, or suspends an agency.
 * Approving an approved agency changes its discount. Rejecting and suspending
 * need a reason, which the agency is shown.
 */
export function reviewAgency(database, agencyId, { status, discountPct, reason }, reviewerId) {
  const agency = database.prepare("SELECT * FROM travel_agencies WHERE id = ?").get(agencyId);
  if (!agency) throw agencyError("Agency not found", 404, "AGENCY_NOT_FOUND");
  if (!ALLOWED_FROM[status]) throw agencyError("Choose approve, reject or suspend", 400, "INVALID_STATUS");
  if (!ALLOWED_FROM[status].includes(agency.status)) {
    throw agencyError(`A ${agency.status.toLowerCase()} agency can't be ${status.toLowerCase()}`, 409, "INVALID_TRANSITION");
  }
  const note = clean(reason);
  if (status !== "APPROVED" && (!note || note.length < 3)) throw agencyError("Give a reason; the agency sees it", 400, "REASON_REQUIRED");
  const discount = discountPct === undefined || discountPct === null ? Number(agency.discount_pct) : Number(discountPct);
  if (!(discount >= AGENCY_DISCOUNT_MIN_PCT && discount <= AGENCY_DISCOUNT_MAX_PCT)) {
    throw agencyError(`The agent discount is ${AGENCY_DISCOUNT_MIN_PCT}–${AGENCY_DISCOUNT_MAX_PCT}%`, 400, "INVALID_DISCOUNT");
  }
  database.prepare(`UPDATE travel_agencies SET status = ?, discount_pct = ?, review_note = ?, reviewed_by = ?,
    reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .run(status, discount, status === "APPROVED" ? null : note, reviewerId || null, agencyId);
  const updated = database.prepare("SELECT * FROM travel_agencies WHERE id = ?").get(agencyId);
  const user = database.prepare("SELECT id, email, name FROM users WHERE id = ?").get(updated.user_id);
  return { agency: updated, previousStatus: agency.status, previousDiscountPct: Number(agency.discount_pct), user };
}

/** Email to the agency when it applies or is reviewed. Returns the sendEmail promise. */
export function sendAgencyEmail(database, { agency, user, event }) {
  if (!user?.email) return Promise.resolve(null);
  const name = agency.contact_name || user.name || "there";
  const messages = {
    APPLIED: {
      subject: `We've received ${agency.agency_name}'s travel agent application`,
      text: `Hi ${name},\n\nThanks for applying to book with IdeaHoliday as a travel agent. We check your GSTIN or PAN and reply by email, usually within two working days.\n\nUntil then you can keep using your account as a traveler.\n\nTeam IdeaHoliday`,
    },
    APPROVED: {
      subject: `${agency.agency_name} is approved as an IdeaHoliday travel agent`,
      text: `Hi ${name},\n\nYour agency is approved. Sign in with this email and you'll see your agent price, ${Number(agency.discount_pct)}% below the website price, on every listing you can book.\n\n${siteUrl("/agents")}\n\nTeam IdeaHoliday`,
    },
    REJECTED: {
      subject: `About ${agency.agency_name}'s travel agent application`,
      text: `Hi ${name},\n\nWe couldn't approve your agency yet. Reason: ${agency.review_note}\n\nYou can fix the details and apply again at ${siteUrl("/agents/signup")}.\n\nTeam IdeaHoliday`,
    },
    SUSPENDED: {
      subject: `${agency.agency_name}'s agent account is suspended`,
      text: `Hi ${name},\n\nAgent prices are paused on your account. Reason: ${agency.review_note}\n\nBookings you already made are not affected. Reply to this email to talk to us.\n\nTeam IdeaHoliday`,
    },
  };
  const message = messages[event];
  if (!message) return Promise.resolve(null);
  return sendEmail({
    to: user.email,
    recipientName: name,
    recipientRole: "TRAVELER",
    recipientId: user.id,
    eventType: `TRAVEL_AGENCY_${event}`,
    eventKey: `TRAVEL_AGENCY_${event}:${agency.id}:${agency.updated_at}`,
    subject: message.subject,
    text: message.text,
    metadata: { agencyId: agency.id },
  }, { database });
}

// ── Agent dashboard and statement (plan B3) ──────────────────────────────────

const PAID_STATUSES = ["PAID", "REFUND_INITIATED", "REFUNDED", "REFUNDED_TO_WALLET", "PARTIALLY_REFUNDED"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const indiaToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

function bookingRow(row, today) {
  const status = String(row.status || "").toLowerCase();
  const paid = PAID_STATUSES.includes(row.payment_status);
  const paidInr = paid ? Number(row.amount_inr || 0) + Number(row.wallet_credit_applied_inr || 0) : 0;
  const refundInr = paid ? Math.max(Number(row.refund_amount_inr || 0), Number(row.refunded_amount || 0)) : 0;
  const agentDiscountInr = Number(row.agent_discount_inr || 0);
  const serviceGstInr = Number(row.agent_service_gst_inr || 0);
  return {
    id: row.id,
    ref: row.ref,
    bookedAt: row.created_at,
    tripDate: row.activity_date,
    pickupTime: row.pickup_time,
    productTitle: row.product_title || row.product_type,
    productType: row.product_type,
    guestName: row.traveler_name,
    guestPhone: row.traveler_phone,
    guestEmail: row.traveler_email,
    adults: Number(row.adults || 0),
    children: Number(row.children || 0),
    status,
    paymentStatus: row.payment_status,
    paid,
    websitePriceInr: Number(row.amount_inr || 0) + Number(row.wallet_credit_applied_inr || 0) + agentDiscountInr - serviceGstInr,
    agentDiscountInr,
    serviceGstInr,
    agentDiscountPct: row.agent_discount_pct == null ? null : Number(row.agent_discount_pct),
    paidInr,
    refundInr,
    netInr: paidInr - refundInr,
    circuitOrderId: row.circuit_order_id || null,
    supplierRescheduleStatus: row.supplier_reschedule_status || null,
    // Single bookings are cancelled from the dashboard; circuit legs from the circuit's page.
    canCancel: paid && row.payment_status === "PAID" && !["cancelled", "completed", "in_progress"].includes(status)
      && String(row.activity_date) >= today && !row.circuit_order_id,
  };
}

/**
 * An agency's bookings for the dashboard and statement. `dateBy` filters on the
 * trip date (default) or the day it was booked; `status` is upcoming,
 * completed, cancelled, unpaid or all; `q` matches the guest, reference or listing.
 */
export function listAgencyBookings(database, agencyId, { from, to, dateBy = "trip", status = "all", q = "" } = {}) {
  const where = ["b.agency_id = ?"];
  const params = [agencyId];
  const column = dateBy === "booked" ? "substr(b.created_at, 1, 10)" : "b.activity_date";
  if (DATE_RE.test(String(from || ""))) { where.push(`${column} >= ?`); params.push(from); }
  if (DATE_RE.test(String(to || ""))) { where.push(`${column} <= ?`); params.push(to); }
  const search = String(q || "").trim().toLowerCase();
  if (search) {
    where.push("(LOWER(b.traveler_name) LIKE ? OR LOWER(b.ref) LIKE ? OR LOWER(COALESCE(p.title, '')) LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const rows = database.prepare(`SELECT b.*, p.title AS product_title FROM bookings b LEFT JOIN products p ON p.id = b.product_id
    WHERE ${where.join(" AND ")} ORDER BY b.activity_date DESC, b.created_at DESC LIMIT 2000`).all(...params);
  const today = indiaToday();
  const all = rows.map((row) => bookingRow(row, today));
  const matches = {
    upcoming: (b) => b.paid && !["cancelled", "completed"].includes(b.status) && b.tripDate >= today,
    completed: (b) => b.paid && (b.status === "completed" || (b.status !== "cancelled" && b.tripDate < today)),
    cancelled: (b) => b.status === "cancelled" && b.paid,
    unpaid: (b) => !b.paid,
  }[status];
  const bookings = matches ? all.filter(matches) : all;
  const paidRows = bookings.filter((b) => b.paid);
  const sum = (key) => paidRows.reduce((total, b) => total + b[key], 0);
  return {
    bookings,
    totals: {
      bookings: paidRows.length,
      guests: paidRows.filter((b) => b.status !== "cancelled").reduce((total, b) => total + b.adults + b.children, 0),
      websitePriceInr: sum("websitePriceInr"),
      agentDiscountInr: sum("agentDiscountInr"),
      serviceGstInr: sum("serviceGstInr"),
      paidInr: sum("paidInr"),
      refundInr: sum("refundInr"),
      netInr: sum("netInr"),
    },
    filters: { from: DATE_RE.test(String(from || "")) ? from : null, to: DATE_RE.test(String(to || "")) ? to : null, dateBy: dateBy === "booked" ? "booked" : "trip", status, q: search },
  };
}

export function agencyStatementCsv(statement) {
  const header = ["Reference", "Booked on", "Trip date", "Listing", "Guest", "Guests", "Status", "Website price (INR)", "Agent discount (INR)", "GST on service fee (INR)", "Paid (INR)", "Refunded (INR)", "Net (INR)"];
  const lines = statement.bookings.map((b) => [
    b.ref, String(b.bookedAt || "").slice(0, 10), b.tripDate, b.productTitle, b.guestName, b.adults + b.children,
    b.paid ? b.status : "unpaid", b.websitePriceInr, b.agentDiscountInr, b.serviceGstInr, b.paidInr, b.refundInr, b.netInr,
  ]);
  const t = statement.totals;
  lines.push(["Total", "", "", "", "", t.guests, `${t.bookings} paid bookings`, t.websitePriceInr, t.agentDiscountInr, t.serviceGstInr, t.paidInr, t.refundInr, t.netInr]);
  return `${[header, ...lines].map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
