import client from "prom-client";

export const metricsRegistry = new client.Registry();

metricsRegistry.setDefaultLabels({
  service: "idea-holiday-api",
  environment: process.env.NODE_ENV || "development",
  version: process.env.APP_VERSION || process.env.K_REVISION || "local",
});

if (process.env.METRICS_DEFAULTS_ENABLED !== "false") {
  client.collectDefaultMetrics({
    register: metricsRegistry,
    prefix: "idea_holiday_process_",
  });
}

const httpRequests = new client.Counter({
  name: "idea_holiday_http_requests_total",
  help: "Total completed HTTP requests.",
  labelNames: ["method", "route", "status_code", "actor_role"],
  registers: [metricsRegistry],
});

const httpRequestDuration = new client.Histogram({
  name: "idea_holiday_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

const requestsInFlight = new client.Gauge({
  name: "idea_holiday_http_requests_in_flight",
  help: "HTTP requests currently being processed.",
  registers: [metricsRegistry],
});

const searchDuration = new client.Histogram({
  name: "idea_holiday_search_duration_seconds",
  help: "Marketplace search request duration in seconds.",
  labelNames: ["search_type", "status_code"],
  buckets: [0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2],
  registers: [metricsRegistry],
});

const bookingsCreated = new client.Counter({
  name: "idea_holiday_bookings_created_total",
  help: "Successfully created marketplace bookings.",
  labelNames: ["product_type"],
  registers: [metricsRegistry],
});

const paymentsProcessed = new client.Counter({
  name: "idea_holiday_payments_processed_total",
  help: "Payment processing attempts completed by the API.",
  labelNames: ["gateway", "outcome"],
  registers: [metricsRegistry],
});

const refundsProcessed = new client.Counter({
  name: "idea_holiday_refunds_processed_total",
  help: "Refund decisions completed by the API.",
  labelNames: ["outcome"],
  registers: [metricsRegistry],
});

const databaseQueryDuration = new client.Histogram({
  name: "idea_holiday_database_query_duration_seconds",
  help: "Database statement duration in seconds.",
  labelNames: ["engine", "operation", "table", "outcome"],
  buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [metricsRegistry],
});

const frontendWebVital = new client.Summary({
  name: "idea_holiday_frontend_web_vital",
  help: "Browser Web Vital values reported by Idea Holiday clients.",
  labelNames: ["app", "metric", "rating", "route"],
  maxAgeSeconds: 600,
  ageBuckets: 5,
  registers: [metricsRegistry],
});

const allowedProductTypes = new Set(["TRANSFER", "DAY_TOUR", "MULTI_DAY_PACKAGE"]);
const knownTelemetryRoutes = new Set([
  "/", "/search", "/transfers", "/bookings", "/login", "/signup",
  "/checkout/verify", "/how-it-works", "/terms", "/cancellation", "/about-us", "/contact-us",
  "/supplier", "/supplier/signup", "/supplier/dashboard", "/supplier/bookings", "/supplier/portal",
  "/supplier/coverage", "/supplier/products/create", "/supplier/transfers/create", "/supplier/tours/create",
  "/admin", "/admin/suppliers", "/admin/products", "/admin/finance", "/admin/quality",
  "/ops", "/ops/live", "/ops/notifications", "/ops/support", "/ops/tasks",
]);
const paymentRoutePattern = /\/api\/checkout\/(?:demo-payment|verify|cashfree\/verify|webhook|cashfree\/webhook)$/;
const refundRoutePattern = /(?:refund-decision|finance\/refunds|cancel-booking)/;

function boundedProductType(value) {
  const normalized = String(value || "UNKNOWN").toUpperCase();
  return allowedProductTypes.has(normalized) ? normalized : "UNKNOWN";
}

function searchType(route) {
  if (route === "/api/transfers/search") return "TRANSFER";
  if (route === "/api/activities" || route.startsWith("/api/activities/")) return "ACTIVITY";
  if (route === "/api/places") return "PLACE";
  return null;
}

function paymentGateway(route) {
  if (route.includes("cashfree")) return "CASHFREE";
  if (route.includes("demo-payment")) return "DEMO";
  if (route.endsWith("/webhook") || route.endsWith("/verify")) return "RAZORPAY";
  return "UNKNOWN";
}

export function beginHttpMetrics() {
  requestsInFlight.inc();
  let completed = false;
  return ({ method, route, statusCode, actorRole, durationSeconds, body } = {}) => {
    if (completed) return;
    completed = true;
    requestsInFlight.dec();
    const labels = {
      method: String(method || "UNKNOWN").toUpperCase(),
      route: String(route || "/unknown").slice(0, 200),
      status_code: String(statusCode || 0),
    };
    const safeDuration = Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds : 0;
    httpRequests.inc({ ...labels, actor_role: String(actorRole || "ANONYMOUS").toUpperCase() });
    httpRequestDuration.observe(labels, safeDuration);

    const type = searchType(labels.route);
    if (type) searchDuration.observe({ search_type: type, status_code: labels.status_code }, safeDuration);

    const succeeded = Number(statusCode) >= 200 && Number(statusCode) < 400;
    if (Number(statusCode) === 201 && labels.method === "POST" && labels.route === "/api/bookings") {
      bookingsCreated.inc({ product_type: boundedProductType(body?.product_type) });
    }
    if (labels.method === "POST" && paymentRoutePattern.test(labels.route)) {
      paymentsProcessed.inc({ gateway: paymentGateway(labels.route), outcome: succeeded ? "SUCCESS" : "FAILED" });
    }
    if (["POST", "PATCH"].includes(labels.method) && refundRoutePattern.test(labels.route)) {
      refundsProcessed.inc({ outcome: succeeded ? "SUCCESS" : "FAILED" });
    }
  };
}

export function observeDatabaseQuery({ engine, operation, table, outcome, durationSeconds }) {
  databaseQueryDuration.observe({
    engine: String(engine || "unknown").toLowerCase(),
    operation: String(operation || "OTHER").toUpperCase(),
    table: String(table || "unknown").toLowerCase(),
    outcome: outcome === "error" ? "ERROR" : "SUCCESS",
  }, Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds : 0);
}

export function normalizeTelemetryRoute(value) {
  const route = String(value || "/").split(/[?#]/)[0].slice(0, 160);
  if (!route.startsWith("/")) return "/unknown";
  if (knownTelemetryRoutes.has(route)) return route;
  if (/^\/activity\/[^/]+$/.test(route)) return "/activity/:id";
  if (/^\/checkout\/[^/]+$/.test(route)) return "/checkout/:id";
  if (/^\/booking-confirmed\/[^/]+$/.test(route)) return "/booking-confirmed/:id";
  return "/other";
}

export function recordWebVital({ app, name, rating, route, value }) {
  frontendWebVital.observe({
    app: app === "next" ? "next" : "vite",
    metric: String(name).toUpperCase(),
    rating: String(rating).toLowerCase(),
    route: normalizeTelemetryRoute(route),
  }, Number(value));
}

export function observeMetricsDatabase(database, engine = "sqlite") {
  if (!database || database.__ideaHolidayMetricsInstrumented) return database;
  Object.defineProperty(database, "__ideaHolidayMetricsInstrumented", { value: true });
  const originalPrepare = database.prepare.bind(database);

  database.prepare = (sql) => {
    const statement = originalPrepare(sql);
    const metadata = classifySql(sql);
    return new Proxy(statement, {
      get(target, property) {
        const original = Reflect.get(target, property, target);
        if (!["all", "get", "run"].includes(property) || typeof original !== "function") {
          return typeof original === "function" ? original.bind(target) : original;
        }
        return (...args) => {
          const startedAt = process.hrtime.bigint();
          try {
            const result = original.apply(target, args);
            observeDatabaseQuery({ ...metadata, engine, outcome: "success", durationSeconds: Number(process.hrtime.bigint() - startedAt) / 1e9 });
            return result;
          } catch (error) {
            observeDatabaseQuery({ ...metadata, engine, outcome: "error", durationSeconds: Number(process.hrtime.bigint() - startedAt) / 1e9 });
            throw error;
          }
        };
      },
    });
  };
  return database;
}

export function classifySql(sqlValue) {
  const sql = String(sqlValue || "").trim();
  const operation = (sql.match(/^(SELECT|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)/i)?.[1] || "OTHER").toUpperCase();
  const tableMatch = sql.match(/\b(?:FROM|INTO|UPDATE|TABLE)\s+["`]?([A-Za-z_][A-Za-z0-9_]*)/i);
  return { operation, table: tableMatch?.[1] || "unknown" };
}

export async function serializeMetrics() {
  return metricsRegistry.metrics();
}

export function resetMetricsForTests() {
  metricsRegistry.resetMetrics();
}
