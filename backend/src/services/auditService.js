import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import logger from "../config/logger.js";
import { redactSensitive } from "../config/logger.js";

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return {};
  const allowed = ["method", "route", "status", "reason", "previousStatus", "nextStatus", "amount", "channel"];
  return Object.fromEntries(allowed.filter((key) => metadata[key] !== undefined).map((key) => [key, metadata[key]]));
}

function mutationClassification(req) {
  const path = String(req.originalUrl || req.path || "").split("?")[0];
  if (/\/pickup-otp\//.test(path)) return ["BOOKING_OTP_OPERATION", "BOOKING"];
  if (/\/reviews\/admin\//.test(path)) return ["REVIEW_MODERATION", "REVIEW"];
  if (/\/reviews\/.+\/response$/.test(path)) return ["REVIEW_RESPONSE_CHANGED", "REVIEW"];
  if (/\/admin\/finance|\/refund|\/payout|\/settlement/.test(path)) return ["ADMIN_FINANCE_CHANGED", "FINANCE"];
  if (/\/api\/admin\//.test(path)) return ["ADMIN_ACTION", "ADMIN_RESOURCE"];
  if (/\/api\/ops\//.test(path)) return ["OPERATIONS_ACTION", "OPERATIONS_RESOURCE"];
  if (/\/suppliers\/.+\/kyb/.test(path)) return ["SUPPLIER_KYB_CHANGED", "SUPPLIER"];
  if (/\/suppliers\/.+\/geofences/.test(path)) return ["SUPPLIER_COVERAGE_CHANGED", "SUPPLIER"];
  if (/\/suppliers\/.+\/products/.test(path)) return ["SUPPLIER_LISTING_CHANGED", "PRODUCT"];
  if (/\/suppliers\/.+\/(dispatch|assign-driver|drivers|bookings)/.test(path)) return ["SUPPLIER_FULFILLMENT_CHANGED", "BOOKING"];
  if (/\/checkout\/(cancel-booking|calculate-refund)/.test(path)) return ["BOOKING_CANCELLATION_REFUND_CHANGED", "BOOKING"];
  if (/\/api\/(?:v1\/)?circuit-orders/.test(path)) return ["CIRCUIT_ORDER_CHANGED", "CIRCUIT_ORDER"];
  if (/\/api\/support\//.test(path)) return ["SUPPORT_CASE_CHANGED", "SUPPORT_CASE"];
  if (/\/api\/bookings/.test(path)) return ["BOOKING_CHANGED", "BOOKING"];
  return [`${req.method} API_MUTATION`, "API_MUTATION"];
}

export function recordAuditEvent(database, {
  action,
  actor = null,
  resourceType = "API",
  resourceId = null,
  requestId = null,
  ipAddress = null,
  userAgent = null,
  outcome = "SUCCEEDED",
  metadata = {},
}) {
  const id = `aud_${nanoid(16)}`;
  const safe = safeMetadata(metadata);
  const ipHash = ipAddress
    ? `sha256:${createHash("sha256").update(String(ipAddress)).digest("hex")}`
    : null;
  const safeResourceId = resourceId ? redactSensitive(String(resourceId)).slice(0, 160) : null;
  database.prepare(`
    INSERT INTO audit_logs (
      id, action, actor_id, actor_role, resource_type, resource_id,
      request_id, ip_address, user_agent, outcome, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(action || "UNKNOWN").slice(0, 120),
    actor?.id || null,
    actor?.role || null,
    String(resourceType || "API").slice(0, 60),
    safeResourceId,
    requestId,
    ipHash,
    userAgent ? redactSensitive(String(userAgent)).slice(0, 300) : null,
    outcome,
    JSON.stringify(safe),
  );
  return id;
}

export function auditMutations(database) {
  return (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    res.once("finish", () => {
      if (!req.user || res.statusCode >= 400) return;
      const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path;
      try {
        const [action, resourceType] = mutationClassification(req);
        recordAuditEvent(database, {
          action,
          actor: req.user,
          resourceType,
          resourceId: String(req.originalUrl || req.path).split("?")[0],
          requestId: req.requestId,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          metadata: { method: req.method, route, status: res.statusCode },
        });
      } catch (error) {
        logger.error("Audit event could not be persisted", { requestId: req.requestId, route, error });
      }
    });
    next();
  };
}
