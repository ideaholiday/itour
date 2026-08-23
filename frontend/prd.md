# Frontend Product Requirements

## Scope

The Vite React application is the primary marketplace and workspace UI. It serves travelers, suppliers, ground operations, and administrators through route-based experiences backed by the Express API.

## Requirements

- Home must present Indian destinations, featured experiences, trust signals, and a unified search entry point.
- Search must support experience type, destination, category, group mode, and sort filters while preserving state in URL parameters.
- Detail pages must show images, ratings, itinerary or stop sequence, inclusions, cancellation terms, vehicle choices, hotel variants, and recalculated prices.
- Checkout must show the server quote, traveler details, payment state, confirmation, and clear failure or retry paths.
- Travelers must be able to authenticate, view bookings, access vouchers and pickup details, request support, cancel within policy, and submit eligible reviews.
- Supplier, operations, and admin routes must provide usable dashboards for listings, coverage, bookings, dispatch, support, quality, and finance.
- Persist the active Express or Supabase access token and route every protected API call through bearer-token authentication. Never send `X-User-Id` or `X-User-Email`, and never treat Supabase metadata as the source of operational roles.
- Resolve Supabase sessions through the backend database-backed identity endpoint before enabling role-specific navigation. Next.js checkout proxies must forward the verified server-side Supabase bearer token and must not initiate supplier dispatch from the traveler client.
- Report CLS, FCP, INP, LCP, and TTFB as best-effort, non-blocking telemetry with normalized routes and no query strings, identifiers, or PII.
- Route-load every traveler and workspace page, defer optional provider SDKs, and keep the generated JavaScript within the 250 KiB per-chunk and 225 KiB initial-entry budgets.

## UX and Quality

Use responsive layouts, accessible labels and keyboard flows, visible loading/error/empty states, and consistent INR formatting. Never expose secrets, payment credentials, or pickup OTPs in URLs or logs. Track meaningful search, product, checkout, and booking events without blocking user actions.

## Acceptance Criteria

Every API-backed screen handles unavailable data and stable `VALIDATION_ERROR` responses gracefully; protected routes require the correct role; a refreshed URL reproduces search state; and both Vite and Next.js production builds complete in CI. The Vite build must remain within both configured JavaScript budgets; the measured initial entry after route splitting is 213.0 KiB. Root `npm run test:e2e` must pass the Chromium traveler booking/cancellation/refund, supplier assignment acceptance, and operations task/support/refund journeys.
