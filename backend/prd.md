# Backend Product Requirements

## Scope

The Express service is the source of truth for marketplace data, pricing, booking state, fulfillment, communications, and finance controls. It supports SQLite for local development and Supabase PostgreSQL/PostGIS for persistent deployments.

## Requirements

- Expose APIs for activities, places, transfers, authentication, bookings, checkout, suppliers, operations, administration, analytics, support, reviews, and notification webhooks.
- Calculate canonical quotes server-side, including vehicle capacity, geo-fence coverage, distance, tolls, permits, GST, commission, and supplier payout.
- Enforce product-scoped pickup/drop semantics through the canonical location registry and location rules at transfer/day-tour/package quote and booking boundaries, including fixed IATA anchors, state/city fences, polygon/radius checks, flight timing, slots/cutoffs, and per-night hotel cities.
- Calculate and persist expiring canonical circuit quotes by repricing each linked itinerary item for its scheduled day and guest count; return unlinked or unavailable items as non-priced issues.
- Atomically consume an owned, unexpired, fully ready circuit quote into one idempotent parent order, one pending-payment child booking per quote line, pending payout snapshots, and expiring inventory holds. A failure on any line must roll back the whole order, and abandoned holds must release their booking-backed capacity.
- Create and verify one Cashfree or Razorpay payment order per circuit order. A captured payment must atomically confirm every child, create OTPs, consume holds, secure payouts, write finance events and start supplier acceptance. Webhook replays must be idempotent; failed payments release every child, and captured amount/expiry conflicts enter operations review without activating bookings.
- Persist idempotent parent-level circuit management requests. Cancellation approval must calculate every child policy, send at most one parent gateway refund and atomically cancel every child, payout and order item. Reschedule approval must revalidate every supplier/date and move all children by one consistent offset. Rejection changes no child, and provider failure must remain retryable without partial cancellation.
- Create idempotent pending-payment bookings and transition them only through authorized, auditable state changes.
- Protect pickup OTPs with hashing and encryption, enforce expiry and attempt limits, and prevent unauthorized API responses from containing the secret.
- Implement supplier assignment SLAs, driver/vehicle conflict checks, trip status, notification delivery logs, refund records, payout states, and reconciliation checks.
- Validate all data-bearing mutation payloads through centralized Zod schemas and global structural limits, authenticate role-sensitive routes, redact credentials and personal data from logs, and verify webhook signatures.
- Accept existing Express JWTs and verified Supabase access tokens, while resolving every operational role, supplier link, and ownership decision from the backend database. Client identity headers and Supabase role metadata are never authorization inputs.
- Enforce centralized role, supplier-self, booking-owner, and scheduler guards across all protected routes, returning `401/AUTH_REQUIRED` for missing/invalid identity and `403/FORBIDDEN` for insufficient scope.
- Emit request-correlated Winston JSON to stdout with recursive redaction and body logging disabled by default. Persist successful sensitive mutations and authorization denials in `audit_logs` without secrets, request bodies, full PII, or raw IP addresses.
- Export low-cardinality Prometheus-compatible process, HTTP, search, booking, payment, refund, database, and Web Vital metrics. Protect metric scraping with an operations role or a dedicated server-side token; accept only bounded, non-PII browser performance samples.
- Support dual SQLite & PostgreSQL versioned database migrations (`_schema_migrations`) with forward batch application and rollback capabilities.
- Provide executive business intelligence and analytics endpoints (`/api/analytics/*`) aggregating real-time KPIs, conversion funnels, supplier scorecards, and Z-score anomaly alerts.

## Acceptance Criteria

Protected APIs require `Authorization: Bearer <express-or-supabase-token>`. API errors use `{ error, code, requestId }`, responses include `X-Request-Id`, and validation failures use `400/VALIDATION_ERROR` without echoing input. Location failures additionally include a safe `detail.suggestion` and allowed area/state. `GET /api/metrics` requires `ADMIN`/`STAFF` or `X-Metrics-Token`; `POST /api/telemetry/web-vitals` rejects unknown and unbounded fields. Local tests run deterministically without live providers or developer-database copies. `cd backend && npm run test:coverage` must pass the backend suite and the 70% line/function gate, and `npm run test:integration` must complete the real-HTTP traveler, circuit-order, grouped-payment, and location-validation journeys before merge. Versioned schema changes and migrations execute atomically via `npm run migrate:up/status/down`, support SQLite-safe conditional columns, verify applied-file checksums, and never remove ledger entries without a real down migration. Destructive seed and migration operations require explicit intent.
