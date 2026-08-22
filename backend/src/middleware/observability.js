import { randomUUID } from "node:crypto";
import logger, { redactSensitive } from "../config/logger.js";

const requestIdPattern = /^[A-Za-z0-9._-]{1,100}$/;

function normalizedRoute(req) {
  const routePath = req.route?.path;
  if (routePath) return `${req.baseUrl || ""}${routePath}` || "/";
  const path = String(req.originalUrl || req.path || "/").split("?")[0];
  return path.split("/").map((segment) => {
    if (/^\d+$/.test(segment)) return ":id";
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
    if (/^(aud|book|booking|case|drv|fence|pay|prod|refund|review|settle|sup|task|user|zone)[_-]/i.test(segment)) return ":id";
    return segment;
  }).join("/");
}

export function requestContext(req, res, next) {
  const supplied = String(req.headers["x-request-id"] || "");
  req.requestId = requestIdPattern.test(supplied) ? supplied : randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

function defaultErrorCode(status) {
  if (status === 400) return "INVALID_REQUEST";
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "INTERNAL_ERROR";
  return "REQUEST_FAILED";
}

export function stableErrorResponses(req, res, next) {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400) return sendJson(body);
    const status = res.statusCode;
    const safeError = status >= 500
      ? "An unexpected error occurred"
      : String(body?.error || "Request failed").slice(0, 300);
    return sendJson({
      error: safeError,
      code: body?.code || defaultErrorCode(status),
      requestId: req.requestId,
    });
  };
  next();
}

export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const slowThreshold = Number(process.env.SLOW_REQUEST_MS) || 1_000;
    const meta = {
      event: "http_request",
      requestId: req.requestId,
      method: req.method,
      route: normalizedRoute(req),
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      actorId: req.user?.id || null,
      actorRole: req.user?.role || null,
      ...(Object.keys(req.params || {}).length ? { params: redactSensitive(req.params) } : {}),
      ...(process.env.LOG_REQUEST_BODY === "true" ? { body: redactSensitive(req.body) } : {}),
    };
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 || durationMs >= slowThreshold ? "warn" : "info";
    logger.log(level, "HTTP request completed", meta);
  });
  next();
}

export function apiNotFound(req, res, next) {
  if (!req.path.startsWith("/api")) return next();
  return res.status(404).json({
    error: "API endpoint not found",
    code: "NOT_FOUND",
    requestId: req.requestId,
  });
}

export function errorHandler(error, req, res, _next) {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
  const code = error?.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED");
  logger.error("Request failed", {
    event: "request_error",
    requestId: req.requestId,
    method: req.method,
    route: normalizedRoute(req),
    status,
    actorId: req.user?.id || null,
    actorRole: req.user?.role || null,
    error,
  });
  if (res.headersSent) return res.end();
  return res.status(status).json({
    error: status >= 500 ? "An unexpected error occurred" : error.message,
    code,
    requestId: req.requestId,
  });
}
