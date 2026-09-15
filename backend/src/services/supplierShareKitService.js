/**
 * Supplier share kit (ROADMAP NEXT #3): QR codes, printable standee and
 * sticker sheets, a QR on vouchers, and an embeddable review widget.
 *
 * Everything points through `/go/s/<slug>`, which records one scan row
 * (target and channel, nothing about the visitor) and redirects to the public
 * profile or to one of the supplier's review share links. The review path is
 * the existing verified one: a review still needs a completed booking.
 *
 * See docs/SHARE_KIT.md and migrations/044_supplier_share_kit.sql.
 */
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import logger from "../config/logger.js";
import { createShareLink, shareLinkUrl } from "./reviewInviteService.js";
import {
  deriveBadge, isProfileVisible, profilePath, publicSupplierReviews, resolveProfileSlug, supplierRatingSummary,
} from "./supplierProfileService.js";

export const SHARE_TARGETS = ["PROFILE", "REVIEW"];
export const SHARE_CHANNELS = ["QR", "STANDEE", "STICKER", "VOUCHER", "WIDGET", "LINK"];

function shareError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
}

export function publicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || "https://ideaholiday.in").replace(/\/+$/, "");
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

export function normalizeTarget(value) {
  const target = String(value || "PROFILE").toUpperCase();
  return SHARE_TARGETS.includes(target) ? target : "PROFILE";
}

export function normalizeChannel(value) {
  const channel = String(value || "LINK").toUpperCase();
  return SHARE_CHANNELS.includes(channel) ? channel : "LINK";
}

/** The tracked link a QR or print piece encodes. */
export function trackedShareUrl(slug, { target = "PROFILE", channel = "QR" } = {}) {
  return `${publicAppUrl()}/go/s/${encodeURIComponent(slug)}?t=${normalizeTarget(target).toLowerCase()}&c=${normalizeChannel(channel).toLowerCase()}`;
}

/** A visible supplier behind a slug (current or old), or null. */
function visibleSupplier(database, slug) {
  const resolved = resolveProfileSlug(database, slug);
  const supplier = resolved?.supplier
    || (resolved?.redirectTo ? database.prepare("SELECT * FROM suppliers WHERE public_slug = ?").get(resolved.redirectTo) : null);
  return supplier && isProfileVisible(supplier) ? supplier : null;
}

/** The supplier's newest active review share link, if any. */
function activeReviewLink(database, supplierId) {
  return database.prepare("SELECT * FROM review_share_links WHERE supplier_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1").get(supplierId) || null;
}

/**
 * Handles a visit through `/go/s/<slug>`: records the scan and returns where to
 * send the visitor. A review target without an active review link falls back
 * to the profile. An unknown or hidden supplier returns null.
 */
export function recordShareVisit(database, slug, { target, channel } = {}) {
  const supplier = visibleSupplier(database, slug);
  if (!supplier) return null;
  let resolvedTarget = normalizeTarget(target);
  const link = resolvedTarget === "REVIEW" ? activeReviewLink(database, supplier.id) : null;
  if (resolvedTarget === "REVIEW" && !link) resolvedTarget = "PROFILE";
  try {
    database.prepare("INSERT INTO supplier_share_scans (id, supplier_id, target, channel, share_link_id) VALUES (?, ?, ?, ?, ?)")
      .run(`scan_${nanoid(12)}`, supplier.id, resolvedTarget, normalizeChannel(channel), link?.id || null);
  } catch (error) {
    // A lost count must never break the visitor's redirect.
    logger.warn("Share scan was not recorded", { supplierId: supplier.id, error: error.message });
  }
  return resolvedTarget === "REVIEW" ? shareLinkUrl(link.slug) : `${publicAppUrl()}${profilePath(supplier.public_slug)}`;
}

export async function shareQrSvg(url) {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
}

export async function shareQrPng(url) {
  return QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 1024 });
}

/** QR image for a public slug; throws 404 when there is no visible supplier. */
export async function shareQrForSlug(database, slug, { target, channel, format = "svg" }) {
  const supplier = visibleSupplier(database, slug);
  if (!supplier) throw shareError("Supplier not found", 404);
  const url = trackedShareUrl(supplier.public_slug, { target, channel });
  return format === "png" ? shareQrPng(url) : shareQrSvg(url);
}

/**
 * What the supplier's share-kit screen needs: its links, a review link (made on
 * first use), scan counts, and the widget embed code.
 */
export function supplierShareKit(database, supplierId, { actorId = null, now = new Date() } = {}) {
  const supplier = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw shareError("Supplier not found", 404);
  if (!supplier.public_slug) throw shareError("Your public profile link is not ready yet", 409, "NO_PROFILE_LINK");
  let reviewLink = activeReviewLink(database, supplierId);
  if (!reviewLink) {
    const created = createShareLink(database, { supplierId, label: "Share kit", createdBy: actorId });
    reviewLink = database.prepare("SELECT * FROM review_share_links WHERE id = ?").get(created.id);
  }
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const rows = database.prepare(`
    SELECT target, channel, COUNT(*) AS total, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last30
    FROM supplier_share_scans WHERE supplier_id = ? GROUP BY target, channel ORDER BY target, channel
  `).all(since, supplierId);
  const base = publicAppUrl();
  const slug = encodeURIComponent(supplier.public_slug);
  return {
    slug: supplier.public_slug,
    visible: isProfileVisible(supplier),
    profileUrl: `${base}${profilePath(supplier.public_slug)}`,
    reviewLinkUrl: shareLinkUrl(reviewLink.slug),
    links: Object.fromEntries(SHARE_TARGETS.map((target) => [target.toLowerCase(), {
      tracked: trackedShareUrl(supplier.public_slug, { target, channel: "LINK" }),
      qrSvg: `/api/share/s/${slug}/qr.svg?t=${target.toLowerCase()}&c=qr`,
      qrPng: `/api/share/s/${slug}/qr.png?t=${target.toLowerCase()}&c=qr`,
      standee: `/api/share/s/${slug}/print?format=standee&t=${target.toLowerCase()}`,
      sticker: `/api/share/s/${slug}/print?format=sticker&t=${target.toLowerCase()}`,
    }])),
    widgetUrl: `${base}/api/share/s/${slug}/widget`,
    embedCode: `<iframe src="${base}/api/share/s/${slug}/widget" title="${escapeHtml(supplier.company_name)} reviews on Idea Holiday" width="100%" height="420" style="border:0;max-width:480px" loading="lazy"></iframe>`,
    scans: rows.map((row) => ({ target: row.target, channel: row.channel, total: Number(row.total), last30Days: Number(row.last30 || 0) })),
  };
}

function qrPathSvg(url, size = 240) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const modules = qr.modules.size;
  let path = "";
  for (let y = 0; y < modules; y++) for (let x = 0; x < modules; x++) if (qr.modules.get(y, x)) path += `M${x + 2} ${y + 2}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${modules + 4} ${modules + 4}" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

/**
 * A print-ready page (A5 standee or 3-inch sticker). The browser's Print → Save
 * as PDF produces the PDF, so no PDF library is needed.
 */
export function renderSharePrintSheet(database, slug, { format = "standee", target = "profile", now = new Date() } = {}) {
  const supplier = visibleSupplier(database, slug);
  if (!supplier) throw shareError("Supplier not found", 404);
  const sticker = String(format).toLowerCase() === "sticker";
  const review = normalizeTarget(target) === "REVIEW";
  const url = trackedShareUrl(supplier.public_slug, { target: review ? "REVIEW" : "PROFILE", channel: sticker ? "STICKER" : "STANDEE" });
  const badge = deriveBadge(database, supplier, now);
  const heading = review ? "Enjoyed your trip? Leave us a review" : "Find us on Idea Holiday";
  const sub = review ? "Scan with your phone camera. It takes a minute and helps other travelers." : "Scan to see our profile, reviews and how to book.";
  const page = sticker
    ? "@page{size:3in 3in;margin:0}.sheet{width:3in;height:3in;padding:0.18in}.qr svg{width:1.9in;height:1.9in}h1{font-size:12pt}p{font-size:7pt}"
    : "@page{size:A5 portrait;margin:0}.sheet{width:148mm;height:210mm;padding:14mm}.qr svg{width:90mm;height:90mm}h1{font-size:22pt}p{font-size:11pt}";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(supplier.company_name)} ${sticker ? "sticker" : "standee"}</title>
<style>${page}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1c1917;background:#f5f5f4}.sheet{margin:0 auto;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4mm}h1{margin:0;line-height:1.15}p{margin:0;color:#57534e}.name{font-weight:700;font-size:1.1em}.badge{display:inline-block;border-radius:999px;padding:1mm 3mm;font-size:0.8em;font-weight:700;background:${badge.status === "VERIFIED" ? "#d1fae5;color:#065f46" : "#f5f5f4;color:#57534e"}}.brand{font-weight:800;color:#b45309}.hint{font-size:0.75em;color:#78716c}@media screen{body{padding:16px}.print{display:block;margin:12px auto;font:600 14px system-ui;padding:8px 16px}}@media print{body{background:#fff}.print{display:none}}</style></head>
<body><button class="print" onclick="window.print()">Print or save as PDF</button><div class="sheet">
<h1>${escapeHtml(heading)}</h1>
<div class="qr">${qrPathSvg(url)}</div>
<div class="name">${escapeHtml(supplier.company_name)}</div>
${badge.status === "VERIFIED" ? '<span class="badge">Verified by Idea Holiday</span>' : ""}
<p>${escapeHtml(sub)}</p>
<p class="brand">ideaholiday.in</p>
</div></body></html>`;
}

/**
 * The embeddable review widget: rating, the latest reviews, and a tracked link
 * to the full profile. Rendered for an iframe on the supplier's own website.
 */
export function renderReviewWidget(database, slug, { now = new Date() } = {}) {
  const supplier = visibleSupplier(database, slug);
  if (!supplier) throw shareError("Supplier not found", 404);
  const rating = supplierRatingSummary(database, supplier.id);
  const { reviews } = publicSupplierReviews(database, supplier.id, { limit: 3 });
  const badge = deriveBadge(database, supplier, now);
  const stars = (value) => "★★★★★".slice(0, Math.round(value)) + "☆☆☆☆☆".slice(0, 5 - Math.round(value));
  const profileLink = trackedShareUrl(supplier.public_slug, { target: "PROFILE", channel: "WIDGET" });
  const items = reviews.map((review) => `<li><div class="top"><span class="stars" aria-label="${review.rating} out of 5">${stars(review.rating || 0)}</span><span class="who">${escapeHtml(review.travelerName)}</span></div>${review.title ? `<strong>${escapeHtml(review.title)}</strong>` : ""}<p>${escapeHtml(String(review.comment || "").slice(0, 220))}${String(review.comment || "").length > 220 ? "…" : ""}</p>${review.countedInRating ? "" : '<span class="note">Not counted in the rating</span>'}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(supplier.company_name)} reviews</title>
<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1c1917;background:#fff}.w{border:1px solid #e7e5e4;border-radius:14px;padding:14px}h1{font-size:15px;margin:0}.meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px;font-size:13px;color:#57534e}.stars{color:#d97706;letter-spacing:1px}.badge{border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700;background:#d1fae5;color:#065f46}ul{list-style:none;margin:12px 0 0;padding:0}li{border-top:1px solid #f5f5f4;padding:10px 0;font-size:13px}.top{display:flex;justify-content:space-between;gap:8px}.who{color:#78716c;font-size:12px}p{margin:4px 0 0;color:#44403c}.note{font-size:11px;color:#a8a29e}a{display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:#b45309;text-decoration:none}</style></head>
<body><div class="w"><h1>${escapeHtml(supplier.company_name)}</h1>
<div class="meta">${rating.count ? `<span class="stars">${stars(rating.average)}</span><span>${rating.average} from ${rating.count} verified review${rating.count === 1 ? "" : "s"}</span>` : "<span>No verified reviews yet</span>"}${badge.status === "VERIFIED" ? '<span class="badge">Verified</span>' : ""}</div>
${items ? `<ul>${items}</ul>` : ""}
<a href="${escapeHtml(profileLink)}" target="_blank" rel="noopener">See all reviews on Idea Holiday →</a></div></body></html>`;
}
