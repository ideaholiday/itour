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
import { supabase } from "./supabaseClient.js";
import { processExpiredSupplierAssignments } from "./services/assignmentSlaService.js";
import { syncGoaSupplierAndProducts } from "./scripts/seedGoaSupplierProducts.js";
import { configureSecurity } from "./middleware/security.js";
import { apiNotFound, errorHandler, requestContext, requestLogger, stableErrorResponses } from "./middleware/observability.js";
import { auditMutations } from "./services/auditService.js";
import { requestBoundary } from "./middleware/validation.js";

// Ensure supplier and Goa products are synchronized across environments
try {
  syncGoaSupplierAndProducts(db);
} catch (err) {
  logger.warn("Goa supplier sync failed", { error: err });
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
import seoRouter from "./routes/seo.js";

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
app.use(requestLogger);
app.use(auditMutations(db));

// API Routes
app.use("/api", activitiesRouter);
app.use("/api/auth", authRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/transfers", transfersRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/ops", opsRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/support", supportRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/webhooks", notificationWebhooksRouter);
app.use("/api", placesRouter);
app.use("/", seoRouter);

app.get("/api/health", (req, res) =>
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
  try { processExpiredSupplierAssignments(db); } catch (error) { logger.error("Supplier assignment SLA worker failed", { error }); }
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
