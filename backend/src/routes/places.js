import { Router } from "express";
import { rankSuggestions } from "../lib/placeRanking.js";
import logger from "../config/logger.js";

const router = Router();

const MAPPLS_BASE = "https://search.mappls.com/search";
const PLACE_DETAILS_BASE = "https://place.mappls.com/O2O/entity/place-details";
const MAPPLS_ORIGIN = (process.env.MAPPLS_ORIGIN || "https://ideaholiday.in").replace(/\/$/, "");

function getApiKey() {
  return process.env.MAPPLS_API_KEY || process.env.MAPMYINDIA_API_KEY || "";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function categoryFor(place = {}) {
  const value = `${place.type || ""} ${place.placeName || ""} ${place.placeAddress || ""}`.toLowerCase();
  if (/airport|airfield|terminal/.test(value)) return "Airports";
  if (/hotel|resort|lodging|hostel|guest house|homestay/.test(value)) return "Hotels & Resorts";
  if (/city|locality|district|state|village/.test(value)) return "Cities & Areas";
  return "Landmarks & Addresses";
}

function normalizeSuggestion(place = {}) {
  const lat = numberOrNull(place.latitude ?? place.lat ?? place.entryLatitude ?? place.entry_lat);
  const lng = numberOrNull(place.longitude ?? place.lng ?? place.lon ?? place.entryLongitude ?? place.entry_lon);
  return {
    id: place.eLoc || place.mapplsPin || place.placeId || "",
    label: place.placeName || place.name || place.poi || "Unnamed place",
    description: place.placeAddress || place.address || "",
    category: categoryFor(place),
    lat,
    lng,
  };
}

function isIndiaCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
}

async function mapplsFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    // Mappls static keys can be restricted to a web domain. These requests are
    // proxied by our backend, so preserve the registered production origin.
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Origin: MAPPLS_ORIGIN,
        Referer: `${MAPPLS_ORIGIN}/`,
      },
    });
    if (!response.ok) throw new Error(`Mappls returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function geocodeAddress(address, apiKey) {
  const url = new URL(`${MAPPLS_BASE}/address/geocode`);
  url.searchParams.set("address", address.slice(0, 255));
  url.searchParams.set("itemCount", "1");
  url.searchParams.set("region", "IND");
  url.searchParams.set("access_token", apiKey);
  const data = await mapplsFetch(url);
  const place = data.copResults?.[0] || data.results?.[0] || data.response?.[0];
  if (!place) return null;
  const normalized = normalizeSuggestion(place);
  return normalized.lat !== null && normalized.lng !== null ? normalized : null;
}

// GET /api/places?query=...&lat=...&lng=...
router.get("/places", async (req, res) => {
  const query = String(req.query.query || "").trim();
  if (query.length < 2) return res.json({ success: true, suggestions: [], provider: "mappls" });

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      suggestions: [],
      code: "MAPPLS_NOT_CONFIGURED",
      error: "Location search is not configured. Use your current location or set the pin on the map.",
    });
  }

  try {
    const url = new URL(`${MAPPLS_BASE}/places/autosuggest/json`);
    url.searchParams.set("query", query.slice(0, 80));
    url.searchParams.set("region", "IND");
    url.searchParams.set("access_token", apiKey);
    const biasLat = Number(req.query.lat);
    const biasLng = Number(req.query.lng);
    if (isIndiaCoordinate(biasLat, biasLng)) {
      url.searchParams.set("location", `${biasLat},${biasLng}`);
      url.searchParams.set("hyperLocal", "");
    }

    const data = await mapplsFetch(url);
    const combined = [...(data.suggestedLocations || []), ...(data.userAddedLocations || [])];
    const seen = new Set();
    const normalized = combined
      .map(normalizeSuggestion)
      .filter((place) => {
        if (!place.id || !place.label || seen.has(place.id)) return false;
        seen.add(place.id);
        return true;
      });
    const suggestions = rankSuggestions(normalized, {
      query,
      context: String(req.query.context || "").slice(0, 160),
      lat: isIndiaCoordinate(biasLat, biasLng) ? biasLat : null,
      lng: isIndiaCoordinate(biasLat, biasLng) ? biasLng : null,
    }).slice(0, 8);

    res.set("Cache-Control", "private, max-age=300");
    return res.json({ success: true, suggestions, provider: "mappls" });
  } catch (error) {
    logger.error("Mappls autosuggest failed", { requestId: req.requestId, error });
    return res.status(502).json({ success: false, suggestions: [], error: "Location search is temporarily unavailable. You can still set the pin manually." });
  }
});

// Resolve an eLoc/Mappls Pin into coordinates. Address geocoding is used when
// the account's autosuggest response does not include coordinate fields.
router.get("/places/resolve", async (req, res) => {
  const apiKey = getApiKey();
  const placeId = String(req.query.placeId || "").trim();
  const address = String(req.query.address || "").trim();
  if (!apiKey) return res.status(503).json({ success: false, error: "Location search is not configured." });
  if (!placeId && address.length < 3) return res.status(400).json({ success: false, error: "Choose a valid place." });

  try {
    let location = null;
    let resolvedAddress = address;
    if (placeId) {
      const url = new URL(`${PLACE_DETAILS_BASE}/${encodeURIComponent(placeId)}`);
      url.searchParams.set("access_token", apiKey);
      const data = await mapplsFetch(url);
      resolvedAddress = data.address || [data.name, address].filter(Boolean).join(", ");
      const normalized = normalizeSuggestion({ ...data, eLoc: data.eLoc || data.eloc || placeId });
      if (normalized.lat !== null && normalized.lng !== null) location = normalized;
    }
    if (!location && address) location = await geocodeAddress(address, apiKey);
    if (!location) {
      return res.json({
        success: true,
        location: {
          id: placeId,
          address: resolvedAddress || address,
          lat: null,
          lng: null,
          requiresPin: true,
        },
      });
    }
    return res.json({ success: true, location: { ...location, id: location.id || placeId } });
  } catch (error) {
    logger.error("Mappls place resolution failed", { requestId: req.requestId, error });
    return res.status(502).json({ success: false, error: "We could not confirm this map point. Try another result or set the pin manually." });
  }
});

router.get("/places/reverse", async (req, res) => {
  const apiKey = getApiKey();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!apiKey) return res.status(503).json({ success: false, error: "Location search is not configured." });
  if (!isIndiaCoordinate(lat, lng)) return res.status(400).json({ success: false, error: "Choose a point within India." });

  try {
    const url = new URL(`${MAPPLS_BASE}/address/rev-geocode`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lng", String(lng));
    url.searchParams.set("region", "IND");
    url.searchParams.set("access_token", apiKey);
    const data = await mapplsFetch(url);
    const place = data.results?.[0];
    const address = place?.formatted_address || [place?.poi, place?.street, place?.locality, place?.city, place?.state, place?.pincode].filter(Boolean).join(", ");
    return res.json({ success: true, location: { address: address || `Pinned location (${lat.toFixed(6)}, ${lng.toFixed(6)})`, lat, lng } });
  } catch (error) {
    logger.error("Mappls reverse geocode failed", { requestId: req.requestId, error });
    return res.status(502).json({ success: false, error: "The pin is saved, but its street address could not be loaded." });
  }
});

export default router;
