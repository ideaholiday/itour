# Repository Memory

## Product Context

Idea Holiday is an India-focused travel marketplace for airport transfers, day sightseeing, activities, attraction tickets, and multi-day holiday packages. The platform has four operational roles: traveler, supplier/fleet vendor, ground operations, and administrator.

## Repository Shape

- `frontend/` is the Vite React marketplace and role-based workspace.
- `backend/` is the Express API and owns pricing, booking state, fulfillment, notifications, and finance records.
- The root `app/` is a separate Next.js authentication and checkout surface.
- `lib/` and `components/` contain shared root-app helpers and UI.
- Local backend development uses SQLite; deployed persistence uses Supabase PostgreSQL with PostGIS.

## Important Invariants

- The backend is the source of truth for quotes, totals, booking transitions, refunds, commissions, and payouts.
- Browser-provided payment totals must never be trusted without a fresh server-side quote.
- Pickup and drop coordinates are never trusted without product-scoped validation. Canonical locations and product rules enforce fixed airport/station anchors, state/city/radius/polygon boundaries, flight timing, day-tour slots/cutoffs, and package hotel cities; non-canonical in-zone points are explicitly flagged for operations review.
- Native seat inventory (`native_inventory_rules`, `native_availability_slots`, `native_reservations`) uses database transactions to serialize capacity mutations on the product row. Capacity equals configured maximum minus confirmed seats and unexpired holds.
- Holds are 10-minute owner-bound locks created upon checkout entry. Refreshing checkout reuses the existing hold and expiry. Expired holds stop occupying seats immediately in vacancy checks.
- Verified payment transitions a hold from `ON_HOLD` to `CONFIRMED` without double-deduction. Failed payments release holds; captures after expiry/failure enter `PAYMENT_REVIEW_REQUIRED` without confirming sold seats.
- Durable confirmation notifications use `native_reservation_outbox` processed every 5 seconds to guarantee at-least-once delivery with replay-safe idempotency keys.
- The marketplace operates a 5-product-types architecture (`TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, `EXPERIENCE`) backed by additive tables (`product_ticket_tiers`, `product_vehicle_options`, `product_sic_hubs`, `product_hotel_tiers`, `product_itinerary_items`).
- Frontend utilizes specialized booking panels on `ActivityDetail.jsx`, `LiveDeparturePicker.jsx` for real-time departure selection, and `SupplierInventoryEditor.jsx` for extranet schedule and quota management.
- Circuit Planner estimates are informational. A persisted 15-minute circuit quote reprices linked products per trip day and flags custom or unavailable items. Consuming an owned `READY` quote atomically creates an idempotent parent circuit order, pending-payment child bookings, payout snapshots, and expiring booking-backed inventory holds. One verified parent payment atomically activates all children; failures release all holds, and late or mismatched captures are quarantined without partial activation.
- Ready circuit quotes continue through `/circuit-checkout/:id` and `/circuit-confirmed/:ref`. The browser persists only the quote-to-order idempotency mapping; canonical status, totals, holds, payment references, and child bookings always reload from the backend.
- Confirmed circuits are managed at `/circuit/:ref/manage`; operations reviews their idempotent parent requests at `/ops/circuits`. Cancellation/refund and rescheduling are never executed child-by-child from My Trips. Operations approval revalidates policy/inventory and applies every child in one transaction; a failed parent refund leaves every child confirmed and marks the request retryable.
- Approved circuit reschedules start a 24-hour supplier reconfirmation SLA. Acceptance rolls up across all stops; a decline or timeout holds the parent circuit for operations instead of invoking single-booking supplier fallback. Reschedule milestones use idempotent traveler/supplier notifications. Live Cashfree and Razorpay refund events reconcile the parent request by provider reference/payment reference and require exact amount agreement before final refund notification.
- Migration batches are atomic, applied SQL is checksum-protected, and rollback must have an explicit down section.
- Pickup OTPs are created only after verified payment. Responses to suppliers, drivers, operations, and notifications must not expose the secret.
- Supplier assignment, driver dispatch, pickup verification, refund, and payout changes must remain auditable and role-protected.
- Multi-domain routing enforces portal separation: `supply.ideaholiday.in` for suppliers, `admin.ideaholiday.in` for platform administration, and `ideaholiday.in` for travelers. Single-port local development resolves `supply.localhost:5173`, `admin.localhost:5173`, or URL query fallbacks (`?portal=supplier`, `?portal=admin`) without manual DNS mapping.
- Supplier Channel Manager (`/supplier/channels`) connects external ResTech systems (`BOKUN`, `FAREHARBOR`, `BOOKINGKIT`, `TOURCMS`, `ACTIVITAR`, `ANCHOR`, `OCTO_GENERIC`) via `supplier_channel_connections` (migration 020) and maps external experiences into `activities` and `reservation_external_references`.
- OCTo specification endpoints (`/api/octo/v1/*`) expose standard capabilities, supplier data, catalog discovery, availability checks, 10-minute cart locks, instant confirmation, and policy cancellations.
- Destructive seed and migration operations require explicit operator intent.

## Local Development

Run the API with `cd backend && npm run dev` on port `4000` when using the Vite client. Run the marketplace with `cd frontend && npm run dev` on port `5173`; it proxies `/api` to the backend. The root Next.js app uses `npm run dev` and normally runs on port `3000`.

Useful checks are `cd backend && npm run test:coverage` (264 unit tests across 9 suites), `cd backend && npm run test:integration` (13 isolated HTTP tests), `cd backend && node scripts/test-native-postgres.js`, `cd frontend && npm run build`, root `npm run build`, and root `npm run test:e2e`. The integration and Playwright suites create isolated temporary SQLite databases and disable live notification/payment providers. Environment variables belong in local `.env` or `.env.local` files and must not be committed.

Runtime performance telemetry is centralized in `backend/src/config/metrics.js`. `GET /api/metrics` is private and accepts an admin/staff bearer identity or a dedicated server-only scraper token through standard bearer authorization or `X-Metrics-Token`; `POST /api/telemetry/web-vitals` accepts strictly bounded non-PII samples from both clients. Vite builds enforce the chunk budget through `frontend/scripts/check-bundle-size.js`.

The reproducible monitoring stack is `docker-compose.observability.yml`: Prometheus securely scrapes the API, Grafana provisions API-health and marketplace/UX dashboards, and seven initial alert rules cover scrape loss, 5xx rate, API/database latency, payment failures, LCP, and INP. Production Cloud Run sidecar deployment and notification receivers remain operator-owned live-infrastructure steps.

All Vite page/workspace routes use `React.lazy`, and Supabase session synchronization loads its SDK dynamically. The measured initial entry is 213.0 KiB instead of 616.2 KiB. `frontend/scripts/check-bundle-size.js` rejects any chunk above 250 KiB or initial entry above 225 KiB.

## Change Guidance

Prefer extending the existing route/service boundaries over duplicating business rules in React. Keep pricing and state-machine logic covered by deterministic backend tests. When changing payment, authentication, notification, database, or migration behavior, update `README.md` and the relevant PRD as part of the same change.
