# 03. Security Audit & Hardening

## Implementation checkpoint — 23 Aug 2026

Completed in the repository: Helmet with hardened Content Security Policy (CSP) allowlist, strict CORS, scoped distributed rate limiting architecture, RFC 9116 security.txt routes, scrypt password storage, production secret requirements, dual Express/Supabase bearer authentication, database-authoritative roles, endpoint-wide admin/operations/supplier/booking guards, ignored identity headers, signature-verified payment/WhatsApp webhooks, stable request-correlated JSON errors, and durable audits for successful authenticated mutations and authorization denials. The audit records contain no request bodies or secrets and hash source IPs.

Centralized Zod request schemas validate known fields for every data-bearing non-webhook mutation, while global structural checks limit nesting, field/array counts, string size, URL size, and prototype-pollution keys. Validation failures return `400/VALIDATION_ERROR` without submitted values. Signed payment and WhatsApp webhooks retain provider-compatible payload handling.

Both root and backend production dependency audits are clean. The root application has completed the breaking security migration to Next.js 16.3 and React 19.2, including async route params, the `proxy.ts` convention, ESLint CLI integration, and a production build verification.

## Current Vulnerabilities Assessment

### Critical Issues ⚠️
- [x] Rate limiting implemented on public auth, search, checkout, and global API traffic with distributed store support
- [x] Payment credentials recursively redacted from logs
- [x] OTP values removed from logs and stable API errors
- [x] Strict CORS allowlisting enabled
- [x] Production authentication environment validated at startup
- [x] JSON/URL/body structure and size limits enabled

### High Priority 🔴
- [x] Content Security Policy (CSP) enabled and tailored for third-party integrations
- [x] Database access uses parameterized adapters rather than interpolated user SQL
- [x] Centralized Zod and structural input validation enabled
- [x] Helmet.js security headers enabled
- [x] Refund/payout APIs role- and ownership-gated
- [x] Durable audit logging enabled for sensitive mutations and denials

### Medium Priority 🟠
- [x] RFC 9116 security.txt vulnerability disclosure file & endpoint enabled
- [ ] No IP whitelisting for admin endpoints (optional corporate VPN feature)
- [ ] Session timeout not enforced
- [ ] No encryption at rest for sensitive data (handled at cloud disk level)

---

## 1. Authentication & Authorization

### Current: Supabase Auth
- ✅ Leverages Supabase Auth (email + Google)
- ✅ JWT tokens issued by Supabase
- ❌ Missing role-based access control (RBAC) on API

### Required Improvements:

#### A. Add Role-Based Access Control (RBAC)

```javascript
// middleware/roleGuard.js
const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    const userId = req.user.id;
    const user = await db.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );
    
    if (!user || !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    req.userRole = user.role;
    next();
  };
};

// Usage in routes
router.post('/admin/approve-supplier', 
  authenticate, 
  requireRole(['admin']), 
  approveSupplier
);
```

#### B. Validate JWT Tokens Offline
```javascript
// middleware/auth.js
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }
  
  try {
    // Verify offline using Supabase public key
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

#### C. Session Management
```javascript
// Security headers for session handling
app.use(helmet({
  strictTransportSecurity: { maxAge: 31536000 },
  frameguard: { action: 'deny' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
  maxAge: 86400,
}));
```

---

## 2. Rate Limiting & DDoS Protection

### Implement Multi-Layer Rate Limiting:

```javascript
// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');

const client = redis.createClient();

// Global rate limiter (all endpoints)
const globalLimiter = rateLimit({
  store: new RedisStore({ client }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 min
  message: 'Too many requests, please try again later',
});

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
  store: new RedisStore({ client }),
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts per 5 min
  skip: (req) => req.user, // Don't rate limit authenticated users
});

// Search API limiter (allow higher traffic)
const searchLimiter = rateLimit({
  store: new RedisStore({ client }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
});

// Strict limiter for checkout (prevent abuse)
const checkoutLimiter = rateLimit({
  store: new RedisStore({ client }),
  windowMs: 5 * 60 * 1000,
  max: 10, // 10 checkout attempts per 5 min
  keyGenerator: (req) => req.user.id, // Rate limit per user
});

// Apply limiters
app.use('/api/', globalLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/transfers/search', searchLimiter);
app.post('/api/checkout/pay', checkoutLimiter);
```

---

## 3. Input Validation & Sanitization

### Use Zod for Schema Validation:

```javascript
// validators/bookingValidators.js
const z = require('zod');

export const createBookingSchema = z.object({
  productId: z.string().uuid(),
  date: z.string().datetime(),
  travelersCount: z.number().min(1).max(8),
  email: z.string().email(),
  phone: z.string().regex(/^[0-9]{10}$/), // Indian phone
  specialRequests: z.string().max(500).optional(),
  cancellationPolicyAccepted: z.boolean().refine(v => v === true),
});

// Middleware for validation
const validateRequest = (schema) => {
  return async (req, res, next) => {
    try {
      req.validated = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors, // Only in dev, not prod
      });
    }
  };
};

// Usage
router.post('/bookings', 
  validateRequest(createBookingSchema),
  createBooking
);
```

### Prevent SQL Injection:
- ✅ Always use parameterized queries (already doing this)
- ✅ Use ORM like Prisma for additional safety
- ✅ Avoid string concatenation in SQL

### Prevent XSS Attacks:
```javascript
// Use DOMPurify on frontend
import DOMPurify from 'dompurify';

const sanitizedHTML = DOMPurify.sanitize(userInput);
```

---

## 4. Secrets Management

### Current: Environment Variables in `.env`
- ✅ Not committed to git
- ❌ Exposed in server logs potentially

### Required Improvements:

#### A. Use Google Secret Manager (Production)
```javascript
// config/secrets.js
const secretManager = require('@google-cloud/secret-manager');

async function getSecret(name) {
  const client = new secretManager.SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${process.env.GCP_PROJECT_ID}/secrets/${name}/versions/latest`,
  });
  return version.payload.data.toString('utf8');
}

const RAZORPAY_KEY = await getSecret('razorpay-key');
const SUPABASE_URL = await getSecret('supabase-url');
```

#### B. Redact Secrets in Logs
```javascript
// middleware/requestLogger.js
const redactSensitive = (obj) => {
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'otp', 'card'];
  const copy = { ...obj };
  
  sensitiveKeys.forEach(key => {
    if (copy[key]) copy[key] = '***REDACTED***';
  });
  
  return copy;
};

const requestLogger = (req, res, next) => {
  const sanitized = redactSensitive(req.body);
  logger.info({
    method: req.method,
    path: req.path,
    body: sanitized,
    ip: req.ip,
  });
  next();
};
```

---

## 5. Payment Security

### PCI DSS Compliance:
- ❌ Never store full credit card numbers
- ✅ Use payment gateway tokenization (Razorpay, PhonePe)
- ✅ All payment calls should use HTTPS

### Verification:
```javascript
// services/PaymentService.js
const verifyRazorpayPayment = async (paymentId, signature) => {
  const secret = process.env.RAZORPAY_SECRET;
  
  // Create HMAC SHA256 signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(paymentId)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    throw new Error('Payment signature mismatch');
  }
  
  // Fetch payment from Razorpay to verify amount
  const payment = await razorpay.payments.fetch(paymentId);
  
  // Compare with database quote
  const booking = await db.booking.findOne({ id: paymentId });
  if (payment.amount !== booking.totalAmount) {
    throw new Error('Amount mismatch');
  }
  
  return true;
};
```

---

## 6. OTP Security (Already Good, Enhance)

### Current Implementation ✅
- Random 6-digit generation
- Hashed storage + AES-GCM encryption
- 5-attempt lockout
- Expiry enforcement

### Enhancements:
```javascript
// Add rate limiting for OTP attempts
const otpAttemptLimiter = rateLimit({
  store: new RedisStore({ client }),
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 attempts per minute
  keyGenerator: (req) => req.user.id,
});

// Prevent OTP reuse
const otpReuseCheck = async (bookingId, otp) => {
  const usedOTPs = await db.query(
    'SELECT id FROM otp_usage WHERE booking_id = $1 AND otp_hash = $2',
    [bookingId, hashOTP(otp)]
  );
  
  if (usedOTPs.length > 0) {
    throw new Error('OTP already used');
  }
};

// OTP should work only during pickup window (±30 min)
const isWithinPickupWindow = (bookingTime) => {
  const now = Date.now();
  const pickupWindow = 30 * 60 * 1000; // 30 minutes
  return Math.abs(now - bookingTime) <= pickupWindow;
};
```

---

## 7. Audit Logging

### Log All Sensitive Actions:

```javascript
// services/AuditService.js
const auditLog = async (action, actor, resource, changes) => {
  await db.auditLog.create({
    action, // 'CREATE_BOOKING', 'PROCESS_REFUND', 'APPROVE_SUPPLIER'
    actor: { userId: actor.id, role: actor.role },
    resource: { type: resource.type, id: resource.id },
    changes, // { before: {}, after: {} }
    timestamp: new Date(),
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
};

// Usage
await auditLog(
  'PROCESS_REFUND',
  req.user,
  { type: 'booking', id: bookingId },
  { status: 'pending', refundAmount: 5000 }
);
```

---

## 8. Data Protection

### Encryption at Rest:
```javascript
// For sensitive fields (PII, payment details)
const encryptField = (value) => {
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
    Buffer.from(process.env.ENCRYPTION_IV, 'hex')
  );
  
  return cipher.update(value, 'utf8', 'hex') + cipher.final('hex');
};

// Store in database as encrypted
db.user.update({
  email: encryptField(user.email),
  phone: encryptField(user.phone),
});
```

### Data Minimization:
- Store only required PII
- Delete old records after 90 days (GDPR compliance)
- Mask phone/email in logs

---

## 9. Dependency Security

### Scan for Vulnerabilities:
```bash
# Weekly
npm audit

# Automated with Dependabot
# (Enable on GitHub)
```

---

## 10. Implementation Checklist

### Week 1:
- [x] Add helmet.js + CORS
- [x] Implement rate limiting
- [x] Add input validation (Zod)
- [x] Set up audit logging
- [x] Redact secrets from logs

### Week 2:
- [x] Implement RBAC for all endpoints
- [x] Add dual Express/Supabase token verification
- [ ] Set up Google Secret Manager
- [x] Add payment signature verification
- [x] Enable dependency scanning in CI

### Week 3:
- [ ] Conduct security code review
- [ ] Penetration test critical flows
- [ ] Document security policies
- [ ] Train team on secure coding

### Week 4:
- [ ] Security headers audit
- [ ] Data protection compliance check
- [ ] Incident response plan
- [ ] Security documentation

---

## Success Criteria

- ✅ OWASP Top 10 vulnerabilities addressed
- ✅ Rate limiting prevents abuse
- ✅ No secrets in logs or errors
- ✅ All sensitive data encrypted
- ✅ Audit trail for all sensitive operations
- ✅ Zero critical vulnerabilities in dependencies
- ✅ PCI DSS compliance verified

---

## Resources

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Helmet.js: https://helmetjs.github.io/
- Express Security: https://expressjs.com/en/advanced/best-practice-security.html
