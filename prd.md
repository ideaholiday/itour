# Idea Holiday Product Requirements

## Overview

Idea Holiday is a marketplace for curated Indian travel experiences, airport transfers, sightseeing tours, and multi-day holiday packages. The product should make discovery, transparent booking, verified operator fulfillment, and traveler support reliable from search through trip completion.

## Users

- **Travelers:** Discover experiences, compare options, book securely, receive trip details, and manage cancellations, support, and reviews.
- **Suppliers:** Complete KYB, define coverage areas, publish products, accept bookings, and dispatch compatible drivers and vehicles.
- **Ground operations:** Monitor live trips, resolve supplier or dispatch exceptions, manage OTP verification, and handle support cases.
- **Administrators:** Approve suppliers and products, moderate reviews, manage commissions, refunds, and supplier payouts.

## Core Journeys

1. Traveler searches by destination, category, dates, group mode, or transfer route.
2. Traveler reviews itinerary, inclusions, vehicle and hotel variants, cancellation terms, and live pricing.
3. Backend creates a canonical quote and idempotent pending-payment booking; verified payment activates it.
4. Supplier assignment and driver dispatch move the booking through `confirmed`, `driver_assigned`, `in_progress`, and `completed`.
5. Traveler receives voucher, notifications, pickup OTP, and post-trip review access.

## Functional Requirements

- Search must support `DAY_TOUR`, `TRANSFER`, and `MULTI_DAY_PACKAGE` products with filters and sorting.
- Transfer search must validate service coverage, vehicle capacity, distance, tolls, permits, GST, commission, and supplier payout.
- Checkout must never trust browser totals and must support payment verification, cancellation policy enforcement, refunds, and audit records.
- OTP secrets must be generated after payment, stored securely, expire, lock after failed attempts, and be reset only by operations.
- Supplier, operations, and admin workspaces must enforce role-based access and expose actionable status, SLA, finance, and quality information.

## Success Metrics

- Search-to-detail and detail-to-booking conversion.
- Payment verification and booking-confirmation success rate.
- Supplier assignment and driver dispatch SLA compliance.
- Trip completion rate, cancellation/refund resolution time, support response time, and review quality.

## Non-Goals

Building a flight or rail booking engine, open-ended social travel features, or accepting unverified suppliers is outside this product scope.
