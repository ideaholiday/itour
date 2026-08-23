import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  beginHttpMetrics,
  classifySql,
  normalizeTelemetryRoute,
  observeMetricsDatabase,
  recordWebVital,
  resetMetricsForTests,
  serializeMetrics,
} from "../src/config/metrics.js";
import { metricsSchemas } from "../src/validators/apiSchemas.js";
import { identifyMetricsAccess, requireMetricsAccess } from "../src/routes/metrics.js";

test("HTTP, business, database, and Web Vital metrics use bounded labels", async () => {
  resetMetricsForTests();

  const finishRequest = beginHttpMetrics();
  finishRequest({
    method: "POST",
    route: "/api/bookings",
    statusCode: 201,
    actorRole: "TRAVELER",
    durationSeconds: 0.125,
    body: { product_type: "DAY_TOUR", supplier_id: "must-not-be-a-label" },
  });
  finishRequest({ method: "POST", route: "/api/bookings", statusCode: 201, durationSeconds: 99 });

  const db = observeMetricsDatabase(new Database(":memory:"), "sqlite");
  db.exec("CREATE TABLE sample (id TEXT PRIMARY KEY)");
  db.prepare("INSERT INTO sample (id) VALUES (?)").run("row_1");
  assert.equal(db.prepare("SELECT id FROM sample WHERE id = ?").get("row_1").id, "row_1");
  db.close();

  recordWebVital({
    app: "vite",
    name: "LCP",
    value: 1234.5,
    rating: "good",
    route: "/booking-confirmed/booking_123?email=private@example.com",
  });

  const output = await serializeMetrics();
  assert.match(output, /idea_holiday_http_requests_total.*method="POST".*route="\/api\/bookings".*status_code="201".*actor_role="TRAVELER"/);
  assert.match(output, /idea_holiday_bookings_created_total.*product_type="DAY_TOUR"/);
  assert.match(output, /idea_holiday_database_query_duration_seconds_count.*engine="sqlite".*operation="INSERT".*table="sample".*outcome="SUCCESS"/);
  assert.match(output, /idea_holiday_frontend_web_vital_count.*app="vite".*metric="LCP".*rating="good".*route="\/booking-confirmed\/:id"/);
  assert.equal(output.includes("must-not-be-a-label"), false);
  assert.equal(output.includes("private@example.com"), false);
  assert.match(output, /idea_holiday_bookings_created_total\{[^}]*product_type="DAY_TOUR"[^}]*\} 1/);
});

test("metric input validation rejects extra or unbounded client data", () => {
  const valid = metricsSchemas.webVital.safeParse({
    app: "next",
    name: "INP",
    value: 180,
    rating: "good",
    route: "/checkout/:id",
    navigationType: "navigate",
  });
  assert.equal(valid.success, true);
  assert.equal(metricsSchemas.webVital.safeParse({ ...valid.data, email: "person@example.com" }).success, false);
  assert.equal(metricsSchemas.webVital.safeParse({ ...valid.data, value: Number.POSITIVE_INFINITY }).success, false);
  assert.equal(metricsSchemas.webVital.safeParse({ ...valid.data, route: `/${"x".repeat(200)}` }).success, false);
});

test("metrics helpers normalize SQL and route cardinality", () => {
  assert.deepEqual(classifySql("UPDATE bookings SET status = ? WHERE id = ?"), { operation: "UPDATE", table: "bookings" });
  assert.deepEqual(classifySql("PRAGMA journal_mode"), { operation: "OTHER", table: "unknown" });
  assert.equal(normalizeTelemetryRoute("/booking-confirmed/booking_123?token=secret"), "/booking-confirmed/:id");
  assert.equal(normalizeTelemetryRoute("https://example.com/private"), "/unknown");
  assert.equal(normalizeTelemetryRoute("/attacker-controlled/random-label"), "/other");
});

test("a dedicated scraper token grants metrics access without an application identity", () => {
  const previous = process.env.METRICS_TOKEN;
  process.env.METRICS_TOKEN = "metrics-test-token-with-at-least-32-characters";
  let allowed = false;
  requireMetricsAccess({
    headers: { "x-metrics-token": process.env.METRICS_TOKEN },
  }, {}, () => { allowed = true; });
  assert.equal(allowed, true);
  if (previous === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = previous;
});

test("the standard Prometheus bearer credential identifies a scraper without app authentication", () => {
  const previous = process.env.METRICS_TOKEN;
  process.env.METRICS_TOKEN = "metrics-test-token-with-at-least-32-characters";
  const req = {
    headers: { authorization: `Bearer ${process.env.METRICS_TOKEN}` },
  };
  let identified = false;
  identifyMetricsAccess(req, {}, () => { identified = true; });
  assert.equal(identified, true);
  assert.equal(req.metricsScraper, true);

  let allowed = false;
  requireMetricsAccess(req, {}, () => { allowed = true; });
  assert.equal(allowed, true);
  if (previous === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = previous;
});
