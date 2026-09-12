# Native supplier reservations — Phase 1

Suppliers manage seat inventory from **Supplier dashboard → Listings → Seats and schedule**. Choose an option, operating weekdays, departure times, seats per departure, adult and child prices, booking cutoff in minutes, free-cancellation deadline in hours, and blackout dates. Times are Asia/Kolkata. Prices are INR before the existing 5% tax calculation. Every adult and child occupies one seat.

Saving enables instant confirmation for that option. Existing transport options retain their vehicle workflow. A listing with existing untracked reservations cannot enable seat inventory until those reservations are reconciled. Blackouts close new sales without cancelling held or confirmed reservations. Reducing capacity below currently reserved seats is rejected.

## Reservation lifecycle

- The product page polls uncached departure availability every 15 seconds; checkout reserves seats for ten minutes on entry after sign-in.
- Requests use an owner-scoped idempotency key. Refreshing checkout reuses the reservation and original expiry. After expiry, the traveler can explicitly check availability and reserve again.
- PostgreSQL and SQLite serialize capacity mutations on the product row inside a transaction. Capacity equals the configured maximum minus confirmed seats and unexpired holds. Expired holds stop occupying seats immediately, independent of the cleanup timer.
- A hold is bound to its owner, product option, departure, and adult/child counts. Its price and cancellation terms are frozen. Booking creation attaches the same hold; verified payment changes it from `ON_HOLD` to `CONFIRMED` without a second deduction.
- Signed payment failure releases unconfirmed inventory. Captures after expiry/failure or with an incorrect amount enter `PAYMENT_REVIEW_REQUIRED`, create an operations task, and never confirm unavailable seats.
- Native bookings immediately become supplier-accepted. They do not start the manual acceptance timer. Cancellation frees inventory; rescheduling moves reserved seats within the booking transaction. Grouped orders also reserve native seats and preserve their original ten-minute payment deadline.
- Paid vouchers include a QR code pointing to the protected booking page. The QR contains a booking reference, not guest details or the pickup OTP.

Demo payments are restricted to local and test runtimes; Cloud Run and production cannot issue free test confirmations, even when legacy demo flags are present.

## Notifications

Native confirmation inserts a durable outbox row in the same transaction as seat confirmation. Delivery starts immediately and a five-second worker recovers pending work. Failed channels retry after five minutes. A lease prevents simultaneous workers claiming the same event; provider delivery keys suppress successful retries. A process failure between provider acceptance and the local acknowledgement can still cause an at-least-once redelivery.

Existing email and WhatsApp integrations notify travelers and suppliers. Optional supplier SMS uses Twilio's Messaging Service with `SMS_NOTIFICATIONS_ENABLED`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID`. Configure credentials through Secret Manager. The provider must support the destination and approved transactional sender/templates. Supplier SMS is not sent when disabled. Operations can inspect provider configuration at `/api/ops/notification-health` and delivery records in the existing notification console. Outbox rows remain pending when an attempted channel is unavailable.

WhatsApp delivery-status callbacks use `POST /api/webhooks/whatsapp` and require `WHATSAPP_APP_SECRET` to verify Meta's signature. Callback registration uses the same path with GET and `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Store both through Secret Manager and register the callback in the Meta app. Without this setup, API acceptance can be logged as `SENT`, but the application cannot independently verify delivery or read status.

## Data and API boundaries

Migrations `017_native_reservations.sql`, `018_native_reservation_delivery.sql`, and `019_native_hold_pricing.sql` add the rules, departure slots, reservations, pricing snapshots, delivery outbox, and external-reference mappings. Existing booking/payment tables and identifiers remain in use. Apply migrations with `cd backend && npm run migrate:up`; server startup also applies pending migrations.

| Internal concept | OCTO-aligned field/state |
| --- | --- |
| Product and booking option | `productId`, `optionId` |
| Stable departure identity | `availabilityId`, `availability_slot` |
| Departure availability | `localDateTimeStart`, `utcCutoffAt`, `capacity`, `vacancies` |
| Reservation lifecycle | `ON_HOLD`, `CONFIRMED`, `EXPIRED`, `CANCELLED` |
| Hold deadline | `utcExpiresAt` |
| Adult and child seats | `unitItems`, stable unit identities |

`reservationProviders.js` defines provider availability, reserve, confirm, and release operations. `reservation_external_references` maps supplier-scoped provider IDs to local product/option/unit/availability/booking IDs. Only `NATIVE` is connected. Future Bókun or FareHarbor adapters must implement supplier authentication, capability discovery, their own idempotency/error handling, and reconciliation. This is an OCTO-aligned internal foundation, not an OCTO-certified public API or a claim that either provider is already connected.

Relevant specification: [OCTO availability](https://docs.octo.travel/octo-api-core/availability), [OCTO bookings](https://docs.octo.travel/octo-api-core/bookings), [OCTO products and units](https://docs.octo.travel/octo-api-core/products).

### Endpoints

- `GET /api/suppliers/:supplierId/products/:productId/inventory` — owned options and inventory settings.
- `PUT /api/suppliers/:supplierId/products/:productId/inventory/:optionId` — validate and save owned inventory settings.
- `GET /api/availability/native/:productId?date=YYYY-MM-DD&optionId=...` — uncached availability; omitting the option returns configured active options.
- `POST /api/availability/native/hold` — authenticated owner-bound reservation.
- `POST /api/bookings/hold` — native options use the same reservation engine.
- `POST /api/bookings` — attaches `native_hold_id` or a native `hold_id`, or atomically reserves at booking creation for older clients.

## Verification

The native unit suite covers seat counts, independent departures, ten-minute expiry, idempotency conflicts, ownership and party matching, late confirmation, payment-failure release, capacity edits, blackouts, cutoff, frozen terms, and durable delivery retry. HTTP tests exercise competing holds, native holds through the existing endpoint, instant demo payment, QR vouchers, signed payment-failure webhooks and late captures. The browser journey saves supplier inventory, selects live availability, resumes a held checkout, and completes payment.

`backend/scripts/test-native-postgres.js` verifies all three native migrations, nested transaction rollback, and a six-connection race for the last three seats against an isolated local PostgreSQL schema. It targets a local test server on port 55439; it never reads the application's database URL. The script drops only its generated test schema.

Production provider acceptance, delivery to a handset, and external ResTech compatibility require their respective configured accounts and provider-side validation; mocked provider tests do not prove those external outcomes.
