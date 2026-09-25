/**
 * Review collection links.
 *
 * Travelers reach the review form two ways, and both end at the same verified
 * review — one completed booking, one review, exactly as if they had used the
 * post-trip email:
 *
 *   - A single-use invite token the platform mails after a trip. The token
 *     identifies the booking, so the traveler types nothing.
 *   - A supplier's durable share link (or printed QR). It identifies nobody on
 *     its own, so the traveler claims it with their booking reference and the
 *     last four digits of the phone number on that booking. A successful claim
 *     mints a single-use invite and the flow rejoins the first path.
 *
 * A signed-in traveler can also review straight from a share link with no
 * booking (reviewService.createShareLinkReview). Those reviews are shown but
 * never counted: ratings feed supplier ranking and dispatch, and a form a
 * supplier controls is exactly how fake reviews get made, so only the booking
 * paths above produce a rating.
 */
import crypto from "node:crypto";
import { nanoid } from "nanoid";

const inviteError = (message, status = 400) => Object.assign(new Error(message), { status });

/** How long a mailed invite stays valid. Long enough to survive a holiday. */
export const INVITE_TTL_DAYS = 30;

/** Claim attempts allowed per share link before it stops answering. */
export const MAX_CLAIM_ATTEMPTS_PER_WINDOW = 10;
const CLAIM_WINDOW_MINUTES = 15;

const INVITE_CHANNELS = new Set(["EMAIL", "WHATSAPP", "SMS", "QR", "LINK"]);

function tokenSecret() {
  return process.env.REVIEW_INVITE_SECRET || process.env.DOCUMENT_LINK_SECRET || process.env.JWT_SECRET
    || "idea-holiday-local-review-invite-secret-change-me";
}

/**
 * Only the hash is stored, so a leaked database row cannot be turned back into
 * a working review link.
 */
export function hashInviteToken(token) {
  return crypto.createHmac("sha256", tokenSecret()).update(String(token)).digest("hex");
}

function publicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || "https://ideaholiday.in").replace(/\/+$/, "");
}

export function inviteUrl(token) {
  return `${publicAppUrl()}/review/${token}`;
}

export function shareLinkUrl(slug) {
  return `${publicAppUrl()}/r/${slug}`;
}

function bookingForInvite(database, bookingRef) {
  return database.prepare(`
    SELECT b.*, p.title AS product_title, p.hero_image, s.company_name AS supplier_name,
      da.id AS driver_assignment_id, da.supplier_driver_id, da.driver_name, da.assignment_status
    FROM bookings b
    JOIN products p ON p.id = b.product_id
    JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN driver_assignments da ON da.booking_id = b.id
    WHERE b.id = ? OR b.ref = ?
  `).get(bookingRef, bookingRef);
}

// Timestamps are computed here, not with datetime('now', ?): the Postgres
// adapter cannot translate a modifier, so every invite insert failed in production.
const sqlTimestamp = (date) => date.toISOString().slice(0, 19).replace("T", " ");

function isCompleted(booking) {
  return String(booking.status || "").toLowerCase() === "completed"
    || String(booking.assignment_status || "").toUpperCase() === "COMPLETED";
}

/**
 * Issues a single-use invite for one completed booking.
 *
 * A booking that already has a review, or a live unused invite, is not issued a
 * second one — the existing token stays the only way in.
 *
 * @returns {{ token: string|null, url: string|null, invite: object, reused: boolean }}
 */
export function issueBookingInvite(database, { bookingId, channel = "EMAIL", createdBy = null, ttlDays = INVITE_TTL_DAYS }) {
  const booking = bookingForInvite(database, bookingId);
  if (!booking) throw inviteError("Booking not found", 404);
  if (!isCompleted(booking)) throw inviteError("A review invite is sent only after the trip is completed", 409);
  if (database.prepare("SELECT id FROM reviews WHERE booking_id = ?").get(booking.id)) {
    throw inviteError("This booking already has a review", 409);
  }

  const normalizedChannel = String(channel || "EMAIL").toUpperCase();
  if (!INVITE_CHANNELS.has(normalizedChannel)) throw inviteError("Unknown invite channel");

  // A live invite is reused rather than duplicated, so a resend does not
  // invalidate the link the traveler may already be holding.
  const existing = database.prepare(
    "SELECT * FROM review_invites WHERE booking_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
  ).get(booking.id, sqlTimestamp(new Date()));
  if (existing) return { token: null, url: null, invite: existing, reused: true };

  const token = `${nanoid(24)}`;
  const id = `rvi_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO review_invites (id, token_hash, booking_id, product_id, supplier_id, channel, created_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, hashInviteToken(token), booking.id, booking.product_id, booking.supplier_id,
    normalizedChannel, createdBy, sqlTimestamp(new Date(Date.now() + Math.max(1, Number(ttlDays) || INVITE_TTL_DAYS) * 86400000)));

  return {
    token,
    url: inviteUrl(token),
    invite: database.prepare("SELECT * FROM review_invites WHERE id = ?").get(id),
    reused: false,
  };
}

/**
 * Resolves a token to the booking it was issued for, and records the open.
 * Expired, spent and unknown tokens are all refused.
 */
export function resolveInvite(database, token, { markOpened = true } = {}) {
  const invite = database.prepare("SELECT * FROM review_invites WHERE token_hash = ?").get(hashInviteToken(token || ""));
  if (!invite) throw inviteError("This review link is not valid", 404);
  if (invite.used_at) throw inviteError("This review link has already been used", 409);
  if (new Date(`${invite.expires_at.replace(" ", "T")}Z`).getTime() < Date.now()) {
    throw inviteError("This review link has expired", 410);
  }

  const booking = bookingForInvite(database, invite.booking_id);
  if (!booking) throw inviteError("Booking not found", 404);
  if (database.prepare("SELECT id FROM reviews WHERE booking_id = ?").get(booking.id)) {
    throw inviteError("This booking already has a review", 409);
  }

  if (markOpened && !invite.opened_at) {
    database.prepare("UPDATE review_invites SET opened_at = datetime('now') WHERE id = ?").run(invite.id);
  }

  return { invite, booking };
}

/** Marks an invite spent and ties it to the review it produced. */
export function consumeInvite(database, inviteId, reviewId) {
  database.prepare("UPDATE review_invites SET used_at = datetime('now'), review_id = ? WHERE id = ? AND used_at IS NULL")
    .run(reviewId, inviteId);
}

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/**
 * Creates a durable share link for a supplier, optionally pinned to one of
 * their products. Slugs are readable enough to print under a QR code.
 */
export function createShareLink(database, { supplierId, productId = null, label = null, createdBy = null }) {
  const supplier = database.prepare("SELECT id, company_name FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw inviteError("Supplier not found", 404);

  if (productId) {
    const product = database.prepare("SELECT id, supplier_id FROM products WHERE id = ?").get(productId);
    if (!product) throw inviteError("Product not found", 404);
    if (product.supplier_id !== supplierId) throw inviteError("That listing belongs to another supplier", 403);
  }

  const base = normalizeSlug(String(supplier.company_name || "partner").split(/\s+/).slice(0, 2).join("-")) || "partner";
  const slug = `${base}-${nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
  const id = `rsl_${nanoid(12)}`;
  database.prepare(`
    INSERT INTO review_share_links (id, supplier_id, product_id, slug, label, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, supplierId, productId, slug, label ? String(label).slice(0, 120) : null, createdBy);

  return shareLinkDetails(database, id);
}

export function shareLinkDetails(database, id) {
  const row = database.prepare(`
    SELECT rsl.*, p.title AS product_title
    FROM review_share_links rsl LEFT JOIN products p ON p.id = rsl.product_id
    WHERE rsl.id = ?
  `).get(id);
  if (!row) throw inviteError("Share link not found", 404);
  return { ...row, url: shareLinkUrl(row.slug), is_active: Number(row.is_active) === 1 };
}

/**
 * A supplier's links with the funnel behind each one: how many people opened
 * it, how many proved a booking, and how many finished a review.
 */
export function listShareLinks(database, supplierId) {
  return database.prepare(`
    SELECT rsl.*, p.title AS product_title,
      (SELECT COUNT(*) FROM review_invites ri WHERE ri.share_link_id = rsl.id) AS invites_issued,
      (SELECT COUNT(*) FROM review_invites ri WHERE ri.share_link_id = rsl.id AND ri.used_at IS NOT NULL) AS reviews_submitted
    FROM review_share_links rsl
    LEFT JOIN products p ON p.id = rsl.product_id
    WHERE rsl.supplier_id = ?
    ORDER BY rsl.created_at DESC
  `).all(supplierId).map((row) => ({
    ...row,
    url: shareLinkUrl(row.slug),
    is_active: Number(row.is_active) === 1,
    invites_issued: Number(row.invites_issued || 0),
    reviews_submitted: Number(row.reviews_submitted || 0),
  }));
}

export function setShareLinkActive(database, { id, supplierId, isActive }) {
  const link = database.prepare("SELECT * FROM review_share_links WHERE id = ?").get(id);
  if (!link) throw inviteError("Share link not found", 404);
  if (link.supplier_id !== supplierId) throw inviteError("That link belongs to another supplier", 403);
  database.prepare("UPDATE review_share_links SET is_active = ? WHERE id = ?").run(isActive ? 1 : 0, id);
  return shareLinkDetails(database, id);
}

/**
 * Public view of a share link: enough to show the traveler who is asking for
 * the review, and nothing about anyone's bookings.
 */
export function resolveShareLink(database, slug, { countView = true } = {}) {
  const link = database.prepare(`
    SELECT rsl.*, s.company_name AS supplier_name, p.title AS product_title, p.hero_image
    FROM review_share_links rsl
    JOIN suppliers s ON s.id = rsl.supplier_id
    LEFT JOIN products p ON p.id = rsl.product_id
    WHERE rsl.slug = ?
  `).get(normalizeSlug(slug));
  if (!link) throw inviteError("This review link is not valid", 404);
  if (Number(link.is_active) !== 1) throw inviteError("This review link is no longer active", 410);

  if (countView) database.prepare("UPDATE review_share_links SET view_count = view_count + 1 WHERE id = ?").run(link.id);

  // A link for "any of my products" lets a signed-in traveler pick which one
  // they are reviewing without a booking; a pinned link needs no choice.
  const products = link.product_id ? [] : database.prepare(`
    SELECT id, title, hero_image FROM products
    WHERE supplier_id = ? AND status = 'PUBLISHED' ORDER BY title ASC LIMIT 100
  `).all(link.supplier_id).map((row) => ({ id: row.id, title: row.title, heroImage: row.hero_image || null }));

  return {
    slug: link.slug,
    supplierName: link.supplier_name,
    productId: link.product_id || null,
    productTitle: link.product_title || null,
    heroImage: link.hero_image || null,
    label: link.label || null,
    products,
  };
}

/** The active share link row behind a slug, for writing a review through it. */
export function activeShareLink(database, slug) {
  const link = database.prepare("SELECT * FROM review_share_links WHERE slug = ?").get(normalizeSlug(slug));
  if (!link) throw inviteError("This review link is not valid", 404);
  if (Number(link.is_active) !== 1) throw inviteError("This review link is no longer active", 410);
  return link;
}

const phoneDigits = (value) => String(value || "").replace(/\D/g, "");

/**
 * Claims a share link against a real booking.
 *
 * The traveler proves the booking is theirs with its reference plus the last
 * four digits of the phone number on it — the booking reference alone is
 * printed on vouchers and is not treated as a secret. Attempts are counted per
 * link so a reference cannot be guessed by brute force.
 *
 * @returns {{ token: string, url: string, booking: object }}
 */
export function claimShareLink(database, { slug, bookingRef, phoneLast4 }) {
  const link = database.prepare("SELECT * FROM review_share_links WHERE slug = ?").get(normalizeSlug(slug));
  if (!link) throw inviteError("This review link is not valid", 404);
  if (Number(link.is_active) !== 1) throw inviteError("This review link is no longer active", 410);

  const booking = bookingForInvite(database, String(bookingRef || "").trim().toUpperCase());
  const digits = phoneDigits(phoneLast4).slice(-4);

  // One generic failure for every mismatch: never reveal whether a booking
  // reference exists, which supplier it belongs to, or whose phone it carries.
  const refuse = () => inviteError("We could not match that booking reference. Check the reference and phone number on your confirmation.", 404);

  if (!booking) throw refuse();
  if (booking.supplier_id !== link.supplier_id) throw refuse();
  if (link.product_id && booking.product_id !== link.product_id) throw refuse();
  if (digits.length !== 4 || phoneDigits(booking.traveler_phone).slice(-4) !== digits) throw refuse();
  if (!isCompleted(booking)) throw inviteError("You can review this trip once it is completed", 409);
  if (database.prepare("SELECT id FROM reviews WHERE booking_id = ?").get(booking.id)) {
    throw inviteError("This booking already has a review", 409);
  }

  const issued = issueBookingInvite(database, { bookingId: booking.id, channel: "LINK", createdBy: `share:${link.id}` });
  let token = issued.token;

  if (issued.reused) {
    // A live invite already exists for this booking (the post-trip email, say).
    // Reissue rather than hand back a token we cannot recover: the traveler is
    // standing in front of the form now, and the old link becomes dead.
    database.prepare("UPDATE review_invites SET used_at = datetime('now') WHERE id = ?").run(issued.invite.id);
    token = issueBookingInvite(database, { bookingId: booking.id, channel: "LINK", createdBy: `share:${link.id}` }).token;
  }

  const invite = database.prepare("SELECT id FROM review_invites WHERE token_hash = ?").get(hashInviteToken(token));
  database.prepare("UPDATE review_invites SET share_link_id = ? WHERE id = ?").run(link.id, invite.id);
  database.prepare("UPDATE review_share_links SET claim_count = claim_count + 1 WHERE id = ?").run(link.id);

  return { token, url: inviteUrl(token), booking };
}

/** Invite funnel for one supplier, for the share panel in their dashboard. */
export function inviteStats(database, supplierId) {
  const row = database.prepare(`
    SELECT COUNT(*) AS issued,
      SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
      SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) AS submitted
    FROM review_invites WHERE supplier_id = ?
  `).get(supplierId) || {};
  const issued = Number(row.issued || 0);
  const submitted = Number(row.submitted || 0);
  return {
    issued,
    opened: Number(row.opened || 0),
    submitted,
    conversionPct: issued ? Math.round((submitted / issued) * 1000) / 10 : 0,
  };
}

export const CLAIM_RATE_LIMIT = { windowMinutes: CLAIM_WINDOW_MINUTES, max: MAX_CLAIM_ATTEMPTS_PER_WINDOW };
