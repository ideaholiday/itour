/**
 * Referral attribution, browser side.
 *
 * The browser's job here is small and deliberately so: mint a stable visitor
 * token, tell the server when a referral link is opened, and hand that token
 * back at checkout. The server owns the actual attribution — which creator gets
 * the booking, and for how long a click keeps counting — because a value the
 * browser can edit must never decide who gets paid.
 */

const VISITOR_KEY = "ih_visitor_id";
const ATTRIBUTION_KEY = "ih_affiliate_attribution";

/** Mirrors the server's default window; only ever used to stop showing a stale banner. */
const FALLBACK_WINDOW_DAYS = 30;

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing, or storage is full. Attribution degrades, nothing breaks. */
  }
}

/**
 * A stable, anonymous token for this browser. It identifies a visitor to the
 * attribution table and nothing else — no personal data goes into it.
 */
export function getVisitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;

    const minted = (globalThis.crypto?.randomUUID?.()
      || `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
    localStorage.setItem(VISITOR_KEY, minted);
    return minted;
  } catch {
    return null;
  }
}

/**
 * The referral this browser is currently carrying, if it has not expired.
 * Expired entries are cleared so the UI stops claiming a discount that the
 * server will no longer honour.
 */
export function getStoredAttribution() {
  const stored = readJson(ATTRIBUTION_KEY);
  if (!stored?.code) return null;

  if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) {
    try {
      localStorage.removeItem(ATTRIBUTION_KEY);
    } catch { /* ignore */ }
    return null;
  }

  return stored;
}

export function getStoredAffiliateCode() {
  return getStoredAttribution()?.code || null;
}

/**
 * Pull `?ref=CODE` (or `?aff=`) and the creator's own `?sub=` campaign label out
 * of a URL. `REF-` codes belong to the traveler-to-traveler referral scheme, not
 * the creator program, so they are left alone.
 */
export function parseReferralParams(search) {
  const params = new URLSearchParams(search || "");
  const raw = params.get("ref") || params.get("aff");
  if (!raw) return null;

  const code = raw.trim().toUpperCase();
  if (!code || code.startsWith("REF-")) return null;

  const subId = params.get("sub") || params.get("subid") || params.get("utm_content");
  return { code, subId: subId ? subId.trim().slice(0, 64) : null };
}

/**
 * Record a referral click. The server decides the window and returns when it
 * expires; we keep only enough to show the traveler which creator sent them.
 */
export async function captureReferral(api, { code, subId, path, referrer }) {
  const visitorId = getVisitorId();

  writeJson(ATTRIBUTION_KEY, {
    code,
    subId: subId || null,
    visitorId,
    capturedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + FALLBACK_WINDOW_DAYS * 86400000).toISOString(),
  });

  try {
    const result = await api.trackAffiliateClick({
      affiliateCode: code,
      visitorId,
      subId: subId || null,
      destinationPath: path || "/",
      referrerUrl: referrer || "",
    });

    if (result?.attributionExpiresAt) {
      writeJson(ATTRIBUTION_KEY, {
        code,
        subId: subId || null,
        visitorId,
        capturedAt: new Date().toISOString(),
        expiresAt: new Date(`${result.attributionExpiresAt.replace(" ", "T")}Z`).toISOString(),
      });
    }
    return result;
  } catch {
    // A failed tracking call must never block the page the traveler came to see.
    return null;
  }
}

/**
 * The fields a booking request carries so the server can look up this visitor's
 * attribution. The code rides along for logging only — the server does not
 * trust it on its own.
 */
export function getBookingAttributionFields() {
  const stored = getStoredAttribution();
  const visitorId = getVisitorId();
  if (!visitorId) return {};

  return {
    visitor_id: visitorId,
    ...(stored?.code ? { affiliate_code: stored.code } : {}),
    ...(stored?.subId ? { affiliate_sub_id: stored.subId } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Traveler referrals (Travel & Earn)                                          */
/* -------------------------------------------------------------------------- */

const TRAVELER_REFERRAL_KEY = "ih_traveler_referral";

/** `?ref=REF-…` — a traveler's own invite link, as opposed to a creator's. */
export function parseTravelerReferralParams(search) {
  const params = new URLSearchParams(search || "");
  const code = String(params.get("ref") || params.get("referral") || "").trim().toUpperCase();
  if (!code.startsWith("REF-")) return null;
  const channel = String(params.get("ch") || "").trim().toUpperCase();
  return { code, channel: channel || null };
}

/** The traveler referral this browser is carrying, while its window is open. */
export function getStoredTravelerReferralCode() {
  const stored = readJson(TRAVELER_REFERRAL_KEY);
  if (!stored?.code) return null;
  if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) {
    try {
      localStorage.removeItem(TRAVELER_REFERRAL_KEY);
    } catch { /* ignore */ }
    return null;
  }
  return stored.code;
}

/**
 * Tell the server a friend's invite link was opened. The server keeps the
 * referral alive until signup even if this browser's storage is cleared.
 */
export async function captureTravelerReferral(api, { code, channel, path }) {
  const visitorId = getVisitorId();
  writeJson(TRAVELER_REFERRAL_KEY, {
    code,
    expiresAt: new Date(Date.now() + FALLBACK_WINDOW_DAYS * 86400000).toISOString(),
  });
  if (!visitorId) return null;
  try {
    const result = await api.trackReferralClick({ referralCode: code, visitorId, channel: channel || null, landingPath: path || "/" });
    if (result?.attributionExpiresAt) {
      writeJson(TRAVELER_REFERRAL_KEY, {
        code,
        expiresAt: new Date(`${String(result.attributionExpiresAt).replace(" ", "T")}Z`).toISOString(),
      });
    }
    return result;
  } catch {
    return null;
  }
}

export function clearStoredTravelerReferral() {
  try {
    localStorage.removeItem(TRAVELER_REFERRAL_KEY);
  } catch { /* ignore */ }
}
