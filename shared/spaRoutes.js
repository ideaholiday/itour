// Every path the React app answers (frontend/src/App.jsx). The server uses it to
// send a real 404 status for anything else, so search engines don't index
// "not found" pages as live ones. A unit test keeps this list and App.jsx in step.
export const SPA_ROUTES = [
  "/", "/driver/trip", "/track/:ref", "/review/:token", "/r/:slug",
  "/search", "/transfers", "/profile", "/wishlist", "/messages",
  "/things-to-do/:citySlug",
  "/suppliers", "/suppliers/in/:citySlug", "/suppliers/:slug",
  "/supplier", "/supplier/signup", "/supplier/dashboard", "/supplier/bookings", "/supplier/portal",
  "/supplier/coverage", "/supplier/channels", "/supplier/login",
  "/supplier/products/create", "/supplier/products/new", "/supplier/transfers/create", "/supplier/tours/create",
  "/admin/login", "/admin", "/admin/analytics", "/admin/suppliers", "/admin/products", "/admin/finance",
  "/admin/quality", "/admin/creators", "/admin/referrals", "/admin/team", "/admin/programs",
  "/admin/coupons", "/admin/verifications",
  "/ops", "/ops/live", "/ops/notifications", "/ops/support", "/ops/tasks", "/ops/circuits", "/ops/referrals",
  "/activity/:id", "/activity/:slug/:id", "/checkout/:id", "/booking-confirmed/:ref",
  "/bookings", "/my-bookings", "/my-reviews", "/reviews", "/trip-summary/:id", "/trip/:id",
  "/travel-and-earn", "/referrals", "/affiliate", "/influencer", "/affiliate/dashboard",
  "/circuit-planner", "/plan-trip", "/circuit-checkout/:id", "/circuit-confirmed/:ref", "/circuit/:ref/manage",
  "/login", "/signup", "/how-it-works", "/terms", "/cancellation", "/privacy-policy", "/privacy",
  "/about-us", "/contact-us",
];

const MATCHERS = SPA_ROUTES.map((route) => {
  const segments = route.split("/").filter(Boolean);
  return (parts) => parts.length === segments.length
    && segments.every((segment, index) => segment.startsWith(":") || segment === parts[index].toLowerCase());
});

/** True when the React app has a page for this path. Like React Router, case and a trailing slash don't matter. */
export function isKnownSpaPath(pathname) {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  return MATCHERS.some((matches) => matches(parts));
}
