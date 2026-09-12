# Testing Strategy & Quality Gates: Idea Holiday

## Testing Philosophy
Idea Holiday follows a strict pyramid of automated testing to ensure zero regression across booking calculations, financial reconciliation, payment webhooks, pickup OTP security, multi-day circuit planning, and real-time seat inventory reservation under concurrency.

---

## 1. Test Levels & Commands

### 1.1 Backend Unit & Functional Tests (`node:test`)
- **Location**: `backend/test/*.test.js` (305 test cases across 9 suites).
- **Execution Command**:
  ```bash
  cd backend && npm test
  ```
- **Scope**:
  - Distance & cost breakdown formulas (`pricingRuleService.test.js`).
  - Spatial ray-casting point-in-polygon checks (`transferEngine.test.js`).
  - Native seat inventory rules, cutoffs, and 10-minute hold expiry (`nativeInventoryService.test.js`).
  - Idempotent payment webhook processing (`cashfreeService.test.js`, `razorpayService.test.js`).
  - Cryptographic pickup OTP generation & brute-force lockout (`bookingService.test.js`).
  - Automated 24h reminders & idempotency locks (`tripReminders.test.js`).
  - WhatsApp, SES, and Twilio notification mock dispatches (`notificationProviders.test.js`).
  - Checkout mode resolution (`checkoutModeService.test.js`).

### 1.2 Enforced Coverage Gate (`test:coverage`)
- **Execution Command**:
  ```bash
  cd backend && npm run test:coverage
  ```
- **CI Gate**: Enforces a minimum **70% line and function coverage threshold** (current: ~88% line and ~89% function coverage). Pull requests failing this gate are blocked by GitHub Actions.

### 1.3 HTTP Integration Journey Tests
- **Location**: `backend/integration/*.test.js` (13 isolated HTTP test cases).
- **Execution Command**:
  ```bash
  cd backend && npm run test:integration
  ```
- **Scope**: Spins up an ephemeral in-process HTTP server instance and executes full multi-step traveler journeys against real HTTP endpoints:
  - Circuit quote generation, atomic order creation, and grouped payment verification.
  - Native seat holds, instant confirmation, signed payment failure release, and late capture handling (`nativeReservations.test.js`).
  - Location validation and canonical airport/station pickup checks.

### 1.4 Native PostgreSQL Concurrency & Migration Test
- **Location**: `backend/scripts/test-native-postgres.js`.
- **Execution Command**:
  ```bash
  cd backend && node scripts/test-native-postgres.js
  ```
- **Scope**: Verifies all three native migrations, nested transaction rollbacks, and a 6-connection race condition for the last 3 seats against an isolated local PostgreSQL test schema.

### 1.5 Frontend Performance & Bundle Budget
- **Execution Command**:
  ```bash
  cd frontend && npm run check:bundle
  ```
- **Gate**: Enforces a **maximum 250 KiB total chunk limit** and a **strict 225 KiB initial-entry JavaScript budget** (current: ~203 KiB largest chunk, ~63 KiB initial entry).

### 1.6 End-to-End Browser Tests (Playwright)
- **Location**: `e2e/*.spec.js`.
- **Execution Command**:
  ```bash
  npm run test:e2e
  ```
- **Critical User Flows Tested**:
  1. **Traveler Single Booking**: Search transfer → Select vehicle category → Complete checkout → Verify confirmation and voucher display.
  2. **Grouped Circuit Checkout**: Assemble multi-day itinerary → Request quote → Reserve circuit order → Complete grouped payment → Confirm all stops atomically.
  3. **Native Reservation Extranet to Booking**: Configure supplier inventory rules in extranet → Select live departure slot in `LiveDeparturePicker` → Hold seats → Complete payment → Instant QR voucher (`z-native-reservations.spec.js`).
  4. **Supplier Dispatch Workflow**: Supplier views assigned booking → Selects roster chauffeur and vehicle → Verifies driver dispatch notification.
  5. **Operations & Refund Queue**: Trigger booking cancellation → Review refund calculation → Verify operations approval and ledger balance update.

---

## 2. Pre-Deployment Verification Checklist

Before pushing code to `main` or initiating a deployment to Cloud Run, agents and developers **MUST verify**:
1. All 305 backend unit tests pass: `cd backend && npm test`.
2. All 17 HTTP integration tests pass: `cd backend && npm run test:integration`.
3. Coverage gate passes: `cd backend && npm run test:coverage`.
4. Frontend builds without errors: `cd frontend && npm run build`.
5. Bundle budget passes: `cd frontend && npm run check:bundle`.
6. No uncommitted `.env` files or secrets are staged in git.
7. WhatsApp delivery verified via CLI if notification code was modified: `npm run test:whatsapp <number>`.
