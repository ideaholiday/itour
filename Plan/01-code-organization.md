# 01. Code Organization & Modularity

## Current State
The backend is monolithic with routes handling validation, business logic, and database access inline. The frontend has component-level code splitting but limited reusable utility layers.

## Target Architecture

### Backend Layers (3-Tier Pattern)

```
backend/src/
├── routes/              # HTTP entry points (thin, validation + routing only)
│   ├── transfers.js
│   ├── bookings.js
│   └── ...
├── services/            # Business logic (pricing, state, workflows)
│   ├── BookingService.js    # Create, transition, refund
│   ├── TransferService.js   # Search, quote, dispatch
│   ├── OTPService.js        # Generate, verify, lockout
│   ├── PaymentService.js    # Payment validation, reconciliation
│   ├── NotificationService.js
│   ├── SupplierService.js
│   └── FinanceService.js    # Payout, commission, reconciliation
├── repositories/        # Data access layer (database isolation)
│   ├── BookingRepository.js
│   ├── SupplierRepository.js
│   ├── TransferRepository.js
│   └── ...
├── middleware/          # Auth, logging, error handling
│   ├── auth.js
│   ├── errorHandler.js
│   ├── requestLogger.js
│   └── rateLimiter.js
├── validators/          # Payload validation schemas
│   ├── bookingValidators.js
│   ├── paymentValidators.js
│   └── ...
├── utils/               # Shared helpers (encryption, hashing, formatting)
│   ├── crypto.js
│   ├── validation.js
│   ├── formatting.js
│   └── ...
├── engine/              # Domain-specific engines
│   ├── TransferEngine.js    # Pricing, routing, geo-fencing (already exists)
│   └── OTPEngine.js         # OTP generation, verification logic
├── config/              # Environment and feature flags
│   ├── database.js
│   ├── payment.js
│   └── notifications.js
└── db/
    ├── index.js         # Database connection
    └── migrations/      # Version-controlled schema changes
```

### Why This Matters
- **Testability**: Services can be tested without hitting the database
- **Reusability**: Business logic is not repeated across routes
- **Maintainability**: Clear separation of concerns makes changes safer
- **Scaleability**: Easy to extract services to microservices later

---

## Frontend Organization

```
frontend/src/
├── components/
│   ├── shared/              # Reusable UI components
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Modal.jsx
│   │   └── ...
│   ├── features/            # Feature-specific components
│   │   ├── SearchBar/
│   │   ├── ProductCard/
│   │   ├── Checkout/
│   │   └── OTPVerification/
│   └── layouts/             # Page layouts (Header, Sidebar, Footer)
├── pages/                   # Route pages
│   ├── Home.jsx
│   ├── Search.jsx
│   ├── ProductDetail.jsx
│   └── ...
├── hooks/                   # Custom React hooks
│   ├── useSearch.js
│   ├── useBooking.js
│   ├── usePayment.js
│   └── usePagination.js
├── services/                # API client layer
│   ├── searchService.js
│   ├── bookingService.js
│   ├── paymentService.js
│   └── ...
├── stores/                  # State management (Zustand/Redux)
│   ├── searchStore.js
│   ├── userStore.js
│   ├── bookingStore.js
│   └── notificationStore.js
├── utils/                   # Shared utilities
│   ├── formatters.js        # INR currency, dates
│   ├── validators.js        # Client-side validation
│   ├── api.js               # Axios instance, interceptors
│   └── constants.js
├── styles/                  # Global styles
│   └── index.css
└── config/                  # Environment config
    └── api.js
```

---

## Immediate Actions (Week 1)

### Backend Refactoring Priority

**High Priority**:
1. Extract `BookingService.js` from routes/bookings.js
   - Methods: createBooking, transitionState, cancelBooking, requestRefund
2. Extract `PaymentService.js`
   - Validate quote, verify payment, handle webhook
3. Extract `OTPService.js`
   - Generate, verify, lockout logic
4. Create `validators/` folder with schema validation (Joi/Zod)

**Medium Priority**:
5. Create `repositories/` layer for all database queries
6. Move crypto/hash logic to `utils/crypto.js`
7. Centralize error handling in middleware

### Frontend Refactoring Priority

**High Priority**:
1. Extract API calls into `services/` folder
2. Create custom hooks for Search, Booking, Payment
3. Move state to Zustand store (avoid prop drilling)

**Medium Priority**:
4. Organize components by feature (not by type)
5. Create shared component library (Button, Card, Modal variants)

---

## Success Criteria

- ✅ All routes are <50 lines of code (thin routing layer)
- ✅ All services have >90% test coverage
- ✅ No business logic in React components
- ✅ Every API integration is in `services/` folder
- ✅ Database access only through `repositories/`
- ✅ Consistent error handling across all endpoints

---

## Timeline
- **Week 1**: Backend services + middleware
- **Week 2**: Frontend hooks + stores
- **Week 3**: Repositories + validators
- **Week 4**: Testing + documentation
