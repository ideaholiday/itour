import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import logger from "./config/logger.js";

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { event: "uncaught_exception", error: err });
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { event: "unhandled_rejection", error: reason });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.join(__dirname, "..", ".env.local"), path.join(__dirname, "..", ".env")],
  quiet: true,
});

import db, { databaseInfo } from "./db.js";
import { runPendingMigrations } from "./services/migrationRunner.js";
import { supabase } from "./supabaseClient.js";
import { processExpiredSupplierAssignments } from "./services/assignmentSlaService.js";
import { processExpiredCircuitReconfirmations } from "./services/circuitOrchestrationService.js";
import { notifyCircuitReschedule, queueNotification } from "./services/notificationService.js";
// import { syncGoaSupplierAndProducts } from "./scripts/seedGoaSupplierProducts.js";
// ⬆️ Plan 14 (5-product system): demo data is now managed by scripts/seed-fresh.js.
//    The old DAY_TOUR / TRANSFER / MULTI_DAY_PACKAGE auto-sync is disabled.
import { backfillProductLocationRules } from "./data/canonicalLocations.js";
import { backfillProductOptions, expireBookingHolds } from "./services/logisticsService.js";
import { configureSecurity } from "./middleware/security.js";
import { apiNotFound, errorHandler, requestContext, requestLogger, stableErrorResponses } from "./middleware/observability.js";
import { auditMutations } from "./services/auditService.js";
import { requestBoundary } from "./middleware/validation.js";

// Run pending migrations on startup
try {
  const migResult = runPendingMigrations(db);
  if (migResult?.applied?.length > 0) {
    logger.info("Executed database migrations", { batch: migResult.batch, count: migResult.applied.length });
  }
} catch (err) {
  logger.error("Database migration failed", { error: err.message, code: err.code });
  if (process.env.NODE_ENV === "production") throw err;
}

// Backfill canonical location rules and product options on startup (safe, idempotent)
try {
  backfillProductLocationRules(db);
  backfillProductOptions(db);
} catch (err) {
  logger.warn("Startup backfill failed", { error: err });
}


import activitiesRouter from "./routes/activities.js";
import authRouter from "./routes/auth.js";
import bookingsRouter from "./routes/bookings.js";
import transfersRouter from "./routes/transfers.js";
import suppliersRouter from "./routes/suppliers.js";
import adminRouter from "./routes/admin.js";
import opsRouter from "./routes/ops.js";
import checkoutRouter from "./routes/checkout.js";
import placesRouter from "./routes/places.js";
import notificationWebhooksRouter from "./routes/notificationWebhooks.js";
import supportRouter from "./routes/support.js";
import reviewsRouter from "./routes/reviews.js";
import analyticsRouter from "./routes/analytics.js";
import seoRouter from "./routes/seo.js";
import securityTxtRouter from "./routes/securityTxt.js";
import metricsRouter from "./routes/metrics.js";
import travelerRouter from "./routes/traveler.js";
import uploadsRouter from "./routes/uploads.js";
import searchRouter from "./routes/search.js";
import exportsRouter from "./routes/exports.js";
import eventsRouter from "./routes/events.js";
import currencyRouter from "./routes/currency.js";
import promoRouter from "./routes/promo.js";
import addonsRouter from "./routes/addons.js";
import circuitOrdersRouter from "./routes/circuitOrders.js";
import availabilityRouter from "./routes/availability.js";
import { swaggerSpec } from "./config/swagger.js";

const app = express();
app.use(requestContext);
app.use(stableErrorResponses);
configureSecurity(app);
app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buffer) => {
    req.rawBody = buffer;
  }
}));
app.use("/api", requestBoundary);
app.use("/api/v1", requestBoundary);
app.use(requestLogger);
app.use(auditMutations(db));
app.use("/api", metricsRouter);
app.use("/api/v1", metricsRouter);

// Serve uploads directory
const uploadsDir = path.join(__dirname, "..", "uploads");
app.use("/uploads", express.static(uploadsDir));
app.use("/api/uploads/files", express.static(uploadsDir));

// OpenAPI / Swagger documentation
app.get(["/api/docs", "/api/v1/docs"], (req, res) => {
  if (req.headers.accept?.includes("application/json")) {
    return res.json(swaggerSpec);
  }
  const swaggerHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Idea Holiday API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body style="margin:0;background:#FAF9F6;">
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      spec: ${JSON.stringify(swaggerSpec)},
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis],
      layout: "BaseLayout"
    });
  </script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html");
  return res.send(swaggerHtml);
});

// Register routes helper for dual mounting (/api and /api/v1)
const mountApiRoutes = (prefix) => {
  app.use(prefix, activitiesRouter);
  app.use(`${prefix}/auth`, authRouter);
  app.use(`${prefix}/bookings`, bookingsRouter);
  app.use(`${prefix}/transfers`, transfersRouter);
  app.use(`${prefix}/suppliers`, suppliersRouter);
  app.use(`${prefix}/admin`, adminRouter);
  app.use(`${prefix}/analytics`, analyticsRouter);
  app.use(`${prefix}/ops`, opsRouter);
  app.use(`${prefix}/checkout`, checkoutRouter);
  app.use(`${prefix}/support`, supportRouter);
  app.use(`${prefix}/reviews`, reviewsRouter);
  app.use(`${prefix}/webhooks`, notificationWebhooksRouter);
  app.use(prefix, placesRouter);
  app.use(prefix, travelerRouter);
  app.use(prefix, uploadsRouter);
  app.use(prefix, searchRouter);
  app.use(prefix, exportsRouter);
  app.use(prefix, eventsRouter);
  app.use(`${prefix}/currency`, currencyRouter);
  app.use(`${prefix}/promo`, promoRouter);
  app.use(prefix, addonsRouter);
  app.use(`${prefix}/circuit-orders`, circuitOrdersRouter);
  app.use(`${prefix}/availability`, availabilityRouter);
};

mountApiRoutes("/api");
mountApiRoutes("/api/v1");

app.use("/", securityTxtRouter);
app.use("/", seoRouter);

app.get(["/api/health", "/api/v1/health"], (req, res) =>
  res.json({
    ok: true,
    service: "idea-holiday-api",
    timestamp: new Date().toISOString(),
    supabaseUrl: process.env.SUPABASE_URL || "https://jidknptoyloucgldaool.supabase.co",
    supabaseConnected: Boolean(process.env.SUPABASE_ANON_KEY),
    database: {
      engine: databaseInfo.engine,
      persistent: databaseInfo.persistent,
      journalMode: databaseInfo.journalMode,
      schema: databaseInfo.schema || null,
    },
    features: ["transfers", "sightseeing", "multi_day_packages", "4_role_ecosystem"]
  })
);

// Serve production static frontend if dist exists
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
app.use(express.static(frontendDist));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(frontendDist, "index.html"), (err) => {
    if (err) res.status(404).send("Idea Holiday API Backend running. Frontend dist not built yet.");
  });
});

app.use(apiNotFound);
app.use(errorHandler);

const PORT = process.env.PORT || 8080;
const assignmentSlaTimer = setInterval(() => {
  try { expireBookingHolds(db); } catch (error) { logger.error("Booking hold expiry worker failed", { error }); }
  try { processExpiredSupplierAssignments(db); } catch (error) { logger.error("Supplier assignment SLA worker failed", { error }); }
  try {
    const result = processExpiredCircuitReconfirmations(db);
    for (const orderId of result.orderIds) queueNotification(notifyCircuitReschedule(db, orderId, "REVIEW_REQUIRED"), "Circuit reconfirmation SLA notification");
  } catch (error) { logger.error("Circuit reconfirmation SLA worker failed", { error }); }
}, 30_000);
assignmentSlaTimer.unref();
const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info("Idea Holiday API started", { port: Number(PORT) });
  if (databaseInfo.engine === "postgres") {
    logger.info("Database connected", { engine: "postgres", schema: databaseInfo.schema, persistent: true });
  } else {
    logger.info("Database connected", { engine: "sqlite", persistent: databaseInfo.persistent, journalMode: databaseInfo.journalMode });
  }
});

const shutdown = (signal) => {
  logger.info("Shutdown signal received", { signal });
  server.close(() => {
    try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch (error) { logger.warn("SQLite checkpoint failed", { error }); }
    try { db.close(); } catch (error) { logger.warn("SQLite close failed", { error }); }
    process.exit(0);
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
