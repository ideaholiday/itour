# Idea Holiday Product Requirements

## Overview

Idea Holiday is a marketplace for curated Indian travel experiences, airport transfers, sightseeing tours, and multi-day holiday packages. The product should make discovery, transparent booking, verified operator fulfillment, and traveler support reliable from search through trip completion.

## Users

- **Travelers:** Discover experiences, compare options, book securely, receive trip details, and manage cancellations, support, and reviews.
- **Suppliers:** Complete KYB, define coverage areas, publish products, accept bookings, and dispatch compatible drivers and vehicles.
- **Ground operations:** Monitor live trips, resolve supplier or dispatch exceptions, manage OTP verification, and handle support cases.
- **Administrators:** Approve suppliers and products, moderate reviews, manage commissions, refunds, supplier payouts, and monitor real-time business intelligence via the executive analytics command center.

## Core Journeys

1. Traveler searches by destination, category, dates, group mode, or transfer route.
2. Traveler reviews itinerary, inclusions, vehicle and hotel variants, cancellation terms, and live pricing.
3. Backend creates a canonical quote and idempotent pending-payment booking; verified payment activates it.
4. Supplier assignment and driver dispatch move the booking through `confirmed`, `driver_assigned`, `in_progress`, and `completed`.
5. Traveler receives voucher, notifications, pickup OTP, and post-trip review access.
6. Leadership and administrators track conversion funnels, supplier scorecards, GMV revenue trends, and anomaly alerts at `/admin/analytics`.

## Functional Requirements

- Search must support `DAY_TOUR`, `TRANSFER`, and `MULTI_DAY_PACKAGE` products with filters and sorting.
- Saved traveler circuits must support an expiring backend-owned multi-item quote. Only linked, published and currently available products contribute to its total; custom or unavailable items must be identified before checkout.
- An owned, unexpired and fully ready circuit quote must be consumable exactly once into an idempotent parent circuit order with atomic pending-payment child bookings and expiring inventory holds. Any item failure must leave no partial order or booking records.
- A circuit order must accept one verified parent-level payment. Confirmation must atomically activate every child booking, consume every hold, secure every payout and start supplier acceptance; failure must release the complete circuit, and late or mismatched captures must enter operations review without partial activation.
- The Circuit Planner must reserve a ready quote, resume the same idempotent parent order, show one payment total with a hold countdown, and finish on one confirmation view listing every child booking.
- A confirmed circuit must be managed only at parent level. Cancellation must preview and aggregate every child policy into one grouped refund; rescheduling must preserve stop spacing and revalidate every new date. Traveler requests require operations approval, and approval must update all children atomically or none. Refund-provider failure must retain the confirmed circuit and a retryable review record.
- After a grouped reschedule, every assigned supplier must reconfirm within a circuit-level SLA. The circuit becomes confirmed only when all stops accept; rejection or timeout must preserve the parent grouping, prohibit isolated fallback reassignment and create an operations review task. Reschedule notifications must cover traveler and supplier milestones. Cashfree and Razorpay refund webhooks must be signature-verified, idempotent, amount-checked and reconciled to the parent request before the final traveler refund notification.
- Transfer search must validate service coverage, vehicle capacity, distance, tolls, permits, GST, commission, and supplier payout.
- Product location rules must validate every pickup/drop at quote and booking time: fixed airport/station anchors, radius or polygon service zones, cross-state permits, day-tour city/slot/cutoff rules, route-appropriate flight details, and package start/end plus per-night hotel cities. Errors include a safe allowed-area suggestion.
- Checkout must never trust browser totals and must support payment verification, cancellation policy enforcement, refunds, and audit records.
- OTP secrets must be generated after payment, stored securely, expire, lock after failed attempts, and be reset only by operations.
- Supplier, operations, and admin workspaces must enforce role-based access and expose actionable status, SLA, finance, and quality information.
- Database layer must support dual SQLite and PostgreSQL engines with version-controlled, auditable schema migrations (`_schema_migrations`).
- Observability and analytics engines must capture structured events, low-cardinality Prometheus metrics, Core Web Vitals, and period-over-period KPI performance trends.
- Automated CI/CD deployment pipelines must support smoke-test verification, automatic rollback, and blue-green zero-downtime production releases.
- Migration batches must be atomic across SQLite and PostgreSQL, detect edits to applied migration files, and refuse ledger-only rollback when no down migration exists.

## Success Metrics

- Search-to-detail and detail-to-booking conversion.
- Payment verification and booking-confirmation success rate.
- Supplier assignment and driver dispatch SLA compliance.
- Trip completion rate, cancellation/refund resolution time, support response time, and review quality.

## Non-Goals

Building a flight or rail booking engine, open-ended social travel features, or accepting unverified suppliers is outside this product scope.
