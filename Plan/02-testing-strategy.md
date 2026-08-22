# 02. Testing Strategy & Coverage

## Implementation checkpoint — 22 Aug 2026

The backend now has 80 deterministic `node:test` tests. `npm run test:coverage` uses Node's built-in coverage engine, currently reports 77.84% lines and 80.12% functions, and fails below 70% for either measure. `.github/workflows/ci.yml` runs this gate plus the backend production dependency audit and the Vite/Next.js production builds on every push and pull request to `main` or `master`. Full HTTP integration suites, browser E2E journeys, and hosted PR coverage comments remain open.

## Current State
- ✅ Backend has a structured deterministic test suite (`backend/test/*.test.js`)
- ✅ Coverage reporting and 70% CI gates are active
- ❌ No integration tests
- ❌ No E2E tests

## Target Testing Pyramid

```
        🧪 E2E Tests (5-10%)
           (Cypress, Playwright)
    
       🔗 Integration Tests (20-30%)
          (API + Database)
    
    ⚙️ Unit Tests (60-70%)
       (Services, Utilities)
```

---

## Unit Tests (Services Layer)

### Coverage Targets: **85%+ per service**

#### 1. BookingService.test.js
```javascript
describe('BookingService', () => {
  describe('createBooking', () => {
    // ✅ Creates pending_payment booking with idempotent key
    // ✅ Rejects invalid payment status
    // ✅ Calculates commission correctly
    // ✅ Generates unique booking reference
    // ✅ Fails gracefully on database error
  });

  describe('transitionState', () => {
    // ✅ confirmed → driver_assigned
    // ✅ driver_assigned → in_progress (with OTP verification)
    // ✅ Prevents invalid state transitions
    // ✅ Audits each transition with timestamp + actor
    // ✅ Returns current state after transition
  });

  describe('cancelBooking', () => {
    // ✅ Applies cancellation policy correctly
    // ✅ Calculates refund amount (full, partial, none)
    // ✅ Prevents cancellation after trip started
    // ✅ Triggers refund process in PaymentService
  });

  describe('requestRefund', () => {
    // ✅ Creates refund record with pending status
    // ✅ Validates refund reason
    // ✅ Prevents duplicate refund requests
    // ✅ Notifies supplier of refund
  });
});
```

#### 2. TransferService.test.js
```javascript
describe('TransferService', () => {
  describe('searchTransfers', () => {
    // ✅ Finds suppliers within pickup radius
    // ✅ Filters by vehicle capacity
    // ✅ Calculates distance using Haversine
    // ✅ Applies correct toll charges
    // ✅ Returns empty array if no suppliers
  });

  describe('generateQuote', () => {
    // ✅ Calculates base fare correctly
    // ✅ Includes GST (5% for transfers)
    // ✅ Deducts commission (20% default)
    // ✅ Returns supplier payout
    // ✅ Caches quote with 5-min TTL
  });

  describe('assignSupplier', () => {
    // ✅ Assigns supplier with quickest response time
    // ✅ Sends SMS/WhatsApp notification
    // ✅ Sets SLA timer (accept within 2 hours)
    // ✅ Fails if supplier is unavailable
  });
});
```

#### 3. OTPService.test.js
```javascript
describe('OTPService', () => {
  describe('generateOTP', () => {
    // ✅ Creates 6-digit random OTP
    // ✅ Hashes and stores in database
    // ✅ Encrypts copy with AES-GCM
    // ✅ Sets expiry time (pickup window)
    // ✅ Returns hashed value (not secret)
  });

  describe('verifyOTP', () => {
    // ✅ Accepts correct OTP
    // ✅ Rejects incorrect OTP
    // ✅ Increments failed attempts
    // ✅ Locks after 5 failed attempts
    // ✅ Rejects expired OTP
    // ✅ Returns only success/failure (not secret)
  });

  describe('resetOTP', () => {
    // ✅ Only operations role can reset
    // ✅ Clears failed attempts
    // ✅ Generates new OTP
    // ✅ Audits reset action
  });
});
```

#### 4. PaymentService.test.js
```javascript
describe('PaymentService', () => {
  describe('verifyRazorpayPayment', () => {
    // ✅ Validates signature
    // ✅ Matches amount with quote
    // ✅ Creates payment record in ledger
    // ✅ Marks booking as confirmed
    // ✅ Rejects duplicate verification
  });

  describe('processRefund', () => {
    // ✅ Calls Razorpay refund API
    // ✅ Stores refund reference
    // ✅ Updates booking status
    // ✅ Handles partial refunds
    // ✅ Retries on gateway timeout
  });

  describe('reconcilePayout', () => {
    // ✅ Calculates net amount after commission
    // ✅ Marks payout as BATCHED
    // ✅ Creates audit trail
    // ✅ Prevents double-payout
  });
});
```

#### 5. NotificationService.test.js
```javascript
describe('NotificationService', () => {
  describe('sendBookingConfirmation', () => {
    // ✅ Sends email via SES
    // ✅ Sends WhatsApp via Meta Cloud API
    // ✅ Stores delivery status in database
    // ✅ Retries on failure (with exponential backoff)
    // ✅ Respects user notification preferences
  });

  describe('sendOTPToTraveler', () => {
    // ✅ Sends OTP via SMS + WhatsApp
    // ✅ Does NOT expose full OTP in logs
    // ✅ Includes pickup time + driver name
    // ✅ Logs delivery status
  });
});
```

---

## Integration Tests (API + Database)

### Coverage Targets: **70%+ per critical path**

#### Critical Paths to Test:

1. **End-to-End Booking Flow**
```javascript
describe('Booking Flow Integration', () => {
  it('should complete full booking cycle: search → quote → checkout → confirmation', async () => {
    // 1. Search transfers
    // 2. Get quote
    // 3. Create pending_payment booking
    // 4. Simulate Razorpay webhook
    // 5. Verify booking is confirmed
    // 6. Verify OTP was generated
    // 7. Verify supplier notification sent
  });
});
```

2. **Refund Flow**
```javascript
describe('Refund Flow Integration', () => {
  it('should process full refund within cancellation policy', async () => {
    // 1. Create and confirm booking
    // 2. Request cancellation
    // 3. Verify refund policy applied
    // 4. Verify payment refund initiated
    // 5. Verify traveler notified
  });
});
```

3. **Supplier Assignment SLA**
```javascript
describe('Supplier Assignment SLA', () => {
  it('should escalate to operations if supplier does not respond within 2 hours', async () => {
    // 1. Create booking
    // 2. Send supplier assignment notification
    // 3. Wait 2 hours (or mock time)
    // 4. Verify ops alert created
    // 5. Verify auto-escalation triggered
  });
});
```

4. **Payment Verification**
```javascript
describe('Payment Verification', () => {
  it('should reject payment if amount does not match quote', async () => {
    // 1. Create booking + quote
    // 2. Simulate payment webhook with wrong amount
    // 3. Verify payment rejected
    // 4. Verify booking remains pending
  });
});
```

---

## E2E Tests (Full User Journey)

### Tools: **Playwright** (for headless browser testing)

#### Test Scenarios:

1. **Traveler Completes Booking**
```
✅ Homepage loads
✅ Search bar shows destinations
✅ Search results appear
✅ Product detail loads with itinerary
✅ Checkout form shows quote
✅ Payment gateway opens
✅ Confirmation screen shows booking reference
✅ My Trips shows new booking
```

2. **Supplier Accepts & Completes Trip**
```
✅ Supplier dashboard loads
✅ New booking appears in inbox
✅ Accept booking button works
✅ Assign driver form works
✅ Driver receives SMS
✅ Traveler sees OTP screen
✅ OTP verification works
✅ Trip marked as completed
```

3. **Cancellation & Refund**
```
✅ Traveler initiates cancellation
✅ Refund policy shown
✅ Confirmation required
✅ Refund processed
✅ Traveler notified
✅ Finance ledger updated
```

---

## Test Setup & Tools

### Backend Stack:
- **Framework**: Node:test (built-in) or Jest
- **Fixtures**: Mock database with seeded data
- **Coverage**: NYC (code coverage reporting)

### Frontend Stack:
- **Unit**: Vitest (Vite-native)
- **E2E**: Playwright or Cypress
- **Snapshots**: React Testing Library

### CI/CD Integration:
- GitHub Actions runs tests on every PR
- Blocks merge if coverage <70%
- Reports coverage to PR comments

---

## Test Execution

```bash
# Backend unit tests
cd backend && npm test

# Backend with coverage
cd backend && npm run test:coverage

# Frontend unit tests
cd frontend && npm run test

# E2E tests (local)
npm run test:e2e

# E2E tests (headless for CI)
npm run test:e2e:ci
```

---

## Coverage Targets by Phase

| Phase | Unit | Integration | E2E | Overall |
|-------|------|-------------|-----|---------|
| **Week 1-2** | 60% | 0% | 0% | 40% |
| **Week 3-4** | 80% | 50% | 20% | 70% |
| **Month 2** | 85% | 70% | 50% | 80%+ |

---

## Success Criteria

- ✅ All critical paths have unit + integration tests
- ✅ All API routes are covered by E2E tests
- ✅ No code merge without passing test suite
- ✅ Coverage reports visible in PR comments
- ✅ <5 min test execution time
- ✅ Tests pass consistently (no flaky tests)

---

## Timeline
- **Week 1**: Unit tests for services (60% coverage)
- **Week 2**: Integration tests + CI setup (70% coverage)
- **Week 3**: E2E tests for critical flows (80% coverage)
- **Week 4**: Performance tests + coverage tracking (80%+ coverage)
