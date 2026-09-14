import { randomUUID } from "node:crypto";

/**
 * Ola Maps client: place search, geocoding, driving distance and raster map tiles.
 *
 * Server-side only. It authenticates with the OAuth client-credentials grant
 * (OLA_MAPS_CLIENT_ID / OLA_MAPS_CLIENT_SECRET); the bearer token is cached until
 * a minute before it expires and refreshed once on a 401. Nothing here reaches
 * the browser bundle: tiles are proxied through GET /api/maps/tiles.
 */

const API_BASE = "https://api.olamaps.io";
const TOKEN_URL = "https://account.olamaps.io/realms/olamaps/protocol/openid-connect/token";
const TILE_STYLE = "default-light-standard";
const TOKEN_FALLBACK_MS = 5 * 60_000;
const TOKEN_EARLY_REFRESH_MS = 60_000;

let cachedToken = null;
let pendingToken = null;

export class OlaMapsError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "OlaMapsError";
    this.status = status;
  }
}

export function olaMapsConfigured(env = process.env) {
  return Boolean(env.OLA_MAPS_CLIENT_ID && env.OLA_MAPS_CLIENT_SECRET);
}

/** Test hook: forget the cached bearer token. */
export function resetOlaMapsToken() {
  cachedToken = null;
  pendingToken = null;
}

function tokenExpiry(data, now) {
  if (Number.isFinite(Number(data.expires_in))) return now + Number(data.expires_in) * 1000;
  try {
    const payload = JSON.parse(Buffer.from(String(data.access_token).split(".")[1], "base64url").toString("utf8"));
    if (Number.isFinite(payload.exp)) return payload.exp * 1000;
  } catch {
    // Opaque token: fall through to the short default.
  }
  return now + TOKEN_FALLBACK_MS;
}

async function withTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function accessToken(fetchImpl, now = Date.now()) {
  if (cachedToken && now < cachedToken.expiresAt - TOKEN_EARLY_REFRESH_MS) return cachedToken.value;
  if (!olaMapsConfigured()) throw new OlaMapsError("Ola Maps is not configured", 503);
  pendingToken ||= (async () => {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "openid",
      client_id: process.env.OLA_MAPS_CLIENT_ID,
      client_secret: process.env.OLA_MAPS_CLIENT_SECRET,
    });
    const response = await withTimeout(fetchImpl, TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }, 8_000);
    if (!response.ok) throw new OlaMapsError(`Ola Maps token request returned ${response.status}`, response.status);
    const data = await response.json();
    if (!data.access_token) throw new OlaMapsError("Ola Maps token response had no access_token", 502);
    cachedToken = { value: data.access_token, expiresAt: tokenExpiry(data, Date.now()) };
    return cachedToken.value;
  })().finally(() => { pendingToken = null; });
  return pendingToken;
}

/** Authenticated request to api.olamaps.io; returns the raw Response. */
export async function olaRequest(path, { params = {}, fetchImpl = globalThis.fetch, timeoutMs = 8_000 } = {}) {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const send = async () => withTimeout(fetchImpl, url, {
    headers: { Authorization: `Bearer ${await accessToken(fetchImpl)}`, "X-Request-Id": randomUUID() },
  }, timeoutMs);
  let response = await send();
  if (response.status === 401) {
    cachedToken = null;
    response = await send();
  }
  if (!response.ok) throw new OlaMapsError(`Ola Maps ${url.pathname} returned ${response.status}`, response.status);
  return response;
}

async function olaJson(path, options) {
  return (await olaRequest(path, options)).json();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function point(geometry) {
  return { lat: numberOrNull(geometry?.location?.lat), lng: numberOrNull(geometry?.location?.lng) };
}

/** Place suggestions for a partial query, biased toward lat/lng when given. */
export async function autocompletePlaces(query, { lat = null, lng = null, fetchImpl } = {}) {
  const data = await olaJson("/places/v1/autocomplete", {
    params: { input: query, location: lat !== null && lng !== null ? `${lat},${lng}` : "" },
    fetchImpl,
  });
  return (data.predictions || []).map((prediction) => ({
    id: prediction.place_id || "",
    label: prediction.structured_formatting?.main_text || prediction.description || "",
    description: prediction.structured_formatting?.secondary_text || "",
    types: prediction.types || [],
    ...point(prediction.geometry),
  }));
}

/** Coordinates and formatted address of an Ola place id, or null. */
export async function placeDetails(placeId, { fetchImpl } = {}) {
  const data = await olaJson("/places/v1/details", { params: { place_id: placeId }, fetchImpl });
  const result = data.result;
  if (!result) return null;
  return { id: result.place_id || placeId, label: result.name || "", address: result.formatted_address || "", types: result.types || [], ...point(result.geometry) };
}

/** Best match for a free-text address, or null. */
export async function geocodeAddress(address, { fetchImpl } = {}) {
  const data = await olaJson("/places/v1/geocode", { params: { address, language: "English" }, fetchImpl });
  const result = data.geocodingResults?.[0];
  if (!result) return null;
  return { id: result.place_id || "", label: result.name || "", address: result.formatted_address || "", types: result.types || [], ...point(result.geometry) };
}

/** Street address of a coordinate, or an empty string when Ola has none. */
export async function reverseGeocode(lat, lng, { fetchImpl } = {}) {
  const data = await olaJson("/places/v1/reverse-geocode", { params: { latlng: `${lat},${lng}` }, fetchImpl });
  return data.results?.[0]?.formatted_address || "";
}

/** Driving distance (metres) and time (seconds) between two points. */
export async function drivingDistance(from, to, { fetchImpl, timeoutMs = 5_000 } = {}) {
  const data = await olaJson("/routing/v1/distanceMatrix/basic", {
    params: { origins: `${from.lat},${from.lng}`, destinations: `${to.lat},${to.lng}` },
    fetchImpl,
    timeoutMs,
  });
  const element = data.rows?.[0]?.elements?.[0];
  const distanceM = Number(element?.distance);
  const durationS = Number(element?.duration);
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationS) || (element.status && element.status !== "OK")) {
    throw new OlaMapsError("Ola Maps distance matrix had no route", 502);
  }
  return { distanceM, durationS };
}

/** One 256px PNG map tile. */
export async function mapTile(z, x, y, { fetchImpl } = {}) {
  const response = await olaRequest(`/tiles/v1/styles/${TILE_STYLE}/${z}/${x}/${y}.png`, { fetchImpl, timeoutMs: 10_000 });
  return Buffer.from(await response.arrayBuffer());
}
