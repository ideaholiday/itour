// Which ad, post or link brought a visitor: UTM tags plus Google and Meta click
// ids. Analytics keeps the last campaign for 30 days and sends it with signups
// and purchases, so an Instagram post that leads to a booking days later still
// gets the credit.

const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];
export const CAMPAIGN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The campaign fields in a query string, or null when it has none. */
export function parseCampaignParams(search) {
  const params = new URLSearchParams(search || "");
  const campaign = {};
  for (const key of CAMPAIGN_KEYS) {
    const value = String(params.get(key) || "").trim().slice(0, 200);
    if (value) campaign[key] = value;
  }
  return Object.keys(campaign).length ? campaign : null;
}

/** A stored campaign still within its 30 days, or null. */
export function activeCampaign(stored, now = Date.now()) {
  if (!stored || typeof stored !== "object" || !Number.isFinite(stored.capturedAt)) return null;
  if (now - stored.capturedAt > CAMPAIGN_TTL_MS) return null;
  const { capturedAt: _capturedAt, ...campaign } = stored;
  return Object.keys(campaign).length ? campaign : null;
}
