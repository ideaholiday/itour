import { Router } from "express";
import { rankSuggestions } from "../lib/placeRanking.js";
import logger from "../config/logger.js";

const router = Router();

const MAPPLS_BASE = "https://search.mappls.com/search";
const PLACE_DETAILS_BASE = "https://place.mappls.com/O2O/entity/place-details";
const MAPPLS_ORIGIN = (process.env.MAPPLS_ORIGIN || "https://ideaholiday.in").replace(/\/$/, "");

// OSM-based providers are free (no API key, no per-request billing) and are the
// default. Mappls remains available as an opt-in fallback via PLACES_PROVIDER=mappls
// for accounts that already have a paid key and want its India-specific coverage.
const PHOTON_BASE = process.env.PHOTON_BASE_URL || "https://photon.komoot.io/api/";
const NOMINATIM_BASE = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";
// Nominatim's usage policy requires a descriptive, non-generic User-Agent identifying the app.
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || "IdeaHoliday/1.0 (+https://ideaholiday.in)";
// Rough India bounding box (minLon,minLat,maxLon,maxLat) used to bias/limit OSM results.
const INDIA_BBOX = "68,6,98,38";

function getProvider() {
  const configured = String(process.env.PLACES_PROVIDER || "").trim().toLowerCase();
  if (configured === "mappls" || configured === "osm") return configured;
  // Default to the free OSM stack unless an operator has explicitly opted into Mappls.
  return "osm";
}

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

async function osmFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Required by Nominatim's usage policy; harmless for Photon.
        "User-Agent": NOMINATIM_USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`OSM provider returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Encodes coordinates/label into an opaque id so a Photon suggestion (which
// already carries coordinates) can be "resolved" without a second network call.
function encodeOsmPlaceId(payload) {
  return `osm:${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

function decodeOsmPlaceId(placeId) {
  if (!placeId || !placeId.startsWith("osm:")) return null;
  try {
    return JSON.parse(Buffer.from(placeId.slice(4), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function photonFeatureAddress(properties = {}) {
  return [properties.street, properties.district, properties.city, properties.state, properties.postcode]
    .filter(Boolean)
    .join(", ");
}

function normalizePhotonFeature(feature = {}) {
  const properties = feature.properties || {};
  const [lng, lat] = feature.geometry?.coordinates || [];
  const label = properties.name || properties.street || properties.city || "Unnamed place";
  const description = photonFeatureAddress(properties);
  return {
    id: encodeOsmPlaceId({ lat: numberOrNull(lat), lng: numberOrNull(lng), label, description }),
    label,
    description,
    category: categoryFor({ type: properties.osm_value || properties.osm_key, placeName: label, placeAddress: description }),
    lat: numberOrNull(lat),
    lng: numberOrNull(lng),
  };
}

function normalizeNominatimResult(place = {}) {
  const address = place.address || {};
  const label = address.amenity || address.shop || address.tourism || address.building || place.name || place.display_name?.split(",")[0] || "Unnamed place";
  const description = place.display_name || "";
  const lat = numberOrNull(place.lat);
  const lng = numberOrNull(place.lon);
  return {
    id: encodeOsmPlaceId({ lat, lng, label, description }),
    label,
    description,
    category: categoryFor({ type: place.type || place.class, placeName: label, placeAddress: description }),
    lat,
    lng,
  };
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

async function osmGeocodeAddress(address) {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set("q", address.slice(0, 255));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "in");
  const data = await osmFetch(url);
  const place = Array.isArray(data) ? data[0] : null;
  if (!place) return null;
  const normalized = normalizeNominatimResult(place);
  return normalized.lat !== null && normalized.lng !== null ? normalized : null;
}

// GET /api/places?query=...&lat=...&lng=...
router.get("/places", async (req, res) => {
  const query = String(req.query.query || "").trim();
  const provider = getProvider();
  if (query.length < 2) return res.json({ success: true, suggestions: [], provider });

  const biasLat = Number(req.query.lat);
  const biasLng = Number(req.query.lng);
  const hasBias = isIndiaCoordinate(biasLat, biasLng);

  if (provider === "osm") {
    try {
      const url = new URL(PHOTON_BASE);
      url.searchParams.set("q", query.slice(0, 80));
      url.searchParams.set("limit", "8");
      url.searchParams.set("lang", "en");
      url.searchParams.set("bbox", INDIA_BBOX);
      if (hasBias) {
        url.searchParams.set("lat", String(biasLat));
        url.searchParams.set("lon", String(biasLng));
      }
      const data = await osmFetch(url);
      const seen = new Set();
      const normalized = (data.features || [])
        .map(normalizePhotonFeature)
        .filter((place) => {
          if (!place.label || place.lat === null || place.lng === null) return false;
          const key = `${place.label}:${place.lat}:${place.lng}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      const suggestions = rankSuggestions(normalized, {
        query,
        context: String(req.query.context || "").slice(0, 160),
        lat: hasBias ? biasLat : null,
        lng: hasBias ? biasLng : null,
      }).slice(0, 8);

      res.set("Cache-Control", "private, max-age=300");
      return res.json({ success: true, suggestions, provider: "osm" });
    } catch (error) {
      logger.error("OSM autosuggest failed", { requestId: req.requestId, error });
      return res.status(502).json({ success: false, suggestions: [], error: "Location search is temporarily unavailable. You can still set the pin manually." });
    }
  }

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
    if (hasBias) {
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
      lat: hasBias ? biasLat : null,
      lng: hasBias ? biasLng : null,
    }).slice(0, 8);

    res.set("Cache-Control", "private, max-age=300");
    return res.json({ success: true, suggestions, provider: "mappls" });
  } catch (error) {
    logger.error("Mappls autosuggest failed", { requestId: req.requestId, error });
    return res.status(502).json({ success: false, suggestions: [], error: "Location search is temporarily unavailable. You can still set the pin manually." });
  }
});

// Resolve an eLoc/Mappls Pin (or an OSM-encoded id) into coordinates. Address
// geocoding is used when the id does not already carry coordinates.
router.get("/places/resolve", async (req, res) => {
  const provider = getProvider();
  const placeId = String(req.query.placeId || "").trim();
  const address = String(req.query.address || "").trim();
  if (!placeId && address.length < 3) return res.status(400).json({ success: false, error: "Choose a valid place." });

  if (provider === "osm") {
    try {
      const decoded = decodeOsmPlaceId(placeId);
      let location = decoded && decoded.lat !== null && decoded.lng !== null
        ? { id: placeId, label: decoded.label, description: decoded.description, category: categoryFor({}), lat: decoded.lat, lng: decoded.lng }
        : null;
      if (!location && address) location = await osmGeocodeAddress(address);
      if (!location) {
        return res.json({
          success: true,
          location: {
            id: placeId,
            address: (decoded && [decoded.label, decoded.description].filter(Boolean).join(", ")) || address,
            lat: null,
            lng: null,
            requiresPin: true,
          },
        });
      }
      const resolvedAddress = [location.label, location.description].filter(Boolean).join(", ") || address;
      return res.json({ success: true, location: { ...location, id: location.id || placeId, address: resolvedAddress } });
    } catch (error) {
      logger.error("OSM place resolution failed", { requestId: req.requestId, error });
      return res.status(502).json({ success: false, error: "We could not confirm this map point. Try another result or set the pin manually." });
    }
  }

  const apiKey = getApiKey();
  if (!apiKey) return res.status(503).json({ success: false, error: "Location search is not configured." });

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
  const provider = getProvider();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!isIndiaCoordinate(lat, lng)) return res.status(400).json({ success: false, error: "Choose a point within India." });

  if (provider === "osm") {
    try {
      const url = new URL(`${NOMINATIM_BASE}/reverse`);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lng));
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      const data = await osmFetch(url);
      const address = data?.display_name || `Pinned location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
      return res.json({ success: true, location: { address, lat, lng } });
    } catch (error) {
      logger.error("OSM reverse geocode failed", { requestId: req.requestId, error });
      return res.status(502).json({ success: false, error: "The pin is saved, but its street address could not be loaded." });
    }
  }

  const apiKey = getApiKey();
  if (!apiKey) return res.status(503).json({ success: false, error: "Location search is not configured." });

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
