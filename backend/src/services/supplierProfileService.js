import { nanoid } from "nanoid";
import { RATED_REVIEW_SOURCES } from "./reviewService.js";

/**
 * Public supplier profiles at /suppliers/<slug>.
 *
 * Everything a traveler, a crawler or a link preview sees about a supplier is
 * built here, from an explicit allow-list. The supplier row also holds contact
 * details, tax identifiers and bank details — none of that may ever leave
 * through this module, and `publicSupplierView` is tested for exactly that.
 *
 * Rules (docs/BUSINESS_RULES.md, "Supplier profiles"):
 *   - A profile is visible unless the supplier hid it, an admin suspended it,
 *     or the supplier's KYB is SUSPENDED.
 *   - A visible profile is indexable once KYB is APPROVED.
 *   - The Verified badge needs KYB APPROVED and an ACTIVE, unexpired
 *     `supplier_verifications` row. Nothing else turns it on.
 *   - Products are not shown on a profile until paid Spotlights exist.
 */

const RATED_SOURCES_SQL = RATED_REVIEW_SOURCES.map((value) => `'${value}'`).join(", ");
const profileError = (message, status = 400) => Object.assign(new Error(message), { status });

// "in" is taken by the city directory (/suppliers/in/<city>).
const RESERVED_SLUGS = new Set([
  "in", "new", "search", "admin", "api", "dashboard", "signup", "login", "me", "edit", "settings",
  "ideaholiday", "idea-holiday", "support", "help", "enquiries", "verified",
]);
const MAX_SLUG_LENGTH = 60;

export const PROFILE_STATUSES = new Set(["PUBLISHED", "HIDDEN", "SUSPENDED"]);

/**
 * What a Verified badge certifies. The first four are required for a grant;
 * the rest are recorded when they apply (not every operator has a tourism
 * registration, and only transfer operators have vehicle permits).
 */
export const VERIFICATION_CHECKS = {
  BUSINESS_IDENTITY: "Business identity (GSTIN or PAN)",
  BANK_ACCOUNT: "Bank account in the business name",
  BUSINESS_ADDRESS: "Business address",
  OWNER_CALL: "Call with the owner",
  TOURISM_REGISTRATION: "Tourism or trade registration",
  VEHICLE_PERMITS: "Commercial vehicle permits",
};
export const REQUIRED_VERIFICATION_CHECKS = ["BUSINESS_IDENTITY", "BANK_ACCOUNT", "BUSINESS_ADDRESS", "OWNER_CALL"];
export const VERIFICATION_VALIDITY_DAYS = 365;

const SOCIAL_HOSTS = {
  website: null,
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  youtube: ["youtube.com", "youtu.be"],
};

export function slugify(value) {
  const slug = String(value || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  return slug;
}

function parseList(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Contact details in free text are how a booking leaves the platform, so
 * profile text and enquiry messages refuse them outright rather than holding
 * them for moderation.
 */
export function containsContactDetails(text) {
  const value = String(text || "");
  if (/https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.]{2,}/i.test(value)) return true;
  // Ten or more digits, allowing spaces, dashes, dots and brackets between them.
  if (/(?:\d[\s\-().]*){10,}/.test(value)) return true;
  return /\b(?:whats\s?app|wa\.me|call me|call us|telegram)\b/i.test(value);
}

function isSlugTaken(database, slug, supplierId) {
  const owner = database.prepare("SELECT id FROM suppliers WHERE public_slug = ?").get(slug);
  if (owner && owner.id !== supplierId) return true;
  const history = database.prepare("SELECT supplier_id FROM supplier_slug_history WHERE old_slug = ?").get(slug);
  return Boolean(history && history.supplier_id !== supplierId);
}

function availableSlug(database, candidates, supplierId) {
  const bases = candidates.map(slugify).filter((slug) => slug && !RESERVED_SLUGS.has(slug));
  if (!bases.length) bases.push("operator");
  for (const base of bases) {
    if (!isSlugTaken(database, base, supplierId)) return base;
  }
  const base = bases[0];
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - String(suffix).length - 1)}-${suffix}`;
    if (!isSlugTaken(database, candidate, supplierId)) return candidate;
  }
  return `${base.slice(0, MAX_SLUG_LENGTH - 9)}-${nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "0")}`;
}

/** Gives a supplier its first slug: the business name, then name + city. */
export function ensurePublicSlug(database, supplier) {
  if (supplier.public_slug) return supplier.public_slug;
  const slug = availableSlug(database, [supplier.company_name, `${supplier.company_name} ${supplier.city || ""}`], supplier.id);
  database.prepare("UPDATE suppliers SET public_slug = ? WHERE id = ? AND public_slug IS NULL").run(slug, supplier.id);
  return database.prepare("SELECT public_slug FROM suppliers WHERE id = ?").get(supplier.id).public_slug;
}

export function backfillSupplierSlugs(database) {
  const missing = database.prepare("SELECT id, company_name, city, public_slug FROM suppliers WHERE public_slug IS NULL ORDER BY created_at ASC").all();
  for (const supplier of missing) ensurePublicSlug(database, supplier);
  return missing.length;
}

/**
 * Finds the supplier behind a slug. A slug the supplier used before resolves
 * to `{ redirectTo }` so the caller can answer with a 301.
 */
export function resolveProfileSlug(database, slug) {
  const normalized = String(slug || "").toLowerCase();
  if (!normalized) return null;
  const supplier = database.prepare("SELECT * FROM suppliers WHERE public_slug = ?").get(normalized);
  if (supplier) return { supplier };
  const history = database.prepare(`
    SELECT s.public_slug FROM supplier_slug_history h JOIN suppliers s ON s.id = h.supplier_id WHERE h.old_slug = ?
  `).get(normalized);
  return history?.public_slug ? { redirectTo: history.public_slug } : null;
}

export function isProfileVisible(supplier) {
  if (!supplier) return false;
  const status = String(supplier.profile_status || "PUBLISHED").toUpperCase();
  return status === "PUBLISHED" && String(supplier.kyb_status || "").toUpperCase() !== "SUSPENDED";
}

export function isProfileIndexable(supplier) {
  return isProfileVisible(supplier) && String(supplier.kyb_status || "").toUpperCase() === "APPROVED";
}

export function activeVerification(database, supplierId, now = new Date()) {
  return database.prepare(`
    SELECT * FROM supplier_verifications
    WHERE supplier_id = ? AND status = 'ACTIVE' AND valid_until > ?
    ORDER BY valid_until DESC LIMIT 1
  `).get(supplierId, now.toISOString()) || null;
}

export function deriveBadge(database, supplier, now = new Date()) {
  const verification = String(supplier?.kyb_status || "").toUpperCase() === "APPROVED"
    ? activeVerification(database, supplier.id, now)
    : null;
  if (!verification) return { status: "NOT_VERIFIED", verifiedAt: null, validUntil: null, checks: [] };
  return {
    status: "VERIFIED",
    verifiedAt: verification.valid_from,
    validUntil: verification.valid_until,
    checks: parseList(verification.checks).filter((code) => VERIFICATION_CHECKS[code]).map((code) => VERIFICATION_CHECKS[code]),
  };
}

/** Counted the same way as `suppliers.rating`: published, booking-verified reviews only. */
export function supplierRatingSummary(database, supplierId) {
  const row = database.prepare(`
    SELECT COUNT(*) AS count, AVG(supplier_rating) AS average FROM reviews
    WHERE supplier_id = ? AND status = 'PUBLISHED' AND source IN (${RATED_SOURCES_SQL})
  `).get(supplierId) || {};
  const count = Number(row.count || 0);
  return { count, average: count && row.average !== null ? Number(Number(row.average).toFixed(1)) : null };
}

function shortName(fullName) {
  const [first = "Traveler", second = ""] = String(fullName || "Traveler").trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
}

/**
 * Published reviews for the profile. Reviews left through a share link
 * without a booking are shown, marked as not counted. Product titles are left
 * out: a profile does not list products until they are paid for.
 */
export function publicSupplierReviews(database, supplierId, { page = 1, limit = 10 } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const safePage = Math.max(1, Number(page) || 1);
  const total = Number(database.prepare("SELECT COUNT(*) AS total FROM reviews WHERE supplier_id = ? AND status = 'PUBLISHED'").get(supplierId)?.total || 0);
  const rows = database.prepare(`
    SELECT r.id, r.supplier_rating, r.experience_rating, r.title, r.comment, r.source, r.created_at,
      r.supplier_response, r.supplier_responded_at, COALESCE(b.traveler_name, u.name) AS traveler_name
    FROM reviews r
    LEFT JOIN bookings b ON b.id = r.booking_id
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.supplier_id = ? AND r.status = 'PUBLISHED'
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(supplierId, safeLimit, (safePage - 1) * safeLimit);

  const photoStatement = database.prepare("SELECT photo_url FROM review_photos WHERE review_id = ? ORDER BY sort_order ASC");
  const reviews = rows.map((row) => {
    let photos = [];
    try { photos = photoStatement.all(row.id).map((photo) => photo.photo_url); } catch { photos = []; }
    return {
      id: row.id,
      rating: Number(row.supplier_rating ?? row.experience_rating) || null,
      title: row.title || null,
      comment: row.comment,
      travelerName: shortName(row.traveler_name),
      createdAt: row.created_at,
      countedInRating: RATED_REVIEW_SOURCES.includes(row.source),
      supplierResponse: row.supplier_response || null,
      supplierRespondedAt: row.supplier_responded_at || null,
      photos,
    };
  });
  return {
    reviews,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)), hasNext: safePage * safeLimit < total },
  };
}

function memberSinceYear(createdAt) {
  const year = new Date(String(createdAt || "").replace(" ", "T")).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

export function profilePath(slug) {
  return `/suppliers/${encodeURIComponent(slug)}`;
}

export function cityPath(city) {
  return `/suppliers/in/${slugify(city)}`;
}

/**
 * The only shape a supplier leaves the server in for anonymous viewers.
 * Add a field here deliberately — never spread the supplier row.
 */
export function publicSupplierView(database, supplier, { now = new Date() } = {}) {
  const slug = supplier.public_slug || ensurePublicSlug(database, supplier);
  return {
    slug,
    path: profilePath(slug),
    name: supplier.company_name,
    tagline: supplier.tagline || null,
    about: supplier.about || null,
    logoUrl: supplier.logo_url || null,
    coverUrl: supplier.cover_url || null,
    city: supplier.city || null,
    state: supplier.state || null,
    cityPath: supplier.city ? cityPath(supplier.city) : null,
    businessType: supplier.business_type || null,
    yearsInOperation: supplier.years_in_operation ? Number(supplier.years_in_operation) : null,
    memberSince: memberSinceYear(supplier.created_at),
    languages: parseList(supplier.languages),
    serviceCities: parseList(supplier.service_cities),
    // Only used for schema.org sameAs; the page does not render these.
    sameAs: Object.values(parseObject(supplier.social_links)).filter((url) => /^https:\/\//.test(String(url))),
    badge: deriveBadge(database, supplier, now),
    rating: supplierRatingSummary(database, supplier.id),
    indexable: isProfileIndexable(supplier),
  };
}

export function profileCompleteness(supplier) {
  const items = [
    ["logo", "Add a logo", Boolean(supplier.logo_url)],
    ["cover", "Add a cover photo", Boolean(supplier.cover_url)],
    ["tagline", "Write a one-line tagline", Boolean(supplier.tagline)],
    ["about", "Describe your business in at least 150 characters", String(supplier.about || "").length >= 150],
    ["languages", "List the languages your team speaks", parseList(supplier.languages).length > 0],
    ["serviceCities", "List the cities you operate in", parseList(supplier.service_cities).length > 0],
    ["years", "Add years in operation", Number(supplier.years_in_operation) > 0],
    ["social", "Link your website or Instagram", Object.keys(parseObject(supplier.social_links)).length > 0],
  ];
  const done = items.filter(([, , complete]) => complete).length;
  return {
    score: Math.round((done / items.length) * 100),
    missing: items.filter(([, , complete]) => !complete).map(([key, label]) => ({ key, label })),
  };
}

/** What the supplier's own profile editor loads. */
export function ownerProfileView(database, supplierId, { now = new Date() } = {}) {
  const supplier = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw profileError("Supplier not found", 404);
  ensurePublicSlug(database, supplier);
  const current = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  const latestVerification = database.prepare(`
    SELECT status, checks, valid_from, valid_until, decision_reason, updated_at FROM supplier_verifications
    WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(supplierId) || null;
  return {
    profile: {
      slug: current.public_slug,
      path: profilePath(current.public_slug),
      tagline: current.tagline || "",
      about: current.about || "",
      logoUrl: current.logo_url || "",
      coverUrl: current.cover_url || "",
      languages: parseList(current.languages),
      serviceCities: parseList(current.service_cities),
      socialLinks: parseObject(current.social_links),
      profileStatus: String(current.profile_status || "PUBLISHED").toUpperCase(),
    },
    publicView: publicSupplierView(database, current, { now }),
    visible: isProfileVisible(current),
    indexable: isProfileIndexable(current),
    kybStatus: current.kyb_status,
    completeness: profileCompleteness(current),
    verification: latestVerification ? {
      status: latestVerification.status,
      checks: parseList(latestVerification.checks),
      validFrom: latestVerification.valid_from,
      validUntil: latestVerification.valid_until,
      reason: latestVerification.decision_reason,
      updatedAt: latestVerification.updated_at,
    } : null,
  };
}

function cleanText(value, label, max) {
  const text = String(value ?? "").trim();
  if (text.length > max) throw profileError(`${label} must be ${max} characters or fewer`);
  if (text && containsContactDetails(text)) {
    throw profileError(`${label} can't include phone numbers, emails, links or WhatsApp. Travelers reach you through enquiries on Idea Holiday.`);
  }
  return text || null;
}

function cleanImageUrl(value, label) {
  const url = String(value ?? "").trim();
  if (!url) return null;
  if (!/^https:\/\/[^\s]+$/i.test(url) && !/^\/uploads\/[\w.-]+$/.test(url)) {
    throw profileError(`${label} must be an uploaded image or an https link`);
  }
  return url;
}

function cleanList(value, label, { maxItems, maxLength }) {
  if (!Array.isArray(value)) throw profileError(`${label} must be a list`);
  const items = [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  if (items.length > maxItems) throw profileError(`${label} can have at most ${maxItems} entries`);
  if (items.some((item) => item.length > maxLength)) throw profileError(`Each entry in ${label} must be ${maxLength} characters or fewer`);
  return JSON.stringify(items);
}

function cleanSocialLinks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw profileError("Social links must be an object");
  const links = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!(key in SOCIAL_HOSTS)) throw profileError(`Unknown social link: ${key}`);
    const url = String(raw || "").trim();
    if (!url) continue;
    let parsed;
    try { parsed = new URL(url); } catch { throw profileError(`Enter a full https link for ${key}`); }
    if (parsed.protocol !== "https:") throw profileError(`Enter a full https link for ${key}`);
    const hosts = SOCIAL_HOSTS[key];
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (hosts && !hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      throw profileError(`The ${key} link must point to ${hosts[0]}`);
    }
    links[key] = parsed.toString();
  }
  return JSON.stringify(links);
}

/**
 * Saves the supplier-editable profile fields. Fields that are not sent are
 * left alone. Contact details are refused in free text; a slug change keeps
 * the old slug as a redirect.
 */
export function updateSupplierProfile(database, supplierId, input = {}) {
  const supplier = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw profileError("Supplier not found", 404);

  const updates = {};
  if (input.tagline !== undefined) updates.tagline = cleanText(input.tagline, "Tagline", 120);
  if (input.about !== undefined) updates.about = cleanText(input.about, "About", 2000);
  if (input.logoUrl !== undefined) updates.logo_url = cleanImageUrl(input.logoUrl, "Logo");
  if (input.coverUrl !== undefined) updates.cover_url = cleanImageUrl(input.coverUrl, "Cover photo");
  if (input.languages !== undefined) updates.languages = cleanList(input.languages, "Languages", { maxItems: 10, maxLength: 40 });
  if (input.serviceCities !== undefined) updates.service_cities = cleanList(input.serviceCities, "Service cities", { maxItems: 30, maxLength: 80 });
  if (input.socialLinks !== undefined) updates.social_links = cleanSocialLinks(input.socialLinks);

  if (input.profileStatus !== undefined) {
    const status = String(input.profileStatus || "").toUpperCase();
    if (!["PUBLISHED", "HIDDEN"].includes(status)) throw profileError("Profile status must be PUBLISHED or HIDDEN");
    if (String(supplier.profile_status || "").toUpperCase() === "SUSPENDED") {
      throw profileError("Your profile was suspended by Idea Holiday. Contact support to restore it.", 409);
    }
    updates.profile_status = status;
  }

  const currentSlug = supplier.public_slug || ensurePublicSlug(database, supplier);
  let nextSlug = null;
  if (input.slug !== undefined) {
    const requested = slugify(input.slug);
    if (requested.length < 3) throw profileError("Profile link must be at least 3 letters or numbers");
    if (RESERVED_SLUGS.has(requested)) throw profileError("That profile link is reserved. Choose another.");
    if (requested !== currentSlug) {
      if (isSlugTaken(database, requested, supplierId)) throw profileError("That profile link is already taken", 409);
      nextSlug = requested;
    }
  }

  const columns = Object.keys(updates);
  if (!columns.length && !nextSlug) return ownerProfileView(database, supplierId);

  const save = database.transaction(() => {
    if (nextSlug) {
      // Reclaiming one of your own old slugs removes it from the redirect list.
      database.prepare("DELETE FROM supplier_slug_history WHERE old_slug = ? AND supplier_id = ?").run(nextSlug, supplierId);
      database.prepare("INSERT INTO supplier_slug_history (old_slug, supplier_id) VALUES (?, ?) ON CONFLICT(old_slug) DO NOTHING").run(currentSlug, supplierId);
      updates.public_slug = nextSlug;
    }
    const assignments = Object.keys(updates).map((column) => `${column} = ?`).join(", ");
    database.prepare(`UPDATE suppliers SET ${assignments}, profile_updated_at = datetime('now') WHERE id = ?`)
      .run(...Object.values(updates), supplierId);
  });
  save();
  return ownerProfileView(database, supplierId);
}

function verifiedSql() {
  return `(UPPER(COALESCE(s.kyb_status, '')) = 'APPROVED' AND EXISTS (
    SELECT 1 FROM supplier_verifications v WHERE v.supplier_id = s.id AND v.status = 'ACTIVE' AND v.valid_until > ?
  ))`;
}

const VISIBLE_SQL = "UPPER(COALESCE(s.profile_status, 'PUBLISHED')) = 'PUBLISHED' AND UPPER(COALESCE(s.kyb_status, '')) <> 'SUSPENDED'";

/**
 * The supplier directory: visible profiles, optionally filtered by a text
 * query, a city (home city or a listed service city) and the Verified badge.
 * Verified operators first, then those with more counted reviews.
 */
export function searchSupplierDirectory(database, { q = "", city = "", verified = false, page = 1, limit = 20, now = new Date() } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const nowIso = now.toISOString();
  const where = [VISIBLE_SQL];
  const params = [];

  const query = String(q || "").trim().toLowerCase().slice(0, 80);
  if (query) {
    where.push("(LOWER(s.company_name) LIKE ? OR LOWER(COALESCE(s.tagline, '')) LIKE ? OR LOWER(COALESCE(s.city, '')) LIKE ?)");
    const like = `%${query}%`;
    params.push(like, like, like);
  }
  const cityName = String(city || "").trim().toLowerCase().slice(0, 80);
  if (cityName) {
    where.push("(LOWER(COALESCE(s.city, '')) = ? OR LOWER(COALESCE(s.service_cities, '')) LIKE ?)");
    params.push(cityName, `%"${cityName}"%`);
  }
  if (verified) {
    where.push(verifiedSql());
    params.push(nowIso);
  }

  const whereSql = where.join(" AND ");
  const total = Number(database.prepare(`SELECT COUNT(*) AS total FROM suppliers s WHERE ${whereSql}`).get(...params)?.total || 0);
  const rows = database.prepare(`
    SELECT s.id, s.public_slug, s.company_name, s.tagline, s.city, s.state, s.logo_url, s.kyb_status, s.rating,
      COALESCE(q.review_count, 0) AS review_count,
      CASE WHEN ${verifiedSql()} THEN 1 ELSE 0 END AS is_badge_verified
    FROM suppliers s
    LEFT JOIN quality_scores q ON q.entity_type = 'SUPPLIER' AND q.entity_id = s.id
    WHERE ${whereSql}
    ORDER BY is_badge_verified DESC, review_count DESC, s.company_name ASC
    LIMIT ? OFFSET ?
  `).all(nowIso, ...params, safeLimit, (safePage - 1) * safeLimit);

  const suppliers = rows.map((row) => {
    const slug = row.public_slug || ensurePublicSlug(database, row);
    return {
      slug,
      path: profilePath(slug),
      name: row.company_name,
      tagline: row.tagline || null,
      city: row.city || null,
      state: row.state || null,
      logoUrl: row.logo_url || null,
      verified: Boolean(row.is_badge_verified),
      rating: { average: Number(row.review_count) > 0 && row.rating !== null ? Number(Number(row.rating).toFixed(1)) : null, count: Number(row.review_count || 0) },
    };
  });

  return {
    suppliers,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)), hasNext: safePage * safeLimit < total },
  };
}

/** Cities that have at least one visible profile, busiest first. */
export function directoryCities(database, { indexableOnly = false, limit = 100 } = {}) {
  const extra = indexableOnly ? " AND UPPER(COALESCE(s.kyb_status, '')) = 'APPROVED'" : "";
  return database.prepare(`
    SELECT s.city, MAX(s.state) AS state, COUNT(*) AS supplier_count
    FROM suppliers s
    WHERE ${VISIBLE_SQL}${extra} AND NULLIF(TRIM(COALESCE(s.city, '')), '') IS NOT NULL
    GROUP BY s.city
    ORDER BY supplier_count DESC, s.city ASC
    LIMIT ?
  `).all(Math.min(500, Math.max(1, Number(limit) || 100))).map((row) => ({
    city: row.city,
    state: row.state || null,
    slug: slugify(row.city),
    path: cityPath(row.city),
    supplierCount: Number(row.supplier_count || 0),
  }));
}

export function findDirectoryCity(database, citySlug) {
  const wanted = slugify(citySlug);
  if (!wanted) return null;
  return directoryCities(database, { limit: 500 }).find((entry) => entry.slug === wanted) || null;
}

/** Indexable profiles and the cities they are in, for sitemap-suppliers.xml. */
export function sitemapSupplierEntries(database) {
  const profiles = database.prepare(`
    SELECT s.id, s.public_slug, s.company_name, s.city, COALESCE(s.profile_updated_at, s.created_at) AS updated_at
    FROM suppliers s
    WHERE ${VISIBLE_SQL} AND UPPER(COALESCE(s.kyb_status, '')) = 'APPROVED'
    ORDER BY s.created_at ASC
  `).all().map((row) => ({
    path: profilePath(row.public_slug || ensurePublicSlug(database, row)),
    updatedAt: row.updated_at,
  }));
  return { profiles, cities: directoryCities(database, { indexableOnly: true, limit: 500 }) };
}

/**
 * Admin grant of the Verified badge, valid for a year. Requires KYB approval
 * and the four required checks; any active verification is superseded.
 */
export function grantSupplierVerification(database, supplierId, { checks = [], reason = null, actorId = null, now = new Date() } = {}) {
  const supplier = database.prepare("SELECT id, kyb_status FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw profileError("Supplier not found", 404);
  if (String(supplier.kyb_status || "").toUpperCase() !== "APPROVED") {
    throw profileError("Approve the supplier's KYB before granting the Verified badge", 409);
  }
  const codes = [...new Set((Array.isArray(checks) ? checks : []).map((code) => String(code).toUpperCase()))];
  const unknown = codes.filter((code) => !VERIFICATION_CHECKS[code]);
  if (unknown.length) throw profileError(`Unknown verification checks: ${unknown.join(", ")}`);
  const missing = REQUIRED_VERIFICATION_CHECKS.filter((code) => !codes.includes(code));
  if (missing.length) throw profileError(`Complete these checks first: ${missing.map((code) => VERIFICATION_CHECKS[code]).join(", ")}`);

  const validFrom = now.toISOString();
  const validUntil = new Date(now.getTime() + VERIFICATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const id = `sver_${nanoid(12)}`;
  const grant = database.transaction(() => {
    database.prepare("UPDATE supplier_verifications SET status = 'EXPIRED', updated_at = datetime('now') WHERE supplier_id = ? AND status = 'ACTIVE'").run(supplierId);
    database.prepare(`
      INSERT INTO supplier_verifications (id, supplier_id, status, checks, source, valid_from, valid_until, decided_by, decision_reason)
      VALUES (?, ?, 'ACTIVE', ?, 'ADMIN', ?, ?, ?, ?)
    `).run(id, supplierId, JSON.stringify(codes), validFrom, validUntil, actorId, String(reason || "").trim() || null);
  });
  grant();
  return database.prepare("SELECT * FROM supplier_verifications WHERE id = ?").get(id);
}

export function revokeSupplierVerification(database, supplierId, { reason, actorId = null } = {}) {
  const text = String(reason || "").trim();
  if (text.length < 5) throw profileError("Give a reason for removing the Verified badge");
  const result = database.prepare(`
    UPDATE supplier_verifications SET status = 'REVOKED', decision_reason = ?, decided_by = ?, updated_at = datetime('now')
    WHERE supplier_id = ? AND status = 'ACTIVE'
  `).run(text, actorId, supplierId);
  if (!result.changes) throw profileError("This supplier has no active verification", 404);
  return { revoked: result.changes };
}

/** Admin suspension hides the profile everywhere; lifting it republishes. */
export function setProfileSuspended(database, supplierId, { suspended, reason = null } = {}) {
  const supplier = database.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw profileError("Supplier not found", 404);
  if (suspended && String(reason || "").trim().length < 5) throw profileError("Give a reason for suspending the profile");
  database.prepare("UPDATE suppliers SET profile_status = ?, profile_updated_at = datetime('now') WHERE id = ?")
    .run(suspended ? "SUSPENDED" : "PUBLISHED", supplierId);
  return database.prepare("SELECT id, profile_status FROM suppliers WHERE id = ?").get(supplierId);
}
