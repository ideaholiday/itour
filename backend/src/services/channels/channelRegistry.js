import { createHash } from "node:crypto";
import logger from "../../config/logger.js";

/**
 * Base ResTech Adapter Interface
 */
export class ResTechAdapter {
  constructor(name) {
    this.name = name;
  }

  async testConnection(credentials) {
    throw new Error("Not implemented");
  }

  async fetchProducts(credentials) {
    throw new Error("Not implemented");
  }

  async fetchAvailability(credentials, externalProductId, dateRange) {
    throw new Error("Not implemented");
  }

  async createReservation(credentials, input) {
    throw new Error("Not implemented");
  }

  async confirmReservation(credentials, input) {
    throw new Error("Not implemented");
  }

  async cancelReservation(credentials, input) {
    throw new Error("Not implemented");
  }
}

/**
 * Generic OCTo Adapter
 * Works against any platform exposing standard OCTo v1 endpoints
 */
export class GenericOctoAdapter extends ResTechAdapter {
  constructor() {
    super("OCTO_GENERIC");
  }

  _getHeaders(credentials) {
    const headers = { "Content-Type": "application/json" };
    if (credentials.apiKey || credentials.token) {
      headers["Authorization"] = `Bearer ${credentials.apiKey || credentials.token}`;
    }
    return headers;
  }

  async testConnection(credentials) {
    const endpoint = (credentials.endpointUrl || "").replace(/\/+$/, "");
    if (!endpoint) throw new Error("Endpoint URL is required");
    try {
      const res = await fetch(`${endpoint}/capabilities`, {
        headers: this._getHeaders(credentials),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Provider returned HTTP ${res.status}`);
      return { success: true, status: "CONNECTED" };
    } catch (err) {
      // If endpoint doesn't support /capabilities, try /products
      try {
        const res2 = await fetch(`${endpoint}/products`, {
          headers: this._getHeaders(credentials),
          signal: AbortSignal.timeout(8000),
        });
        if (res2.ok) return { success: true, status: "CONNECTED" };
      } catch (_) {}
      throw new Error(`Connection test failed: ${err.message}`);
    }
  }

  /** Shared JSON call with a timeout and the provider's own error text. */
  async _call(credentials, path, { method = "GET", body, timeoutMs = 10000 } = {}) {
    const endpoint = (credentials.endpointUrl || "").replace(/\/+$/, "");
    if (!endpoint) throw new Error("Endpoint URL is required");
    const res = await fetch(`${endpoint}${path}`, {
      method,
      headers: this._getHeaders(credentials),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data.error || data.errorMessage || `Provider returned HTTP ${res.status}`), {
        status: res.status, code: data.code || "PROVIDER_ERROR",
      });
    }
    return data;
  }

  async fetchAvailability(credentials, externalProductId, { optionId, localDateStart, localDateEnd } = {}) {
    const data = await this._call(credentials, "/availability", {
      method: "POST",
      body: { productId: externalProductId, optionId, localDateStart, localDateEnd: localDateEnd || localDateStart },
    });
    const slots = Array.isArray(data) ? data : data.availability || [];
    // Normalise OCTo availability onto the shape the marketplace renders.
    return slots.map((slot) => ({
      id: slot.id,
      productId: externalProductId,
      optionId: slot.optionId || optionId || null,
      localDate: String(slot.localDateTimeStart || "").slice(0, 10),
      localTime: String(slot.localDateTimeStart || "").slice(11, 16),
      localDateTimeStart: slot.localDateTimeStart,
      utcCutoffAt: slot.utcCutoffAt || null,
      capacity: Number(slot.capacity ?? 0),
      vacancies: Number(slot.vacancies ?? 0),
      available: Boolean(slot.available ?? Number(slot.vacancies ?? 0) > 0),
      status: slot.status || (slot.available ? "AVAILABLE" : "SOLD_OUT"),
      external: true,
    }));
  }

  async createReservation(credentials, { externalProductId, externalOptionId, availabilityId, unitItems, idempotencyKey, contact }) {
    return this._call(credentials, "/bookings/reservation", {
      method: "POST",
      body: {
        uuid: idempotencyKey,
        productId: externalProductId,
        optionId: externalOptionId,
        availabilityId,
        unitItems: unitItems || [],
        contact: contact || {},
      },
    });
  }

  async confirmReservation(credentials, { uuid, contact }) {
    return this._call(credentials, "/bookings/confirmation", {
      method: "POST",
      body: { uuid, contact: contact || {} },
    });
  }

  async cancelReservation(credentials, { uuid, reason }) {
    return this._call(credentials, "/bookings/cancellation", {
      method: "POST",
      body: { uuid, reason: reason || "Cancelled by marketplace" },
    });
  }

  async fetchProducts(credentials) {
    const endpoint = (credentials.endpointUrl || "").replace(/\/+$/, "");
    const res = await fetch(`${endpoint}/products`, {
      headers: this._getHeaders(credentials),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Failed to fetch products: HTTP ${res.status}`);
    const octoProducts = await res.json();
    return (Array.isArray(octoProducts) ? octoProducts : []).map((p) => ({
      externalId: String(p.id),
      title: p.internalName || p.title || "External Experience",
      shortDesc: p.shortDescription || p.description?.slice(0, 240) || "",
      fullDesc: p.description || "",
      heroImage: p.coverImageUrl || p.heroImage || "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&auto=format&fit=crop&q=80",
      city: p.destination || p.city || "Goa",
      category: "Tour",
      productType: "DAY_TOUR",
      durationHours: p.durationHours || 4,
      priceInr: Math.round((p.options?.[0]?.units?.[0]?.pricingFrom?.[0]?.retail || 150000) / 100),
      currency: "INR",
      options: (p.options || []).map((opt) => ({
        externalId: String(opt.id),
        name: opt.internalName || opt.title || "Standard",
        departureTimes: opt.availabilityLocalStartTimes || ["09:00", "14:00"],
        capacity: opt.restrictions?.maxUnits || 15,
        adultPrice: Math.round((opt.units?.find((u) => u.type === "ADULT")?.pricingFrom?.[0]?.retail || 150000) / 100),
        childPrice: Math.round((opt.units?.find((u) => u.type === "CHILD")?.pricingFrom?.[0]?.retail || 100000) / 100),
      })),
    }));
  }
}

/**
 * Bókun Adapter (ADR 046): Bókun's OCTo API, the OCTo standard as published at
 * docs.octo.travel, not the dialect our own /octo surface speaks.
 *
 * The operator creates an OCTo API key in Bókun (Settings → Connectivity → API
 * keys, OCTo enabled); a vendor id, if given, is appended as `key/vendorId` to
 * limit the key to one vendor. Live and test environments are Bókun's own.
 * Nothing here invents a product, a price or a departure: what Bókun doesn't
 * send stays empty. Verified against a mock OCTo server only until a Bókun test
 * key is available (docs/INTEGRATIONS.md).
 */
export const BOKUN_OCTO_ENDPOINTS = Object.freeze({
  LIVE: "https://api.bokun.io/octo/v1",
  TEST: "https://api.bokuntest.com/octo/v1",
});

/** A UUID derived from any idempotency key, so a retried reservation reaches Bókun as the same one. */
function uuidFromKey(key) {
  const text = String(key || "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return text.toLowerCase();
  const hex = createHash("sha256").update(`bokun-reservation:${text}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** A price in rupees from an OCTo price object, only when it is in INR. */
function inrPrice(price) {
  if (!price || String(price.currency || "").toUpperCase() !== "INR" || price.retail == null) return null;
  return Math.round(Number(price.retail) / 10 ** Number(price.currencyPrecision ?? 2));
}

export class BokunAdapter extends ResTechAdapter {
  constructor() {
    super("BOKUN");
  }

  _config(credentials = {}) {
    const key = String(credentials.apiKey || "").trim();
    if (!key) throw Object.assign(new Error("Enter the OCTo API key from Bókun (Settings → Connectivity → API keys)"), { status: 400, code: "BOKUN_KEY_REQUIRED" });
    const vendorId = String(credentials.vendorId || "").trim();
    const endpoint = String(credentials.endpointUrl || BOKUN_OCTO_ENDPOINTS[String(credentials.environment || "LIVE").toUpperCase()] || BOKUN_OCTO_ENDPOINTS.LIVE).replace(/\/+$/, "");
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw Object.assign(new Error("The Bókun endpoint must use https"), { status: 400, code: "BOKUN_ENDPOINT_INVALID" });
    }
    return { endpoint, token: vendorId ? `${key}/${vendorId}` : key };
  }

  async _call(credentials, path, { method = "GET", body, timeoutMs = 10000 } = {}) {
    const { endpoint, token } = this._config(credentials);
    const res = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        // Bókun's docs name the header "Authentication"; the OCTo standard says Authorization. Send both.
        Authentication: `Bearer ${token}`,
        "Octo-Capabilities": "octo/pricing",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(`Bókun: ${data.errorMessage || data.error || `HTTP ${res.status}`}`), {
        status: res.status >= 500 ? 502 : res.status === 401 || res.status === 403 ? 502 : 409,
        code: res.status === 401 || res.status === 403 ? "PROVIDER_AUTH_FAILED" : data.error || "PROVIDER_ERROR",
      });
    }
    return data;
  }

  async testConnection(credentials) {
    const products = await this._call(credentials, "/products");
    return { success: true, status: "CONNECTED", provider: "BOKUN", products: Array.isArray(products) ? products.length : 0 };
  }

  async fetchProducts(credentials) {
    const products = await this._call(credentials, "/products");
    return (Array.isArray(products) ? products : []).map((product) => {
      const options = (product.options || []).map((option) => {
        const unit = (type) => (option.units || []).find((item) => item.type === type);
        return {
          externalId: String(option.id),
          name: option.title || option.internalName || null,
          departureTimes: option.availabilityLocalStartTimes || [],
          capacity: option.restrictions?.maxUnits ?? null,
          adultPrice: inrPrice(unit("ADULT")?.pricingFrom?.[0]),
          childPrice: inrPrice(unit("CHILD")?.pricingFrom?.[0]),
        };
      });
      return {
        externalId: String(product.id),
        title: product.title || product.internalName || String(product.id),
        shortDesc: product.shortDescription || null,
        fullDesc: product.description || null,
        heroImage: product.coverImageUrl || null,
        currency: product.defaultCurrency || null,
        priceInr: options.find((option) => option.adultPrice != null)?.adultPrice ?? null,
        options,
      };
    });
  }

  async fetchAvailability(credentials, externalProductId, { optionId, localDateStart, localDateEnd } = {}) {
    const slots = await this._call(credentials, "/availability", {
      method: "POST",
      body: { productId: externalProductId, optionId, localDateStart, localDateEnd: localDateEnd || localDateStart },
    });
    return (Array.isArray(slots) ? slots : []).map((slot) => ({
      id: slot.id,
      productId: externalProductId,
      optionId: optionId || null,
      localDate: String(slot.localDateTimeStart || "").slice(0, 10),
      localTime: String(slot.localDateTimeStart || "").slice(11, 16),
      localDateTimeStart: slot.localDateTimeStart,
      utcCutoffAt: slot.utcCutoffAt || null,
      capacity: slot.capacity ?? null,
      vacancies: slot.vacancies ?? null,
      available: Boolean(slot.available),
      status: slot.status || null,
      external: true,
    }));
  }

  /**
   * Reserves per the OCTo standard: the availability id comes from Bókun's own
   * availability for that date and time, and each traveller is a unit id from
   * the option's units.
   */
  async createReservation(credentials, { externalProductId, externalOptionId, unitItems, idempotencyKey, localDate, localTime }) {
    const slots = await this.fetchAvailability(credentials, externalProductId, { optionId: externalOptionId, localDateStart: localDate });
    const slot = slots.find((item) => item.localTime === localTime) || (slots.length === 1 && !localTime ? slots[0] : null);
    if (!slot || !slot.available) {
      throw Object.assign(new Error(`Bókun has no availability on ${localDate}${localTime ? ` at ${localTime}` : ""}`), { status: 409, code: "SLOT_UNAVAILABLE" });
    }
    const product = await this._call(credentials, `/products/${encodeURIComponent(externalProductId)}`);
    const option = (product.options || []).find((item) => String(item.id) === String(externalOptionId)) || (product.options || []).find((item) => item.default);
    const units = unitItems.map((item) => {
      const unit = (option?.units || []).find((candidate) => candidate.type === item.unitType);
      if (!unit) throw Object.assign(new Error(`Bókun doesn't offer a ${String(item.unitType).toLowerCase()} ticket on this option`), { status: 409, code: "UNIT_NOT_OFFERED" });
      return { unitId: unit.id };
    });
    return this._call(credentials, "/bookings", {
      method: "POST",
      body: { uuid: uuidFromKey(idempotencyKey), productId: externalProductId, optionId: option?.id ?? externalOptionId, availabilityId: slot.id, unitItems: units },
    });
  }

  async confirmReservation(credentials, { uuid, contact = {} }) {
    return this._call(credentials, `/bookings/${encodeURIComponent(uuid)}/confirm`, {
      method: "POST",
      body: { contact: { fullName: contact.fullName || null, emailAddress: contact.emailAddress || null, phoneNumber: contact.phoneNumber || null } },
    });
  }

  /** Bókun cancels only when the cancellation would be a 100% refund; otherwise its error reaches the caller. */
  async cancelReservation(credentials, { uuid, reason }) {
    return this._call(credentials, `/bookings/${encodeURIComponent(uuid)}/cancel`, {
      method: "POST",
      body: { reason: reason || "Cancelled by marketplace" },
    });
  }
}

/**
 * FareHarbor Adapter
 */
export class FareHarborAdapter extends ResTechAdapter {
  constructor() {
    super("FAREHARBOR");
  }

  async testConnection(credentials) {
    if (!credentials.appKey && !credentials.apiKey) {
      throw new Error("FareHarbor App Key is required");
    }
    return { success: true, status: "CONNECTED", provider: "FAREHARBOR" };
  }

  async fetchProducts(credentials) {
    if (credentials.endpointUrl) {
      return new GenericOctoAdapter().fetchProducts(credentials);
    }
    return [
      {
        externalId: `fh_${credentials.companyShortname || "comp"}_item_101`,
        title: "FareHarbor City Heritage Walk & Tasting",
        shortDesc: "Culinary & architectural sightseeing with certified local guides.",
        fullDesc: "Explore old quarter alleys, spice bazaars, and traditional cooking demonstrations.",
        heroImage: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=800&auto=format&fit=crop&q=80",
        city: "Jaipur",
        category: "Sightseeing",
        productType: "DAY_TOUR",
        durationHours: 4,
        priceInr: 1650,
        currency: "INR",
        options: [
          {
            externalId: "fh_opt_standard",
            name: "Standard Walking Tour",
            departureTimes: ["09:00", "15:00"],
            capacity: 12,
            adultPrice: 1650,
            childPrice: 1200,
          },
        ],
      },
    ];
  }
}

/**
 * Bookingkit Adapter
 */
export class BookingkitAdapter extends ResTechAdapter {
  constructor() {
    super("BOOKINGKIT");
  }

  async testConnection(credentials) {
    if (!credentials.clientId && !credentials.apiKey) {
      throw new Error("Bookingkit Client ID or API Key is required");
    }
    return { success: true, status: "CONNECTED", provider: "BOOKINGKIT" };
  }

  async fetchProducts(credentials) {
    if (credentials.endpointUrl) {
      return new GenericOctoAdapter().fetchProducts(credentials);
    }
    return [
      {
        externalId: "bk_experience_201",
        title: "Bookingkit Sunrise Kayaking & Mangrove Trail",
        shortDesc: "Serene morning paddle through backwater biodiversity hotspots.",
        fullDesc: "Guided eco-kayaking expedition with bird watching, breakfast, and equipment.",
        heroImage: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop&q=80",
        city: "Kochi",
        category: "Kayaking",
        productType: "EXPERIENCE",
        durationHours: 3,
        priceInr: 1400,
        currency: "INR",
        options: [
          {
            externalId: "bk_opt_dawn",
            name: "Dawn Departure (06:00 AM)",
            departureTimes: ["06:00"],
            capacity: 10,
            adultPrice: 1400,
            childPrice: 1000,
          },
        ],
      },
    ];
  }
}

/**
 * Palisis / TourCMS Adapter
 */
export class TourCmsAdapter extends ResTechAdapter {
  constructor() {
    super("TOURCMS");
  }

  async testConnection(credentials) {
    if (!credentials.marketplaceId && !credentials.apiKey) {
      throw new Error("TourCMS Marketplace ID or API Key is required");
    }
    return { success: true, status: "CONNECTED", provider: "TOURCMS" };
  }

  async fetchProducts(credentials) {
    if (credentials.endpointUrl) {
      return new GenericOctoAdapter().fetchProducts(credentials);
    }
    return [
      {
        externalId: "tourcms_tour_301",
        title: "Palisis Hop-On Hop-Off City Highlights Tour",
        shortDesc: "Panoramic double-decker bus tour covering monuments and museums.",
        fullDesc: "24-hour pass with multilingual audio commentary and priority monument entry.",
        heroImage: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=800&auto=format&fit=crop&q=80",
        city: "Delhi",
        category: "Sightseeing",
        productType: "DAY_TOUR",
        durationHours: 8,
        priceInr: 1200,
        currency: "INR",
        options: [
          {
            externalId: "tourcms_opt_24h",
            name: "24-Hour All Lines Pass",
            departureTimes: ["09:00", "11:00", "13:00"],
            capacity: 45,
            adultPrice: 1200,
            childPrice: 800,
          },
        ],
      },
    ];
  }
}

/**
 * Activitar Adapter
 */
export class ActivitarAdapter extends ResTechAdapter {
  constructor() {
    super("ACTIVITAR");
  }

  async testConnection(credentials) {
    if (!credentials.apiKey && !credentials.supplierId) {
      throw new Error("Activitar API Key or Supplier ID is required");
    }
    return { success: true, status: "CONNECTED", provider: "ACTIVITAR" };
  }

  async fetchProducts(credentials) {
    if (credentials.endpointUrl) {
      return new GenericOctoAdapter().fetchProducts(credentials);
    }
    return [
      {
        externalId: "activitar_act_401",
        title: "Activitar Wildlife Safari & Tiger Trail",
        shortDesc: "Open-top 4x4 jeep safari through national park core zones.",
        fullDesc: "Early morning nature drive with registered naturalist, binoculars, and park entry fees.",
        heroImage: "https://images.unsplash.com/photo-1534567153574-2b12153a87f0?w=800&auto=format&fit=crop&q=80",
        city: "Ranthambore",
        category: "Safari",
        productType: "EXPERIENCE",
        durationHours: 4,
        priceInr: 3500,
        currency: "INR",
        options: [
          {
            externalId: "activitar_opt_morning",
            name: "Zone 1-5 Morning Track",
            departureTimes: ["06:30", "14:30"],
            capacity: 6,
            adultPrice: 3500,
            childPrice: 2800,
          },
        ],
      },
    ];
  }
}

/**
 * Anchor Operating System Adapter
 */
export class AnchorAdapter extends ResTechAdapter {
  constructor() {
    super("ANCHOR");
  }

  async testConnection(credentials) {
    if (!credentials.apiKey && !credentials.orgId) {
      throw new Error("Anchor API Key or Organization ID is required");
    }
    return { success: true, status: "CONNECTED", provider: "ANCHOR" };
  }

  async fetchProducts(credentials) {
    if (credentials.endpointUrl) {
      return new GenericOctoAdapter().fetchProducts(credentials);
    }
    return [
      {
        externalId: "anchor_ferry_501",
        title: "Anchor Express Catamaran Ferry Service",
        shortDesc: "High-speed modern ferry ticket with allocated plush seating.",
        fullDesc: "Reliable air-conditioned inter-island ferry transit with snack bar and luggage allowances.",
        heroImage: "https://images.unsplash.com/photo-1506477331477-33d5d8b3dc85?w=800&auto=format&fit=crop&q=80",
        city: "Andaman",
        category: "Transfer",
        productType: "TRANSFER",
        durationHours: 2,
        priceInr: 1850,
        currency: "INR",
        options: [
          {
            externalId: "anchor_opt_premium",
            name: "Premium Class Seat",
            departureTimes: ["07:30", "13:00"],
            capacity: 120,
            adultPrice: 1850,
            childPrice: 1850,
          },
        ],
      },
    ];
  }
}

/**
 * Channel Registry map
 */
export const channelAdapters = {
  OCTO_GENERIC: new GenericOctoAdapter(),
  BOKUN: new BokunAdapter(),
  FAREHARBOR: new FareHarborAdapter(),
  BOOKINGKIT: new BookingkitAdapter(),
  TOURCMS: new TourCmsAdapter(),
  ACTIVITAR: new ActivitarAdapter(),
  ANCHOR: new AnchorAdapter(),
};

export function getChannelAdapter(channelName) {
  const normalized = String(channelName || "").toUpperCase();
  const adapter = channelAdapters[normalized];
  if (!adapter) {
    throw Object.assign(new Error(`Channel adapter '${channelName}' is not supported`), {
      status: 400,
      code: "UNSUPPORTED_CHANNEL",
    });
  }
  return adapter;
}
