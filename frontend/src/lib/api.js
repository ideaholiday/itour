const BASE = "/api";

export function authHeaders() {
  const token = localStorage.getItem("wi_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function authenticatedFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders() },
  });
}

// In-flight and cached requests to avoid duplicate network fetches
const memoryCache = new Map();
const inFlightRequests = new Map();

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong");
    err.code = data.code || null;
    err.status = res.status;
    throw err;
  }
  return data;
}

function cachedFetch(url, options = {}, ttlMs = 30000) {
  const key = `${options.method || "GET"}:${url}`;
  const now = Date.now();

  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.data);
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const promise = fetch(url, options)
    .then(handle)
    .then((data) => {
      memoryCache.set(key, { data, expiresAt: now + ttlMs });
      inFlightRequests.delete(key);
      return data;
    })
    .catch((err) => {
      inFlightRequests.delete(key);
      throw err;
    });

  inFlightRequests.set(key, promise);
  return promise;
}

export const api = {
  getDestinations: () => cachedFetch(`${BASE}/destinations`, {}, 300000), // 5 min cache
  getCities: () => cachedFetch(`${BASE}/cities`, {}, 300000),
  search: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))).toString();
    return fetch(`${BASE}/search?${qs}`, { headers: authHeaders() }).then(handle);
  },
  getSuggestions: (q = "") => {
    return cachedFetch(`${BASE}/search/suggestions?q=${encodeURIComponent(q)}`, {}, 60000);
  },
  getActivities: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))).toString();
    const url = `${BASE}/search?${qs}`;
    return fetch(url, { headers: authHeaders() }).then(handle);
  },
  getActivity: (id) => cachedFetch(`${BASE}/activities/${id}`, {}, 60000),
  signup: (payload) => fetch(`${BASE}/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(handle),
  supplierSignup: (payload) => fetch(`${BASE}/auth/supplier-signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(handle),
  login: (payload) => fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(handle),
  createBooking: (payload) =>
    fetch(`${BASE}/bookings`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getBookingQuote: (payload) =>
    fetch(`${BASE}/bookings/quote`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  completeDemoPayment: (payload) =>
    fetch(`${BASE}/checkout/demo-payment`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  createCashfreeOrder: (payload) =>
    fetch(`${BASE}/checkout/cashfree/create-order`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  verifyCashfreePayment: (payload) =>
    fetch(`${BASE}/checkout/cashfree/verify`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  verifyPickupOtp: (ref, otp) =>
    fetch(`${BASE}/bookings/${encodeURIComponent(ref)}/pickup-otp/verify`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ otp }) }).then(handle),
  getMyBookings: () => fetch(`${BASE}/bookings`, { headers: authHeaders() }).then(handle),
  getMyNotifications: () => fetch(`${BASE}/bookings/notifications`, { headers: authHeaders() }).then(handle),
  getNotificationPreferences: () => fetch(`${BASE}/bookings/notification-preferences`, { headers: authHeaders() }).then(handle),
  updateNotificationPreferences: (payload) => fetch(`${BASE}/bookings/notification-preferences`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getBooking: (ref) => fetch(`${BASE}/bookings/${encodeURIComponent(ref)}`, { headers: authHeaders() }).then(handle),
  getBookingDocuments: (ref) => fetch(`${BASE}/bookings/${encodeURIComponent(ref)}/documents`, { headers: authHeaders() }).then(handle),
  resendGuestNotification: (ref, eventType = "DOCUMENTS") => fetch(`${BASE}/bookings/${encodeURIComponent(ref)}/notifications/resend`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ eventType }) }).then(handle),
  getSupportCases: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();
    return fetch(`${BASE}/support/cases${query ? `?${query}` : ""}`, { headers: authHeaders() }).then(handle);
  },
  getSupportCase: (ref) => fetch(`${BASE}/support/cases/${encodeURIComponent(ref)}`, { headers: authHeaders() }).then(handle),
  createSupportCase: (payload) => fetch(`${BASE}/support/cases`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  addSupportMessage: (ref, payload) => fetch(`${BASE}/support/cases/${encodeURIComponent(ref)}/messages`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  addSupportEvidence: (ref, payload) => fetch(`${BASE}/support/cases/${encodeURIComponent(ref)}/evidence`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getEligibleReviews: () => fetch(`${BASE}/reviews/eligible`, { headers: authHeaders() }).then(handle),
  getMyReviews: () => fetch(`${BASE}/reviews/mine`, { headers: authHeaders() }).then(handle),
  createReview: (payload) => fetch(`${BASE}/reviews`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getProductReviews: (id, params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
    return fetch(`${BASE}/reviews/product/${encodeURIComponent(id)}${query ? `?${query}` : ""}`).then(handle);
  },
  getSupplierReviews: (id) => fetch(`${BASE}/reviews/supplier/${encodeURIComponent(id)}`, { headers: authHeaders() }).then(handle),
  respondToReview: (id, response) => fetch(`${BASE}/reviews/${encodeURIComponent(id)}/response`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ response }) }).then(handle),
  voteReviewHelpfulness: (id, isHelpful = true) => fetch(`${BASE}/reviews/${encodeURIComponent(id)}/helpfulness`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ isHelpful }) }).then(handle),
  uploadReviewPhoto: (id, payload) => fetch(`${BASE}/reviews/${encodeURIComponent(id)}/photos`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  uploadFile: (payload) => fetch(`${BASE}/uploads`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  updateSupplierProductPrice: (supplierId, productId, payload) =>
    fetch(`${BASE}/suppliers/${encodeURIComponent(supplierId)}/products/${encodeURIComponent(productId)}/price`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  cancelSupplierBooking: (supplierId, bookingId, payload) =>
    fetch(`${BASE}/suppliers/${encodeURIComponent(supplierId)}/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  sendSupplierGuestNotification: (supplierId, bookingId, eventType = "BOOKING_CONFIRMED") =>
    fetch(`${BASE}/suppliers/${encodeURIComponent(supplierId)}/bookings/${encodeURIComponent(bookingId)}/notifications/resend`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ eventType }) }).then(handle),
  calculateRefund: (payload) =>
    fetch(`${BASE}/checkout/calculate-refund`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getSupplierPayoutLedger: (supplierId) =>
    fetch(`${BASE}/suppliers/${encodeURIComponent(supplierId)}/payout-ledger`, { headers: authHeaders() }).then(handle),
  autoBatchSettlements: () =>
    fetch(`${BASE}/admin/finance/settlements/auto-batch`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } }).then(handle),
  processCashfreeSettlement: (batchId) =>
    fetch(`${BASE}/admin/finance/settlements/${encodeURIComponent(batchId)}/process-cashfree`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } }).then(handle),
  triggerAutomatedReminders: () =>
    fetch(`${BASE}/admin/reminders/trigger-run`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } }).then(handle),
  sendPreTripReminder: (bookingId) =>
    fetch(`${BASE}/admin/reminders/booking/${encodeURIComponent(bookingId)}/pre-trip`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } }).then(handle),
  sendPostTripReviewInvite: (bookingId) =>
    fetch(`${BASE}/admin/reminders/booking/${encodeURIComponent(bookingId)}/post-trip-review`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } }).then(handle),
  getReminderStatus: (bookingId) =>
    fetch(`${BASE}/admin/reminders/status/${encodeURIComponent(bookingId)}`, { headers: authHeaders() }).then(handle),
  getLiveTracking: () =>
    fetch("/api/ops/live-tracking", { headers: authHeaders() }).then(handle),
  updateDriverLocation: (payload) =>
    fetch("/api/ops/driver-location", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  verifyPickupOtp: (payload) =>
    fetch("/api/ops/verify-otp-start", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  updateTripStatus: (payload) =>
    fetch("/api/ops/update-trip-status", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  validatePromoCode: (payload) =>
    fetch("/api/promo/validate", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getActivePromoVouchers: () =>
    fetch("/api/promo/active").then(handle),
  getUserReferralStats: () =>
    fetch("/api/promo/user/referral", { headers: authHeaders() }).then(handle),
  getWishlists: () =>
    fetch("/api/wishlists", { headers: authHeaders() }).then(handle),
  addToWishlist: (productId, collectionName = "Favorites") =>
    fetch(`/api/wishlists/${encodeURIComponent(productId)}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ collectionName }) }).then(handle),
  removeFromWishlist: (productId) =>
    fetch(`/api/wishlists/${encodeURIComponent(productId)}`, { method: "DELETE", headers: authHeaders() }).then(handle),
  getUserItineraries: () =>
    fetch("/api/itineraries", { headers: authHeaders() }).then(handle),
  createItinerary: (payload) =>
    fetch("/api/itineraries", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  updateItinerary: (id, payload) =>
    fetch(`/api/itineraries/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getPublicItinerary: (id) =>
    fetch(`/api/itineraries/${encodeURIComponent(id)}`, { headers: authHeaders() }).then(handle),
  deleteItinerary: (id) =>
    fetch(`/api/itineraries/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() }).then(handle),
  getProductAddons: (productId) =>
    fetch(`/api/addons${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`).then(handle),
  calculateAddons: (payload) =>
    fetch("/api/addons/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(handle),
  createProductAddon: (payload) =>
    fetch("/api/addons", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getRescheduleEligibility: (bookingId) =>
    fetch(`/api/bookings/${encodeURIComponent(bookingId)}/reschedule-eligibility`, { headers: authHeaders() }).then(handle),
  rescheduleBooking: (bookingId, payload) =>
    fetch(`/api/bookings/${encodeURIComponent(bookingId)}/reschedule`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getCancellationPreview: (bookingId) =>
    fetch(`/api/bookings/${encodeURIComponent(bookingId)}/cancellation-preview`, { headers: authHeaders() }).then(handle),
  selfCancelBooking: (bookingId, payload) =>
    fetch(`/api/bookings/${encodeURIComponent(bookingId)}/self-cancel`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  getSupplierPricingRules: (supplierId) =>
    fetch(`/api/suppliers/${encodeURIComponent(supplierId)}/pricing-rules`, { headers: authHeaders() }).then(handle),
  createSupplierPricingRule: (supplierId, payload) =>
    fetch(`/api/suppliers/${encodeURIComponent(supplierId)}/pricing-rules`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }).then(handle),
  deleteSupplierPricingRule: (supplierId, ruleId) =>
    fetch(`/api/suppliers/${encodeURIComponent(supplierId)}/pricing-rules/${encodeURIComponent(ruleId)}`, { method: "DELETE", headers: authHeaders() }).then(handle),
  getProductPriceCalendar: (productId, month) =>
    fetch(`/api/products/${encodeURIComponent(productId)}/price-calendar${month ? `?month=${encodeURIComponent(month)}` : ""}`).then(handle),
  subscribeNewsletter: (payload) =>
    fetch("/api/newsletter/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(handle),
  getNewsletterStats: () =>
    fetch("/api/newsletter/stats", { headers: authHeaders() }).then(handle),
  get: (path) => fetch(path.startsWith("/api") ? path : `${BASE}${path}`, { headers: authHeaders() }).then(handle),
  post: (path, payload) =>
    fetch(path.startsWith("/api") ? path : `${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: payload ? JSON.stringify(payload) : undefined }).then(handle),
  patch: (path, payload) =>
    fetch(path.startsWith("/api") ? path : `${BASE}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: payload ? JSON.stringify(payload) : undefined }).then(handle),
  delete: (path) =>
    fetch(path.startsWith("/api") ? path : `${BASE}${path}`, { method: "DELETE", headers: authHeaders() }).then(handle),
};

export default api;
