# Frontend Product Requirements

## Scope

The Vite React application is the primary marketplace and workspace UI. It serves travelers, suppliers, ground operations, and administrators through route-based experiences backed by the Express API.

## Requirements

- Home must present Indian destinations, featured experiences, trust signals, and a unified search entry point.
- Search must support 5 product models (`TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, `EXPERIENCE`) with product-type tabs, category filters, group modes, sort options, and recent search history stored locally while preserving state in URL parameters.
- Detail pages (`ActivityDetail.jsx`) must render type-specific booking panels matching each product model:
  - **Attraction Tickets & Experiential Tours**: Passenger ticket tiers (`Adult`, `Child`, `Senior`, `Infant`) with age bounds and quantity selectors.
  - **Transfers & Private Tours**: Vehicle category selectors (`SEDAN`, `SUV`, `TEMPO`, `MINI_BUS`) with passenger/luggage capacities and rates.
  - **Seat-In-Coach (SIC) Day Tours**: Physical pickup hubs (`product_sic_hubs`) with departure times and per-seat pricing.
  - **Multi-Day Packages**: Day-by-day activity accordions (`product_itinerary_items`) and hotel tier variants (`Cab Only`, `3-Star`, `4-Star`, `5-Star`).
- Live departure picker (`LiveDeparturePicker.jsx`) must poll uncached availability every 15 seconds, display available departure slots with real-time seat vacancies, and disable closed or cutoff departures.
- Checkout must create an owner-bound 10-minute hold (`native_reservations`), display the live hold countdown timer, show a type-aware summary, and present clear payment and failure paths.
- Checkout must use product-scoped pickup/drop autocomplete and inline validation, display fixed airport/station anchors as read-only, collect route-appropriate flight timing, lock day-tour itineraries, and validate package hotels against each itinerary city.
- Supplier Extranet must provide the Seats and Schedule Inventory Editor (`SupplierInventoryEditor.jsx`) under Listings to configure operating weekdays, departure times, maximum seat capacities, adult/child unit prices, cut-off minutes, cancellation deadline hours, and blackout calendars.
- Multi-domain routing (`domainContext.js`) must resolve subdomains (`supply.ideaholiday.in`, `admin.ideaholiday.in`, `ideaholiday.in`) and local development fallbacks (`supply.localhost:5173`, `admin.localhost:5173`, `?portal=supplier`, `?portal=admin`) to render dedicated entry points and role-scoped sign-in pages (`SupplierLoginPage.jsx`, `AdminLoginPage.jsx`).
- Supplier Channel Manager (`SupplierChannelManagerPage.jsx` at `/supplier/channels`) must allow suppliers to manage ResTech integrations (Bókun, FareHarbor, Bookingkit, TourCMS, Activitar, Anchor, generic OCTo), execute live connection tests, inspect remote products, and import catalog items with single-click mapping.
- Circuit Planner must request a server-owned multi-item quote instead of redirecting to the first itinerary product. It must show live line totals, quote expiry, and any custom or unavailable items that block grouped checkout.
- A ready circuit quote must be consumed into a resumable parent order, present one Cashfree, Razorpay, or demo payment session with the live hold countdown, and show one confirmation covering every child booking. It must never submit separate line-item charges or present partial success.
- Confirmed circuits must expose one parent management workspace for grouped cancellation/refund previews and whole-circuit rescheduling. It must clearly distinguish a submitted request from an applied change. Operations must have a queue showing every child stop, policy or proposed date, and an audited approve/reject action.
- Travelers must be able to authenticate, view bookings, access digital vouchers with QR codes and pickup details, request support, cancel within policy, and submit eligible reviews.
- Supplier, operations, and admin routes must provide usable dashboards for listings, coverage, bookings, dispatch, support, quality, and finance.
- Persist the active Express or Supabase access token and route every protected API call through bearer-token authentication. Never send `X-User-Id` or `X-User-Email`, and never treat Supabase metadata as the source of operational roles.
- Resolve Supabase sessions through the backend database-backed identity endpoint before enabling role-specific navigation. Next.js checkout proxies must forward the verified server-side Supabase bearer token and must not initiate supplier dispatch from the traveler client.
- Report CLS, FCP, INP, LCP, and TTFB as best-effort, non-blocking telemetry with normalized routes and no query strings, identifiers, or PII.
- Route-load every traveler and workspace page, defer optional provider SDKs, and keep the generated JavaScript within the 250 KiB per-chunk and 225 KiB initial-entry budgets.

## UX and Quality

Use responsive layouts, accessible labels and keyboard flows, visible loading/error/empty states, and consistent INR formatting. Never expose secrets, payment credentials, or pickup OTPs in URLs or logs. Track meaningful search, product, checkout, and booking events without blocking user actions.

## Acceptance Criteria

Every API-backed screen handles unavailable data and stable `VALIDATION_ERROR`/location errors gracefully; protected routes require the correct role; a refreshed URL reproduces search state; and both Vite and Next.js production builds complete in CI. The Vite build must remain within both configured JavaScript budgets; the measured initial entry after route splitting is 213.0 KiB. Root `npm run test:e2e` must pass the Chromium traveler booking/cancellation/refund, supplier assignment acceptance, operations task/support/refund, native reservations extranet and held booking flow, and Mopa service-area validation journeys.
