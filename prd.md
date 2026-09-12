# Idea Holiday Product Requirements

## Overview

Idea Holiday is a real-time reservation marketplace for curated Indian travel experiences, airport and intercity transfers, day sightseeing tours, multi-day holiday packages, and attraction tickets. The product prioritizes non-tech, manual/offline suppliers first through an intuitive Extranet and automated reservation engine, while maintaining an OCTO-compliant foundation for Phase 2 external ResTech connections.

## Users

- **Travelers:** Discover experiences, compare options, view live departure vacancies, book securely with 10-minute holds, receive instant QR vouchers, and manage cancellations, support, and reviews.
- **Suppliers:** Complete KYB, define coverage areas, publish products across 5 product types, configure extranet departure schedules, seat capacities, cutoffs, and dispatch compatible drivers and vehicles.
- **Ground operations:** Monitor live trips, resolve supplier or dispatch exceptions, manage OTP verification, handle circuit reschedules, and audit notification deliveries.
- **Administrators:** Approve suppliers and products, moderate reviews, manage commissions, refunds, supplier payouts, and monitor real-time business intelligence via the executive analytics command center.

## Core Journeys

1. Traveler searches across 5 product types (`TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, `EXPERIENCE`).
2. Traveler reviews itinerary, inclusions, vehicle or hotel variants, cancellation terms, and live departure vacancies.
3. Checkout reserves seats via a 10-minute cart lock (`native_reservations`); verified payment activates the booking instantly without manual acceptance queues.
4. Supplier assignment and driver dispatch move the booking through `confirmed`, `driver_assigned`, `in_progress`, and `completed`.
5. Traveler receives digital QR voucher, notifications via WhatsApp, Email, and SMS, private pickup OTP, and post-trip review access.
6. Leadership and administrators track conversion funnels, supplier scorecards, GMV revenue trends, and anomaly alerts at `/admin/analytics`.

## Functional Requirements

- Search must support 5 product types (`TRANSFER`, `DAY_TOUR`, `MULTI_DAY_PACKAGE`, `ATTRACTION_TICKET`, `EXPERIENCE`) with type tabs, duration filters, and sorting.
- Detail pages must render specialized booking panels per product type (Ticket Tiers, Vehicle Options, SIC Hubs, Hotel Accommodation Tiers) and a live departure picker (`LiveDeparturePicker.jsx`).
- Native reservation engine must support supplier-configured operating days, departure times, maximum seat capacities, adult/child prices, cut-off minutes, cancellation deadlines, and blackout dates.
- Checkout must enforce an owner-bound 10-minute temporary seat hold (`native_reservations`) preventing double-booking; verified payment confirms seats permanently while failure releases held inventory.
- Notifications for confirmed bookings must be durably enqueued in `native_reservation_outbox` and processed with retry logic and idempotency keys.
- Saved traveler circuits must support an expiring backend-owned multi-item quote. Only linked, published and currently available products contribute to its total; custom or unavailable items must be identified before checkout.
- An owned, unexpired and fully ready circuit quote must be consumable exactly once into an idempotent parent circuit order with atomic pending-payment child bookings and expiring inventory holds. Any item failure must leave no partial order or booking records.
- A circuit order must accept one verified parent-level payment. Confirmation must atomically activate every child booking, consume every hold, secure every payout and start supplier acceptance; failure must release the complete circuit, and late or mismatched captures must enter operations review without partial activation.
- The Circuit Planner must reserve a ready quote, resume the same idempotent parent order, show one payment total with a hold countdown, and finish on one confirmation view listing every child booking.
- A confirmed circuit must be managed only at parent level. Cancellation must preview and aggregate every child policy into one grouped refund; rescheduling must preserve stop spacing and revalidate every new date. Traveler requests require operations approval, and approval must update all children atomically or none.
- Transfer search must validate service coverage, vehicle capacity, distance, tolls, permits, GST, commission, and supplier payout.
- Product location rules must validate every pickup/drop at quote and booking time: fixed airport/station anchors, radius or polygon service zones, cross-state permits, day-tour city/slot/cutoff rules, route-appropriate flight details, and package start/end plus per-night hotel cities.
- Checkout must never trust browser totals and must support payment verification, cancellation policy enforcement, refunds, and audit records.
- OTP secrets must be generated after payment, stored securely in an encrypted vault, expire, lock after failed attempts, and be reset only by operations.
- Supplier, operations, and admin workspaces must enforce role-based access and expose actionable status, SLA, finance, and quality information.
- Database layer must support dual SQLite and PostgreSQL engines with version-controlled, auditable schema migrations (`_schema_migrations`).
- Observability and analytics engines must capture structured events, low-cardinality Prometheus metrics, Core Web Vitals, and period-over-period KPI performance trends.
- Multi-domain ecosystem must enforce dedicated subdomains and login portals: `supply.ideaholiday.in` for supplier publishing and reservation management, `admin.ideaholiday.in` for executive administration and ground ops, and `ideaholiday.in` for traveler exploration and booking. Single-port local development must resolve portals transparently without mandatory `/etc/hosts` changes.
- Supplier Channel Manager (`/supplier/channels`) must integrate with major booking systems (Bókun, FareHarbor, Bookingkit, Palisis Group / TourCMS, Activitar, Anchor, and generic OCTo endpoints), supporting live connection health verification, remote experience discovery, and 1-click catalog import into `activities` and `reservation_external_references`.
- OCTo Specification Engine (`/api/octo/v1/*`) must expose standard capabilities, supplier details, catalog discovery, availability checks, 10-minute reservation holds, instant confirmation, and policy cancellations.

## Success Metrics

- Search-to-detail and detail-to-booking conversion.
- Payment verification and booking-confirmation success rate.
- Real-time seat vacancy accuracy and zero double-booking occurrences.
- Supplier assignment and driver dispatch SLA compliance.
- Trip completion rate, cancellation/refund resolution time, support response time, and review quality.

## Non-Goals

Building a flight or rail booking engine, standalone hotel aggregation, or accepting unverified suppliers is outside this product scope.
