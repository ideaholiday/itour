import driverTripsRouter from "./routes/driverTrips.js";
import trackingRouter from "./routes/tracking.js";
import { processDispatchSchedule, processDispatchOutbox } from "./services/dispatchWorkflowService.js";
import { deliverDispatchNotification } from "./services/dispatchNotificationService.js";
import { processReservationOutbox } from "./services/reservationOutboxService.js";
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
import { notifyBookingConfirmed, notifyCircuitReschedule, queueNotification } from "./services/notificationService.js";
import { syncGoaSupplierAndProducts } from "./scripts/seedGoaSupplierProducts.js";
import { backfillProductLocationRules } from "./data/canonicalLocations.js";
import { backfillProductOptions, expireBookingHolds } from "./services/logisticsService.js";
import { configureSecurity } from "./middleware/security.js";
import { apiNotFound, errorHandler, requestContext, requestLogger, stableErrorResponses } from "./middleware/observability.js";
import { auditMutations } from "./services/auditService.js";
import { requestBoundary } from "./middleware/validation.js";
import { backfillSupplierSlugs } from "./services/supplierProfileService.js";
import { backfillLegacyReferrals, findWalletDiscrepancies, processReferralLifecycle, sendReferralNotifications } from "./services/referralService.js";
import { processSubscriptionLifecycle, sendSubscriptionReminders, syncLaunchWaivers } from "./services/supplierSubscriptionService.js";
import { releaseCouponRedemptions } from "./services/promoService.js";
import { collectVerificationReminders, sendVerificationReminders } from "./services/supplierPlanPaymentService.js";

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

// Carry v1 referrals into the v3 tables and open the wallet ledger (idempotent).
try {
  const carried = backfillLegacyReferrals(db);
  if (carried.relationships || carried.rewards || carried.adjustments) {
    logger.info("Carried legacy referrals into Travel & Earn v3", carried);
  }
} catch (err) {
  logger.warn("Referral backfill failed", { error: err.message });
}

// Backfill canonical location rules and product options on startup (safe, idempotent)
try {
  backfillProductLocationRules(db);
  backfillProductOptions(db);
} catch (err) {
  logger.warn("Startup backfill failed", { error: err });
}


// Tests and explicitly configured demo environments need a complete, bookable
// marketplace without copying a developer database. This seed is idempotent
// and never runs implicitly in production or normal development.
if (process.env.SEED_DEMO_DATA === "true" && process.env.NODE_ENV !== "production") {
  try {
    syncGoaSupplierAndProducts(db);
    backfillProductLocationRules(db);
    backfillProductOptions(db);
  } catch (err) {
    logger.error("Demo marketplace initialization failed", { error: err });
    throw err;
  }
}

// New suppliers need a subscription; give the launch waiver to any without one (ADR 017, idempotent).
try {
  const waivers = syncLaunchWaivers(db);
  if (waivers.created) logger.info("Gave launch waivers to new suppliers", waivers);
} catch (err) {
  logger.warn("Launch waiver sync failed", { error: err.message });
}

// Every supplier gets a public profile link (idempotent).
try {
  const slugged = backfillSupplierSlugs(db);
  if (slugged) logger.info("Assigned supplier profile links", { count: slugged });
} catch (err) {
  logger.warn("Supplier profile link backfill failed", { error: err.message });
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
import mapsRouter from "./routes/maps.js";
import notificationWebhooksRouter from "./routes/notificationWebhooks.js";
import supportRouter from "./routes/support.js";
import reviewsRouter from "./routes/reviews.js";
import analyticsRouter from "./routes/analytics.js";
import seoRouter from "./routes/seo.js";
import { driverAppAssetLinks } from "./lib/androidAppLinks.js";
import publicSuppliersRouter from "./routes/publicSuppliers.js";
import { goRouter, shareRouter } from "./routes/shareKit.js";
import enquiriesRouter from "./routes/enquiries.js";
import securityTxtRouter from "./routes/securityTxt.js";
import metricsRouter from "./routes/metrics.js";
import travelerRouter from "./routes/traveler.js";
import uploadsRouter from "./routes/uploads.js";
import searchRouter from "./routes/search.js";
import exportsRouter from "./routes/exports.js";
import eventsRouter from "./routes/events.js";
import currencyRouter from "./routes/currency.js";
import promoRouter from "./routes/promo.js";
import affiliateRouter from "./routes/affiliate.js";
import referralRouter from "./routes/referral.js";
import adminAffiliatesRouter from "./routes/adminAffiliates.js";
import addonsRouter from "./routes/addons.js";
import circuitOrdersRouter from "./routes/circuitOrders.js";
import availabilityRouter from "./routes/availability.js";
import octoRouter from "./routes/octo.js";
import supplierChannelsRouter from "./routes/supplierChannels.js";
import { swaggerSpec } from "./config/swagger.js";
import { blockPublicKybUploads } from "./services/kybFileService.js";

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
app.use(["/uploads", "/api/uploads/files"], blockPublicKybUploads(db));
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
  app.use(`${prefix}/public/suppliers`, publicSuppliersRouter);
  app.use(`${prefix}/share`, shareRouter);
  app.use(`${prefix}/enquiries`, enquiriesRouter);
  app.use(`${prefix}/suppliers`, suppliersRouter);
  app.use(`${prefix}/supplier-channels`, supplierChannelsRouter);
  app.use(`${prefix}/octo`, octoRouter);
  app.use(`${prefix}/admin`, adminRouter);
  app.use(`${prefix}/analytics`, analyticsRouter);
  app.use(`${prefix}/driver-trips`, driverTripsRouter);
  app.use(`${prefix}/tracking`, trackingRouter);
  app.use(`${prefix}/ops`, opsRouter);
  app.use(`${prefix}/checkout`, checkoutRouter);
  app.use(`${prefix}/support`, supportRouter);
  app.use(`${prefix}/reviews`, reviewsRouter);
  app.use(`${prefix}/webhooks`, notificationWebhooksRouter);
  app.use(prefix, placesRouter);
  app.use(`${prefix}/maps`, mapsRouter);
  app.use(prefix, travelerRouter);
  app.use(prefix, uploadsRouter);
  app.use(prefix, searchRouter);
  app.use(prefix, exportsRouter);
  app.use(prefix, eventsRouter);
  app.use(`${prefix}/currency`, currencyRouter);
  app.use(`${prefix}/promo`, promoRouter);
  app.use(`${prefix}/affiliate`, affiliateRouter);
  app.use(`${prefix}/referral`, referralRouter);
  app.use(`${prefix}/admin/affiliates`, adminAffiliatesRouter);
  app.use(prefix, addonsRouter);
  app.use(`${prefix}/circuit-orders`, circuitOrdersRouter);
  app.use(`${prefix}/availability`, availabilityRouter);
};

mountApiRoutes("/api");
mountApiRoutes("/api/v1");
app.use("/octo", octoRouter);

app.use("/", securityTxtRouter);
app.use("/", seoRouter);
app.use("/", goRouter);

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

// Android App Links: trip links open in the driver app once its certificate is configured.
app.get("/.well-known/assetlinks.json", (_req, res) => {
  const links = driverAppAssetLinks();
  if (!links) return res.status(404).json({ error: "Not configured" });
  res.set("Cache-Control", "public, max-age=3600");
  return res.json(links);
});

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
let dispatchRunning = false;
async function dispatchTick() {
  if (dispatchRunning) return;
  dispatchRunning = true;
  try { processDispatchSchedule(db); await processDispatchOutbox(db, deliverDispatchNotification); }
  catch (error) { logger.error("Driver dispatch worker failed", { error }); }
  finally { dispatchRunning = false; }
}
const dispatchTimer = setInterval(dispatchTick, 30000);
dispatchTimer.unref();
const reservationDeliveryTimer = setInterval(() => {
  queueNotification(processReservationOutbox(db, notifyBookingConfirmed), "Reservation confirmation outbox");
}, 5000);
reservationDeliveryTimer.unref();
const assignmentSlaTimer = setInterval(() => {
  try {
    db.prepare("UPDATE native_reservations SET status = 'EXPIRED' WHERE status = 'ON_HOLD' AND utc_expires_at <= ?").run(new Date().toISOString());
  } catch (error) { logger.error("Native reservation expiry failed", { error }); }
  try { expireBookingHolds(db); } catch (error) { logger.error("Booking hold expiry worker failed", { error }); }
  try { processExpiredSupplierAssignments(db); } catch (error) { logger.error("Supplier assignment SLA worker failed", { error }); }
  try {
    const result = processExpiredCircuitReconfirmations(db);
    for (const orderId of result.orderIds) queueNotification(notifyCircuitReschedule(db, orderId, "REVIEW_REQUIRED"), "Circuit reconfirmation SLA notification");
  } catch (error) { logger.error("Circuit reconfirmation SLA worker failed", { error }); }
}, 30_000);
assignmentSlaTimer.unref();
// Travel & Earn: clear matured rewards, reverse refunded ones, return credit from
// abandoned checkouts, expire lapsed credit, and check the ledger still adds up.
let referralRunning = false;
async function referralTick() {
  if (referralRunning) return;
  referralRunning = true;
  try {
    const result = processReferralLifecycle(db);
    const { notifications, ...counts } = result;
    if (Object.values(counts).some(Boolean)) logger.info("Referral lifecycle pass", counts);
    const drift = findWalletDiscrepancies(db);
    if (drift.length) logger.error("Wallet ledger does not match cached balances", { users: drift.slice(0, 20), count: drift.length });
    await sendReferralNotifications(db, notifications);
    // Coupon uses from checkouts that never went ahead are given back.
    const coupons = releaseCouponRedemptions(db);
    if (coupons.released) logger.info("Released coupon uses", coupons);
  } catch (error) {
    logger.error("Referral lifecycle worker failed", { error });
  } finally {
    referralRunning = false;
  }
}
const referralTimer = setInterval(referralTick, 5 * 60_000);
referralTimer.unref();
// Supplier subscriptions: expire lapsed cover and remind 30, 7 and 1 days before it ends.
async function subscriptionTick() {
  try {
    const { expired, reminders } = processSubscriptionLifecycle(db);
    if (expired || reminders.length) logger.info("Supplier subscription lifecycle pass", { expired, reminders: reminders.length });
    await sendSubscriptionReminders(db, reminders);
    await sendVerificationReminders(db, collectVerificationReminders(db));
  } catch (error) {
    logger.error("Supplier subscription lifecycle failed", { error });
  }
}
const subscriptionTimer = setInterval(subscriptionTick, 60 * 60_000);
subscriptionTimer.unref();
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
  clearInterval(dispatchTimer);
  clearInterval(reservationDeliveryTimer);
  clearInterval(assignmentSlaTimer);
  clearInterval(referralTimer);
  clearInterval(subscriptionTimer);
  server.close(() => {
    try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch (error) { logger.warn("SQLite checkpoint failed", { error }); }
    try { db.close(); } catch (error) { logger.warn("SQLite close failed", { error }); }
    process.exit(0);
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
