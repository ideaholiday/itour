# Code map

> **Summary:** where the code for each feature lives, so you can open the right 2–3 files instead of browsing.
> **Read when:** you know *what* to change but not *where*. Rules and behaviour live in the other docs.
> **Stale?** If a path here is wrong, trust the code and fix this file.

## How a request flows

```
frontend/src/pages/*.jsx ─► frontend/src/lib/api.js ─► backend/src/server.js
   mountApiRoutes() mounts every router at /api and /api/v1
      ─► backend/src/routes/<area>.js   (auth, zod validation from validators/apiSchemas.js)
      ─► backend/src/services/<x>Service.js   (business logic, transactions)
      ─► backend/src/db.js   (SQLite locally / CI; Postgres via postgresSyncDb.js in production)
```

Middleware: `backend/src/middleware/` (`auth.js` = `authenticate`, `requireRoles`; `validation.js` = `validateBody`; `security.js`).
Schema changes: only as a new file in `backend/migrations/` (AGENTS.md R7). Ignore `backend/src/supabase_schema.sql` and `supabase/migrations/` (legacy).

## Where to change what

| Feature | Route (`backend/src/routes/`) | Main services (`backend/src/services/`) | Frontend (`frontend/src/`) |
| :--- | :--- | :--- | :--- |
| Product detail, pickup validation | `activities.js` | `locationValidationService`, `supplierKybGate`, `reviewService` | `pages/ActivityDetail.jsx` |
| Search | `search.js` | `searchService` | `pages/Search.jsx` |
| Transfer quotes | `transfers.js` | `locationValidationService`, `engine/transferEngine.js` | `pages/TransferSearch.jsx` |
| Live availability, seat holds | `availability.js` (`/native/:productId`, `/native/hold`) | `nativeInventoryService`, `reservationProviders`, `supplierKybGate` | `pages/ActivityDetail.jsx` |
| Checkout, payments | `checkout.js` | `bookingService`, `razorpayService`, `cashfreeService`, `checkoutModeService`, `paymentReviewService`, `financeService` | `pages/Checkout.jsx` |
| Bookings, vouchers, cancellation | `bookings.js`, `traveler.js` | `bookingService`, `bookingModificationService`, `guestDocumentService` | `pages/MyBookings.jsx`, `pages/BookingConfirmed.jsx` |
| Supplier check-in, guest list (manifest), no-shows, cancel a departure | `suppliers.js` (`/:id/check-in`, `/:id/manifest`, `/:id/bookings/:bookingId/attendance`, `/:id/products/:productId/departures/cancel`) | `supplierDepartureService`, `refundCreditService`, `nativeInventoryService` | `components/supplier/SupplierDeparturesPanel.jsx` (on `pages/SupplierBookingsPage.jsx`) |
| Supplier cancellation refund credit (wallet first, 10-day cash back) | `suppliers.js` (cancel), `traveler.js` (`/bookings/:id/refund-to-source`), `checkout.js` (`/wallet-payment`) | `refundCreditService`, `referralService` (wallet ledger), `loyaltyService` | `pages/MyBookings.jsx`, `pages/Checkout.jsx` |
| Circuit planner and grouped orders | `traveler.js` (quotes), `circuitOrders.js` | `circuitQuoteService`, `circuitOrderService`, `circuitPaymentService`, `circuitManagementService`, `circuitOrchestrationService` | `pages/CircuitPlanner.jsx`, `pages/CircuitCheckout.jsx`, `pages/CircuitManage.jsx` |
| Supplier extranet: listings, rates, calendar, KYB | `suppliers.js` | `nativeInventoryService`, `pricingRuleService`, `availabilityService`, `supplierVerificationService`, `cashfreeSecureIdService`, `kybFileService` | `pages/SupplierPortal.jsx`, `pages/ProductBuilder.jsx`, `components/supplier/` |
| Driver dispatch, pickup OTP | `suppliers.js`, `driverTrips.js`, `ops.js` | `driverDispatchService`, `dispatchWorkflowService`, `dispatchStateService`, `dispatchNotificationService` | `components/supplier/DispatchQueue.jsx`, `pages/DriverTrip.jsx`, `pages/ops/LiveTripBoardView.jsx` |
| Driver Android app (background location) | `driverTrips.js` (same API) | `android-driver/` | `pages/DriverTrip.jsx` (app bridge) |
| Maps, address search, geocoding (Ola Maps) | `places.js`, `maps.js` | `olaMapsService`, `etaService` | `lib/mapTiles.js`, `components/PickupPointPicker.jsx` |
| Live driver location (GPS), traveler tracking | `driverTrips.js`, `ops.js`, `suppliers.js`, `tracking.js` | `driverLocationService`, `tripTrackingService`, `etaService` | `pages/DriverTrip.jsx`, `pages/TripTracking.jsx`, `components/ops/LiveTripMapView.jsx`, `components/supplier/SupplierBookingManager.jsx` |
| Supplier assignment SLA | `ops.js`, `checkout.js` | `supplierAssignmentService`, `assignmentSlaService` | `pages/OpsPanel.jsx` |
| Supplier profiles, directory, enquiries, SEO pages | `publicSuppliers.js`, `enquiries.js`, `seo.js` | `supplierProfileService`, `supplierEnquiryService` | `pages/SupplierProfile.jsx`, `pages/SupplierDirectory.jsx`, `components/EnquiryInbox.jsx` |
| Server-rendered head tags (activity pages, `/search` city pages), sitemaps, robots, real 404s, `www` redirect | `seo.js`, `server.js` (SPA fallback) | `shared/activitySeo.js`, `shared/spaRoutes.js` (keep in step with `App.jsx`; a unit test checks) | `pages/ActivityDetail.jsx`, `pages/Search.jsx`, `components/SeoHead.jsx` |
| Marketing tracking (GTM data layer, UTM/click-id attribution, signup events) | — | `shared/campaignAttribution.js` | `lib/analytics.js`, `pages/Login.jsx`, `pages/SupplierSignup.jsx` |
| Legal pages | `seo.js` (`/privacy` → `/privacy-policy`) | — | `pages/TermsPage.jsx`, `pages/CancellationPage.jsx`, `pages/PrivacyPolicyPage.jsx` |
| Share kit (QR, print sheets, widget, voucher QR) | `shareKit.js` (`/go/s`, `/api/share`), `suppliers.js` (`/:id/share-kit`) | `supplierShareKitService`, `guestDocumentService` | `components/supplier/SupplierShareKitPanel.jsx` |
| Admin: supplier approval, moderation, finance | `admin.js` | `supplierVerificationService`, `kybFileService`, `financeService` | `pages/admin/` |
| Admin: team (staff and administrators) | `admin.js` | `teamService` | `pages/admin/TeamView.jsx` |
| Analytics | `analytics.js` | `analyticsService` | `pages/admin/AnalyticsDashboardView.jsx` |
| Reviews and review invites | `reviews.js` | `reviewService`, `reviewInviteService` | `pages/ReviewInvite.jsx`, `pages/MyReviews.jsx` |
| Support cases, refunds | `support.js`, `traveler.js` (self-cancel), `admin.js` (finance refunds) | `supportCaseService`, `financeService`, `bookingRefundService` | `pages/ops/SupportCasesView.jsx`, `components/traveler/BookingModificationModal.jsx` |
| Notifications (email, WhatsApp, SMS) | `ops.js`, `notificationWebhooks.js` | `notificationService`, `whatsappService`, `emailService`, `smsService`, `notificationLogService` | `pages/ops/WhatsAppNotificationView.jsx` |
| Affiliates, referrals, loyalty | `affiliate.js`, `adminAffiliates.js`, `referral.js`, `promo.js` | `affiliateService`, `affiliateRateService`, `referralService`, `loyaltyService`, `promoService` | `pages/AffiliateDashboardPage.jsx`, `pages/TravelAndEarn.jsx` |
| Admin coupons, coupon uses | `admin.js` (`/api/admin/coupons`), `promo.js`, `bookings.js` | `couponService`, `promoService` | `pages/admin/CouponsView.jsx`, `pages/Checkout.jsx` |
| Program settings (giveaway cap, commission) | `admin.js` (`/api/admin/programs`, `/commission`) | `programSettingsService`, `commissionService`, `financeService.resolveCommissionRate` | `pages/admin/ProgramsView.jsx`, `pages/admin/ProductModerationView.jsx` |
| Profile plans (Verified check queue, Spotlights) | `suppliers.js` (`/:id/plans`, `/:id/spotlights`), `admin.js` (`/verification-queue`) | `supplierPlanPaymentService`, `supplierProfileService` | `components/supplier/SupplierSubscriptionPanel.jsx`, `pages/admin/VerificationQueueView.jsx`, `pages/SupplierProfile.jsx` |
| Supplier subscriptions, launch waiver, subscription payments and invoices | `admin.js` (`/supplier-subscriptions`), `auth.js` (signup), `suppliers.js` (`/:id/subscription`), `checkout.js` (webhook) | `supplierSubscriptionService`, `supplierPlanPaymentService`, `supplierKybGate` | `pages/admin/ProgramsView.jsx`, `components/supplier/SupplierSubscriptionPanel.jsx`, `lib/cashfreeSdk.js` |
| OCTo API and channel manager | `octo.js`, `supplierChannels.js` | `octoService`, `channelManagerService`, `channels/channelRegistry.js` | `pages/supplier/SupplierChannelManagerPage.jsx` |
| Uploads (incl. private KYB files) | `uploads.js` | `uploadService`, `kybFileService` | `components/KybDocumentViewer.jsx` |
| Auth | `auth.js` | `lib/passwords.js` | `lib/auth.jsx`, `pages/Login.jsx` |

Frontend routes are declared in `frontend/src/App.jsx`. Portal detection (`supply.` / `admin.` hosts) is in `frontend/src/lib/domainContext.js`.

## Background workers

Started by `setInterval` near the end of `backend/src/server.js`:

- **every 30s:** dispatch schedule and outbox (`dispatchWorkflowService`), reservation confirmation outbox (`reservationOutboxService`), expiry of holds and supplier SLAs, circuit reconfirmation timeouts
- **every 5 min:** referral lifecycle (`referralService`)

## Tests

| Kind | Location | Run |
| :--- | :--- | :--- |
| Unit, usually one file per service | `backend/test/<name>.test.js` | `npm run check -- unit` |
| Real-HTTP journeys | `backend/integration/` | `npm run check -- integration` |
| Browser journeys | `e2e/` | `npx playwright test` |

## Large files: search them, don't read them whole

Over 1,000 lines. Use `grep -n` to find the function, then read only that range:
`routes/suppliers.js`, `db.js`, `services/affiliateService.js`, `services/referralService.js`,
`scripts/seedGoaSupplierProducts.js` (backend), and `pages/CircuitPlanner.jsx`,
`components/supplier/SupplierCompliancePanel.jsx`, `pages/ActivityDetail.jsx`,
`pages/AffiliateDashboardPage.jsx`, `pages/ProductBuilder.jsx`, `pages/Checkout.jsx`,
`components/supplier/SupplierBookingManager.jsx` (frontend).
