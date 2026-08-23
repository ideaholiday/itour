import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { optionalAuthMiddleware, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import { metricsSchemas } from "../validators/apiSchemas.js";
import { metricsRegistry, recordWebVital, serializeMetrics } from "../config/metrics.js";

const router = Router();

function tokenMatches(supplied, configured) {
  const actual = Buffer.from(String(supplied || ""));
  const expected = Buffer.from(String(configured || ""));
  return expected.length >= 32 && actual.length === expected.length && timingSafeEqual(actual, expected);
}

function bearerToken(req) {
  const authorization = String(req.headers.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export function identifyMetricsAccess(req, res, next) {
  const configured = process.env.METRICS_TOKEN;
  const scraperToken = req.headers["x-metrics-token"] || bearerToken(req);
  if (tokenMatches(scraperToken, configured)) {
    req.metricsScraper = true;
    return next();
  }
  return optionalAuthMiddleware(req, res, next);
}

export function requireMetricsAccess(req, res, next) {
  if (req.metricsScraper || tokenMatches(req.headers["x-metrics-token"], process.env.METRICS_TOKEN)) return next();
  return requireRoles("ADMIN", "STAFF")(req, res, next);
}

router.get("/metrics", identifyMetricsAccess, requireMetricsAccess, async (_req, res, next) => {
  try {
    res.setHeader("Content-Type", metricsRegistry.contentType);
    res.setHeader("Cache-Control", "no-store");
    return res.send(await serializeMetrics());
  } catch (error) {
    return next(error);
  }
});

router.post("/telemetry/web-vitals", validateBody(metricsSchemas.webVital), (req, res) => {
  recordWebVital(req.body);
  return res.status(202).json({ accepted: true });
});

export default router;
