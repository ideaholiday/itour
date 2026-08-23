import { recordAuditEvent } from "./auditService.js";

/**
 * Logs an analytics event to audit_logs
 * @param {object} db - Database instance
 * @param {object} event - Event details
 * @param {string} event.name - Event name e.g. "search", "booking_created"
 * @param {string} [event.actorId] - Actor / User ID
 * @param {string} [event.actorRole] - "TRAVELER" | "SUPPLIER" | "ADMIN" | "SYSTEM"
 * @param {string} [event.resourceType] - "BOOKING" | "PRODUCT" | "SEARCH"
 * @param {string} [event.resourceId] - Related resource ID
 * @param {object} [event.properties] - Arbitrary JSON metadata
 */
export function logAnalyticsEvent(db, {
  name,
  actorId = null,
  actorRole = "SYSTEM",
  resourceType = "ANALYTICS",
  resourceId = null,
  properties = {}
}) {
  try {
    recordAuditEvent(db, {
      action: `analytics.${name}`,
      actor: actorId ? { id: actorId, role: actorRole } : null,
      resourceType,
      resourceId,
      metadata: properties
    });
  } catch (err) {
    // Fail-open for analytics logging so it never blocks business operations
    console.warn(`[AnalyticsEventLog] Failed to log event "${name}":`, err.message);
  }
}
