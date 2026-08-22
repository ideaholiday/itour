# Repository Memory

## Product Context

Idea Holiday is an India-focused travel marketplace for airport transfers, day sightseeing, activities, and multi-day holiday packages. The platform has four operational roles: traveler, supplier/fleet vendor, ground operations, and administrator.

## Repository Shape

- `frontend/` is the Vite React marketplace and role-based workspace.
- `backend/` is the Express API and owns pricing, booking state, fulfillment, notifications, and finance records.
- The root `app/` is a separate Next.js authentication and checkout surface.
- `lib/` and `components/` contain shared root-app helpers and UI.
- Local backend development uses SQLite; deployed persistence uses Supabase PostgreSQL with PostGIS.

## Important Invariants

- The backend is the source of truth for quotes, totals, booking transitions, refunds, commissions, and payouts.
- Browser-provided payment totals must never be trusted without a fresh server-side quote.
- Pickup OTPs are created only after verified payment. Responses to suppliers, drivers, operations, and notifications must not expose the secret.
- Supplier assignment, driver dispatch, pickup verification, refund, and payout changes must remain auditable and role-protected.
- Destructive seed and migration operations require explicit operator intent.

## Local Development

Run the API with `cd backend && npm run dev` on port `4000` when using the Vite client. Run the marketplace with `cd frontend && npm run dev` on port `5173`; it proxies `/api` to the backend. The root Next.js app uses `npm run dev` and normally runs on port `3000`.

Useful checks are `cd backend && npm test`, `cd frontend && npm run build`, and root `npm run build`. Environment variables belong in local `.env` or `.env.local` files and must not be committed.

## Change Guidance

Prefer extending the existing route/service boundaries over duplicating business rules in React. Keep pricing and state-machine logic covered by deterministic backend tests. When changing payment, authentication, notification, database, or migration behavior, update `README.md` and the relevant PRD as part of the same change.
