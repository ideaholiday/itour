import logger from "../config/logger.js";
import { distanceMeters, estimateDrive } from "./driverLocationService.js";
import { drivingDistance, olaMapsConfigured } from "./olaMapsService.js";

/**
 * Time to reach a point, for the traveler tracking page.
 *
 * Ola Maps driving time is used when ETA_PROVIDER=ola and Ola credentials are
 * configured (Mappls with live traffic when ETA_PROVIDER=mappls and a Mappls key
 * is set); otherwise, or when the provider fails, a local estimate from
 * straight-line distance. Answers are cached for a minute per rounded
 * route so a page polling every 15 seconds costs at most one call a minute.
 */

const CACHE_MS = 60_000;
const cache = new Map();

function mapplsKey() {
  return process.env.MAPPLS_API_KEY || process.env.MAPMYINDIA_API_KEY || "";
}

async function mapplsEta(from, to, fetchImpl) {
  const origin = (process.env.MAPPLS_ORIGIN || "https://ideaholiday.in").replace(/\/$/, "");
  const url = `https://route.mappls.com/route/dm/distance_matrix_eta/driving/${from.lng},${from.lat};${to.lng},${to.lat}?access_token=${encodeURIComponent(mapplsKey())}&region=ind`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    // Static keys can be restricted to the registered web origin.
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Origin: origin, Referer: `${origin}/` } });
    if (!response.ok) throw new Error(`Mappls ETA returned ${response.status}`);
    const data = await response.json();
    const seconds = Number(data?.results?.durations?.[0]?.[1]);
    const meters = Number(data?.results?.distances?.[0]?.[1]);
    if (!Number.isFinite(seconds) || !Number.isFinite(meters)) throw new Error("Mappls ETA response had no duration");
    return { minutes: Math.max(1, Math.ceil(seconds / 60)), distanceM: Math.round(meters), source: "MAPPLS" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function tripEta(from, to, { now = Date.now(), fetchImpl = globalThis.fetch } = {}) {
  const straight = distanceMeters(from, to);
  if (straight === null) return null;
  if (straight < 75) return { minutes: 0, distanceM: straight, source: "NEARBY" };
  const key = [from.lat, from.lng, to.lat, to.lng].map((value) => Number(value).toFixed(3)).join(",");
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_MS) return cached.eta;

  let eta = null;
  const provider = String(process.env.ETA_PROVIDER || "").toLowerCase();
  if (provider === "ola" && olaMapsConfigured()) {
    try {
      const route = await drivingDistance(from, to, { fetchImpl });
      eta = { minutes: Math.max(1, Math.ceil(route.durationS / 60)), distanceM: Math.round(route.distanceM), source: "OLA" };
    } catch (error) {
      logger.warn("Ola Maps ETA failed; using the local estimate", { error: error.message });
    }
  }
  if (provider === "mappls" && mapplsKey()) {
    try {
      eta = await mapplsEta(from, to, fetchImpl);
    } catch (error) {
      logger.warn("Mappls ETA failed; using the local estimate", { error: error.message });
    }
  }
  if (!eta) eta = { ...estimateDrive(straight), source: "ESTIMATE" };
  cache.set(key, { at: now, eta });
  if (cache.size > 2_000) cache.delete(cache.keys().next().value);
  return eta;
}
