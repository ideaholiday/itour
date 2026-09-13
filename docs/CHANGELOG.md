# Changelog: Idea Holiday

All notable technical and architectural changes to this project are documented in this file.

---

## [2026-09-13] - Dispatch Phase 5: Trip Completion, Stuck Trips, Problem Reports, Timeline
- **Change**:
  1. Drivers who have used half of the response window get one reminder to accept or decline.
  2. Trip watch in the dispatch worker: accepted trips not started 1 hour after pickup (CRITICAL, supplier and operations), and started trips still open 2 hours (HIGH, driver and supplier) and 6 hours (CRITICAL, operations) after their expected end. Tasks close and unsent alerts are dropped when the trip starts or completes. Alerts use the approved trip status template.
  3. Operations can start an accepted trip without the pickup OTP and complete a started trip, each with a required reason stored on the timeline.
  4. A complaint, safety or refund-dispute case on a completed booking holds its unbatched payout (`ISSUE_HOLD`) until the last such case closes. Held payouts count as pending in supplier and admin totals.
  5. The completion message and review invite link to `/bookings?report=REF`, which opens the problem report form in My Trips. Review invites were only sent when an admin pressed a button; a new hourly `post-trip-invites` Cloud Scheduler job now sends them.
  6. Supplier and operations dispatch timeline (driver requests with auto-assignment scores, acceptances by link or phone, declines, timeouts, removals, trip status with reasons) in the dispatch queue and booking panel.
  7. A supplier marking a dispatched booking completed now goes through the dispatch workflow (previously it skipped the timeline, traveler notification and affiliate completion), and errors such as "Driver must accept this assignment first" are returned instead of a generic failure.
  8. `enqueueDispatch` returns `null` when the job already existed.
- **Affected Components**: `backend/src/services/dispatchWorkflowService.js`, `backend/src/services/dispatchStateService.js`, `backend/src/services/driverDispatchService.js`, `backend/src/services/dispatchNotificationService.js`, `backend/src/services/notificationService.js`, `backend/src/services/supportCaseService.js`, `backend/src/services/financeService.js`, `backend/src/routes/ops.js`, `backend/src/routes/suppliers.js`, `backend/src/routes/admin.js`, `backend/src/validators/apiSchemas.js`, tests, `frontend/src/components/supplier/DispatchTimeline.jsx`, `frontend/src/components/supplier/DispatchQueue.jsx`, `frontend/src/components/supplier/SupplierBookingManager.jsx`, `frontend/src/pages/MyBookings.jsx`, `docs/BUSINESS_RULES.md`, `docs/API_CONTRACTS.md`, `docs/ENVIRONMENT.md`.
- **Migration Requirements**: None. Resume the `post-trip-invites` Cloud Scheduler job after deploying.

---

## [2026-09-13] - Dispatch Phase 3: Automatic Assignment by Default, Driver Scoring
- **Change**:
  1. Automatic driver assignment is on for suppliers that have not saved a preference (`DISPATCH_AUTO_DEFAULT`, default `true`); the dispatch API returns effective settings and whether they come from the default or the supplier.
  2. Drivers are ranked by supplier priority, then a 0–100 score: acceptance reliability over 90 days (50, smoothed from 80%), smoothed review rating (30), and same-day workload (20), replacing a count of all open trips. The score breakdown is stored on the `ASSIGNED` event.
  3. Driver accept, phone confirmation, decline and response timeout now record the driver on the audit event (new `TIMED_OUT` event) and the outcome on `dispatch_attempts`, so reliability can be measured.
  4. Suppliers are notified when a driver is auto-assigned (`DRIVER_AUTO_ASSIGNED`, dropped if the driver already accepted).
  5. The supplier dispatch queue shows fleet readiness: which drivers cannot be auto-assigned and what is missing. In production both existing fleet drivers lacked an email and seat capacity, so no automatic assignment could have succeeded.
- **Affected Components**: `backend/src/services/dispatchWorkflowService.js`, `backend/src/services/driverDispatchService.js`, `backend/src/services/dispatchNotificationService.js`, `backend/src/routes/suppliers.js`, `backend/test/dispatchWorkflowService.test.js`, `backend/test/dispatchNotificationService.test.js`, `frontend/src/components/supplier/DispatchQueue.jsx`, `docs/BUSINESS_RULES.md`, `docs/ENVIRONMENT.md`, `docs/API_CONTRACTS.md`.
- **Migration Requirements**: None.

---

## [2026-09-13] - Dispatch Phase 4: Manual Assignment Fallback
- **Change**:
  1. Escalation ladder for bookings without an accepted driver: 24 hours (supplier and operations, task `HIGH`), 12 hours (task `CRITICAL`), 6 hours (operations take over). One alert per stage per schedule, only the tightest stage reached, configurable with `DISPATCH_ESCALATION_HOURS`. Task priority never drops.
  2. "Confirmed by phone": suppliers and operations can record a pending driver's acceptance with a required note, including at assignment time. Same effect as the driver accepting (notifications, task closed), audited as `ACCEPT_BY_PHONE`. Driver-link acceptance and phone confirmation share one code path.
  3. Dispatch queue (supplier and ops) lists open tasks by time to pickup with priority, supplier contact and driver state. Operations can assign from the booking supplier's fleet (with availability reasons) or an outside driver, optionally confirmed by phone, straight from the queue.
  4. Supplier driver picker shows available drivers first and unavailable ones disabled with the reason; the outside-driver form asks for the vehicle model instead of reusing the booked category.
  5. Fixed the Live Trip Board fallback form: it never sent driver email or seat capacity, so every submission was rejected, and it was prefilled with a made-up driver phone number that would have received a real trip link.
- **Affected Components**: `backend/src/services/dispatchWorkflowService.js`, `backend/src/routes/ops.js`, `backend/src/routes/suppliers.js`, `backend/src/validators/apiSchemas.js`, `backend/test/dispatchWorkflowService.test.js`, `frontend/src/components/supplier/DispatchQueue.jsx`, `frontend/src/components/supplier/SupplierBookingManager.jsx`, `frontend/src/pages/ops/LiveTripBoardView.jsx`, `docs/BUSINESS_RULES.md`, `docs/API_CONTRACTS.md`, `docs/ENVIRONMENT.md`.
- **Migration Requirements**: None.

---

## [2026-09-13] - Scheduler Jobs Repointed and Safe GitHub Deploys
- **Change**:
  1. Cloud Scheduler jobs `idea-holiday-queue-drain` and `idea-holiday-schedule-run` targeted Cloud Run Jobs that never existed and failed every minute with NOT_FOUND. They now call the API with `X-Scheduler-Token`: `schedule-run` → `/api/ops/process-assignment-timeouts` every 5 minutes, `queue-drain` → the new `/api/ops/process-reservation-outbox` every minute.
  2. New `POST /api/ops/process-reservation-outbox` (scheduler token or ADMIN/STAFF) delivers booking confirmations, which were otherwise driven only by the in-process timer Cloud Run throttles.
  3. New `driver-dispatch` job calls `/api/ops/process-driver-dispatch` every 5 minutes.
  4. `.github/workflows/deploy.yml` uses `--update-env-vars` for staging and production, so a GitHub deploy no longer deletes the service's WhatsApp, email and payment configuration.
- **Affected Components**: `backend/src/routes/ops.js`, `.github/workflows/deploy.yml`, `docs/ENVIRONMENT.md`.
- **Migration Requirements**: None. `idea-holiday-queue-drain` stays paused until a build containing `/process-reservation-outbox` is deployed.

---

## [2026-09-13] - Fix Production Migrations Stuck Since 024, and Missing staff_tasks.supplier_id
- **Change**:
  1. On Postgres, `executeMigrationSql` now sends a migration file one statement at a time (leading comments stripped). The adapter translates SQLite syntax such as `INSERT OR IGNORE` only at the start of a statement, so the mid-file `INSERT OR IGNORE` in migration 026 reached Postgres untranslated and failed with `syntax error at or near "OR"`. Because pending migrations share one transaction, 025–030 were all rolled back on every start since 12 Sep: the dispatch worker failed every 30 seconds on the missing `dispatch_lock`, and affiliate, review-invite and referral v3 tables were absent.
  2. Migration `031_staff_task_supplier.sql` adds `staff_tasks.supplier_id` (backfilled from the booking, indexed). Dispatch "assign manually" tasks and the supplier dispatch queue used this column, but no migration ever created it.
  3. Dispatch test fixtures now build `staff_tasks` through the real migrations instead of declaring the column by hand, which had hidden the missing column.
  4. `deploy.sh` now carries the seven `WHATSAPP_TEMPLATE_DISPATCH_*` variables, the trip reminder, review and circuit template variables, and the `ASSIGNMENT_SCHEDULER_TOKEN` secret, since its `--set-env-vars` and `--set-secrets` replace anything not listed.
- **Verification**: The production schema structure (no data) was copied into a local Postgres; the old path reproduced the production error, the fixed runner applied 025–031, a rerun applied nothing, and a dispatch cycle created the task, queued the alert with the approved template and retried a provider failure.
- **Affected Components**: `backend/src/services/migrationRunner.js`, `backend/migrations/031_staff_task_supplier.sql`, `backend/test/migrationRunner.test.js`, `backend/test/dispatchWorkflowService.test.js`, `backend/test/dispatchNotificationService.test.js`, `deploy.sh`.
- **Migration Requirements**: Migrations 025–031 apply on the next start. Migration 025 clears placeholder ratings on products, suppliers and drivers without published reviews, per BUSINESS_RULES §9.1.

---

## [2026-09-13] - Dispatch Alerts Phase 2: WhatsApp Templates and 24-Hour Notifications
- **Change**:
  1. Seven Meta utility templates for dispatch (`WHATSAPP_TEMPLATE_DISPATCH_*`; five new `idea_holiday_dispatch_*` templates plus the already approved `idea_holiday_driver_trip` and `idea_holiday_driver_details`), each with separate single-line values, replacing one generic `TRIP_STATUS` template whose single value held the whole multi-line message. Meta rejects template values with new lines, so those WhatsApps were failing.
  2. `whatsAppTemplate` flattens every value (new lines and tabs become ` · `, long runs of spaces are shortened, empty values become `-`). This applies to all templates, not only dispatch.
  3. Dispatch emails are an HTML trip card (booking, pickup, driver, vehicle, action button) with a plain-text part. `sendRecipientChannels` accepts `emailHtml`.
  4. New 2-hour pickup reminder for the driver (`DRIVER_PICKUP_REMINDER`), skipped once the driver is on the way.
  5. The 24-hour reminder is skipped when the driver confirmed inside the window, because the confirmation already carried the same details.
  6. Supplier is told when a driver confirms. Operations no longer receive a WhatsApp and email for every trip status; they are alerted only when a driver must be assigned. The traveler gets on-the-way and arrived updates; the supplier gets started and completed.
  7. Reminder subject says "today" or "tomorrow" from India time.
  8. An unset dispatch template logs a warning once and falls back to free text, which Meta only delivers inside a 24-hour customer window.
- **Reason**: Dispatch WhatsApps were built in a shape Meta rejects, and staff were flooded with routine trip progress while drivers had no same-day reminder.
- **Affected Components**: `backend/src/services/dispatchNotificationService.js`, `backend/src/services/dispatchWorkflowService.js`, `backend/src/services/whatsappService.js`, `backend/src/services/notificationService.js`, `backend/test/dispatchNotificationService.test.js`, `docs/ENVIRONMENT.md`, `docs/BUSINESS_RULES.md`, `.env.example`.
- **Migration Requirements**: None. Submit the seven templates in `docs/ENVIRONMENT.md` §3.1.1 to Meta and set their names in Cloud Run.

---

## [2026-09-13] - Dispatch Alerts Phase 1: Reliable Driver and 24-Hour Notifications
- **Change**:
  1. Dispatch notification queue retries provider failures with backoff (2 → 32 minutes) and dead-letters after 6 attempts to `FAILED` plus an open `NOTIFICATION_FAILED` staff task, instead of retrying every 5 minutes forever.
  2. A permanently unreachable recipient (invalid phone or email) no longer blocks the other recipients of the same alert; channels switched off by configuration are not failures. Delivery results now carry `channel` and `recipientRole`.
  3. "Assign manually" alerts are raised again for every lost driver (decline, timeout, replacement), with one 24-hour deadline alert and one overdue alert per schedule. Previously only the first alert per booking was ever sent.
  4. Revoking a driver cancels only that driver's queued jobs, so the traveler's 24-hour reminder and operations alerts survive a decline. Unassigned reminders and alerts are dropped once a driver has accepted.
  5. Admin force-cancel writes lowercase `cancelled` and removes the driver immediately; dispatch reads booking cancellation case-insensitively.
  6. Admin "Manual Driver Dispatch" goes through `assignDriverToBooking` (validation, conflict check, audit, driver request link) instead of inserting a placeholder driver with a fake phone and plate. The form now asks for driver email, seat capacity and vehicle model.
  7. Documented Cloud Scheduler as the primary dispatch trigger, because Cloud Run throttles the in-process timer.
- **Reason**: 24-hour reminders and driver alerts could be late, silently dropped, or retried forever, and admin driver reassignment produced an assignment the driver was never told about.
- **Affected Components**: `backend/src/services/dispatchWorkflowService.js`, `backend/src/services/dispatchStateService.js`, `backend/src/services/notificationService.js`, `backend/src/routes/admin.js`, `backend/src/validators/apiSchemas.js`, `frontend/src/pages/admin/FinanceOverviewView.jsx`, `backend/test/dispatchWorkflowService.test.js`, `docs/ENVIRONMENT.md`.
- **Migration Requirements**: None. Create the `driver-dispatch` Cloud Scheduler job described in `docs/ENVIRONMENT.md` §5.

---

## [2026-09-13] - Travel & Earn v3: Traveler Referrals Funded From Margin
- **Change**:
  1. Rewards are 10% of each booking's own commission — to the friend off their first paid trip, and to the referrer on every trip the friend takes for 24 months — replacing flat ₹250–₹500 amounts that could exceed a booking's commission.
  2. New `referralService.js` with durable referrer↔friend relationships, server-side link attribution, a 7-day clearing hold, full reversal on refund with clawback, 12-month credit expiry, velocity review, and self-referral checks on account, phone, mailbox, browser and booking phone.
  3. Wallet balance now moves only through a typed ledger; a failed wallet deduction aborts the booking instead of leaving a free discount, and spent credit is returned when a checkout is abandoned or refunded.
  4. Removed the second reward engine in `promoService` (wired from driver dispatch completion), the `user_referrals` insert that could reward one booking twice, and the full-table referral code scan.
  5. Bookings record `referral_discount_inr` and `wallet_credit_applied_inr`, so charged amount plus discounts again equals commission plus supplier payout.
  6. Frontend: Travel & Earn page rewritten against the real rules (fabricated activity feed and flat-reward promises removed), server-priced friend discount at checkout, invite prompts after booking and review and on the PDF voucher, friend discount and wallet credit lines on the invoice, self-hosted QR, and an admin Travel & Earn view with cost-as-share-of-margin metrics and a review queue.
- **Reason**: Make referral marketing self-funding and correct: the old program could lose money per booking, never clawed back refunds, and had two engines paying the same referral.
- **Affected Components**: `backend/migrations/030_referral_program_v3.sql`, `backend/src/services/referralService.js`, `backend/src/services/loyaltyService.js`, `backend/src/services/promoService.js`, `backend/src/services/driverDispatchService.js`, `backend/src/services/financeService.js`, `backend/src/services/bookingModificationService.js`, `backend/src/routes/referral.js`, `backend/src/routes/bookings.js`, `backend/src/routes/auth.js`, `backend/src/routes/checkout.js`, `backend/src/routes/suppliers.js`, `backend/src/routes/promo.js`, `backend/src/server.js`, `frontend/src/pages/TravelAndEarn.jsx`, `frontend/src/pages/Checkout.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/admin/ReferralProgramView.jsx`, `frontend/src/components/traveler/ShareTripInvite.jsx`.
- **Migration Requirements**: Migration `030_referral_program_v3.sql` runs on startup; `backfillLegacyReferrals` then carries v1 referrals over once.

---

## [2026-09-11] - Multi-Domain Segregation, Standard OCTo API & ResTech Ingestion
- **Change**: 
  1. Multi-Domain Routing & Authentication: Segregated `ideaholiday.in` (traveler consumer marketplace), `supply.ideaholiday.in` (supplier reservation extranet & dedicated login), and `admin.ideaholiday.in` (platform administration & dedicated login) with role enforcement on login.
  2. Standard OCTo API Server: Implemented standard OCTo v1 specification at `/api/octo` and `/octo` (`/capabilities`, `/suppliers`, `/products`, `/availability`, `/bookings/reservation`, `/bookings/confirmation`, `/bookings/cancellation`).
  3. Multi-Channel ResTech Ingestion: Implemented channel connection manager and remote product import for Bókun, FareHarbor, Bookingkit, Palisis/TourCMS, Activitar, Anchor, and generic OCTo endpoints, mapping external references to `reservation_external_references`.
- **Reason**: Empower suppliers to manage real-time inventory and import products from existing booking channels, while isolating supplier extranet and admin operations onto dedicated subdomains.
- **Affected Components**: `backend/migrations/020_supplier_channel_connections.sql`, `backend/src/routes/octo.js`, `backend/src/services/octoService.js`, `backend/src/services/channelManagerService.js`, `backend/src/services/channels/channelRegistry.js`, `backend/src/routes/supplierChannels.js`, `backend/src/routes/auth.js`, `frontend/src/lib/domainContext.js`, `frontend/src/pages/SupplierLoginPage.jsx`, `frontend/src/pages/AdminLoginPage.jsx`, `frontend/src/pages/supplier/SupplierChannelManagerPage.jsx`, `frontend/src/App.jsx`.
- **Migration Requirements**: Applied migration `020_supplier_channel_connections.sql`.

---

## [2026-09-08] - Meta WhatsApp Cloud API Linking & Template Delivery Fixes
- **Change**: Subscribed Meta App ID `1488217219329539` ("Idea Holiday Pvt Ltd") to WABA `794585599913804`, added `WHATSAPP_APP_ID` to `backend/.env`, and updated the Operations notification test endpoint to dispatch approved Meta templates (`idea_holiday_ops_alert`, `hello_world`) rather than plain text.
- **Reason**: Handsets outside the 24-hour customer care window were not receiving free-form test messages due to Meta Cloud API restrictions, and the WABA was previously linked only to an older app ID.
- **Affected Components**: `backend/.env`, `backend/src/services/whatsappService.js`, `backend/src/routes/ops.js`, `backend/src/validators/apiSchemas.js`.
- **Migration Requirements**: None.

---

## [2026-09-07] - 5-Product-Types Marketplace Architecture & Rebuilt Booking Panels
- **Change**: Implemented additive 5-product-types architecture supporting `TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, and `EXPERIENCE`. Rebuilt `ActivityDetail.jsx` with specialized booking panels for each product type, added search category tabs and recent searches, and updated checkout with type-aware summaries.
- **Reason**: Enable dedicated booking UX and pricing models for attractions (passenger age tiers), private/shared transfers (vehicle options), shared day tours (SIC hubs), and holiday packages (hotel accommodation tiers) without monolithic schema changes.
- **Affected Components**: `backend/migrations/017_five_product_types.sql`, `backend/src/routes/activities.js`, `frontend/src/pages/ActivityDetail.jsx`, `frontend/src/pages/Search.jsx`, `frontend/src/pages/Checkout.jsx`.
- **Migration Requirements**: Applied migration `017_five_product_types.sql`.

---

## [2026-09-06] - Native Seat Reservations & Hold System (Phase 1)
- **Change**: Added native inventory models (`native_inventory_rules`, `native_availability_slots`, `native_reservations`, `native_reservation_outbox`, `reservation_external_references`), 10-minute temporary checkout holds, and instant QR voucher dispatches.
- **Reason**: Prevented race conditions and double-booking on high-demand tours while supporting instant confirmation vs. supplier request routing.
- **Affected Components**: `backend/migrations/017_native_reservations.sql`, `018_native_reservation_delivery.sql`, `019_native_hold_pricing.sql`, `backend/src/services/nativeInventoryService.js`, `backend/src/services/reservationProviders.js`, `backend/src/services/reservationOutboxService.js`, `backend/src/routes/availability.js`.
- **Migration Requirements**: Applied migrations `017_native_reservations.sql`, `018_native_reservation_delivery.sql`, and `019_native_hold_pricing.sql`.

---

## [2026-09-01] - Multi-Day Circuit Planner & Grouped Order Checkout
- **Change**: Introduced `circuit_quotes`, parent `circuit_orders`, grouped payment reconciliation, and atomic multi-supplier rollback.
- **Reason**: Enabled travelers to plan custom multi-city itineraries and pay via a single Cashfree/Razorpay charge with atomic confirmation guarantees.
- **Affected Components**: `backend/migrations/009_circuit_quotes.sql` - `013_circuit_post_change_orchestration.sql`, `backend/src/services/circuitOrderService.js`, `frontend/src/pages/CircuitPlanner.jsx`, `frontend/src/pages/CircuitCheckout.jsx`.
- **Migration Requirements**: Applied circuit order migrations.

---

## [2026-08-24] - Product-Scoped Pickup Validation & Mappls Autocomplete
- **Change**: Implemented `canonical_locations` and `product_location_rules` with radius, polygon, airport, and station checks at quote and booking time.
- **Reason**: Eliminated invalid booking pickups outside supplier operational zones and provided actionable location suggestions to travelers.
- **Affected Components**: `backend/migrations/014_product_location_validation.sql`, `backend/src/services/locationValidationService.js`, `backend/src/routes/activities.js`.
- **Migration Requirements**: Migration `014_product_location_validation.sql` and startup backfill.

---

## [2026-08-15] - Dual Database Architecture & Versioned Migrations
- **Change**: Abstracted database layer supporting SQLite (WAL mode) for local development and Supabase PostgreSQL (PostGIS) for production, managed by `scripts/migrate.js`.
- **Reason**: Zero-dependency local developer quickstart and high-speed unit testing combined with production-grade cloud spatial querying.
- **Affected Components**: `backend/src/db.js`, `backend/src/postgresSyncDb.js`, `backend/scripts/migrate.js`.
- **Migration Requirements**: Created `_schema_migrations` ledger.
