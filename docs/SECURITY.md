# Security Architecture & Policies: Idea Holiday

## 1. Authentication & Authorization

### Dual Authentication Mechanism
1. **Idea Holiday Native JWT**:
   - Algorithms: HS256 signed with `JWT_SECRET`.
   - Claims: `{ id, email, role, supplier_id, iat, exp }`.
   - Standard expiry: 7 days.
2. **Supabase Access Token**:
   - Verified server-side via `supabase.auth.getUser(token)`.
   - Never trusts client-supplied user headers (`X-User-Id`, `X-User-Email`); user role and supplier association are always retrieved from the local database.

### Role-Based Access Control (RBAC)
- **`TRAVELER`**: Can only view and mutate their own bookings, circuits, support cases, and reviews.
- **`SUPPLIER`**: Can only access listings, drivers, assignments, and payouts belonging to their verified `supplier_id`.
- **`STAFF`**: Can access live trip telemetry, driver fallbacks, support queues, and staff tasks. Cannot access platform financial settlement configurations.
- **`ADMIN`**: Full platform privileges, including KYB approvals, finance payouts, review moderation, and commission management.

---

## 2. Cryptographic Pickup OTP Vault

To protect against driver impersonation and unauthorized passenger pickups:
1. **Generation**: Cryptographically random 6-digit number generated using `crypto.randomInt(100000, 1000000)`.
2. **Dual-Form Persistence**:
   - **Verification Hash**: `SHA-256(otp)` stored in `pickup_otp_hash`.
   - **Encrypted Cipher**: AES-256-GCM ciphertext stored in `pickup_otp_encrypted` using `JWT_SECRET`.
3. **Information Barrier**:
   - Plaintext OTP is **never returned** to suppliers, drivers, operations staff, or administrators.
   - Decrypted only by `withoutPickupOtpSecrets()` when the authenticated traveler views their own confirmed booking.
4. **Brute-Force Lockout**:
   - Maximum 5 failed verification attempts allowed.
   - On the 5th failed attempt, the booking enters `OTP_LOCKED`, requiring direct telephone verification by Operations.

---

## 3. Request Boundary & Input Validation

1. **Global Boundary Protection** (`backend/src/middleware/validation.js`):
   - Maximum URL length: 8,192 characters.
   - Maximum payload size: 100 KiB.
   - Maximum object depth: 10 levels.
   - Maximum array size: 1,000 items.
   - Prototype pollution defense: Immediately rejects keys named `__proto__`, `prototype`, or `constructor`.
2. **Zod Schema Enforcement**:
   - All mutation endpoints (`POST`, `PUT`, `PATCH`) validate incoming payloads against strict Zod schemas (`backend/src/validators/apiSchemas.js`).
   - Non-matching or malicious payloads trigger HTTP 400 with a `VALIDATION_ERROR` code without echoing raw input back to the client.

---

## 4. Payment & Webhook Security

1. **Server-Owned Price Calculations**:
   - Client applications cannot supply prices, discounts, or tax amounts. All order amounts sent to payment gateways are computed directly on the backend.
2. **HMAC Signature Verification**:
   - **Razorpay**: Computes HMAC-SHA256 signature using `RAZORPAY_KEY_SECRET`.
   - **Cashfree**: Verifies timestamped HMAC signatures using merchant secret.
   - **WhatsApp**: Verifies `X-Hub-Signature-256` using `WHATSAPP_APP_SECRET`.
3. **Replay Attack Prevention**:
   - Every webhook event is checked against processed idempotency keys (`event_key` in `notification_deliveries` and `event_log`). Duplicate events return HTTP 200 without duplicate execution.

---

## 5. PII Protection & Logging Redaction

Winston logging (`backend/src/config/logger.js`) enforces automated, recursive redaction of sensitive customer and platform keys:
- **Redacted Keys**: `password`, `password_hash`, `token`, `access_token`, `refresh_token`, `otp`, `pickup_otp`, `bank_account`, `pan_number`, `gstin`, `credit_card`, `secret`.
- **Masked Data**: Phone numbers and email addresses are partially masked in standard operational logs.
- **Request Bodies**: HTTP request bodies are excluded from production logging unless `LOG_REQUEST_BODY=true` is explicitly configured for targeted debugging.

---

## 6. HTTP & Network Security

1. **Helmet Middleware**: Enforces standard security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`).
2. **CORS Allowlist**: Restricts cross-origin requests strictly to authorized production domains (`ideaholiday.in`, `supply.ideaholiday.in`, `admin.ideaholiday.in`) and local development ports.
3. **Rate Limiting**: `express-rate-limit` enforces rate ceilings on authentication and public search routes to prevent credential stuffing and denial-of-service attacks.
4. **RFC 9116 Compliance**: Exposes standard security contact information at `GET /.well-known/security.txt`.

---

## 7. Security-Sensitive Files & Handling Rules

Agents and developers must adhere to the following rules:
- **NEVER** commit `.env`, `.env.local`, or any file containing real API keys, passwords, or tokens to version control.
- Keep secrets in Google Secret Manager or local `.env` files.
- Use `git status` and `git diff` before every commit to ensure no credentials or database files (`wanderindia.db`) are staged.

---

## 8. Database & Supabase Security Architecture

### Schema Isolation (`marketplace` vs `public`)
1. **Isolated Data Schema**: All operational tables (`users`, `bookings`, `products`, `suppliers`, `payouts`, `driver_assignments`, etc.) reside inside the isolated `marketplace` PostgreSQL schema.
2. **PostgREST Exposure Boundary**: Supabase's automatic HTTP REST endpoint (PostgREST) only exposes the `public` schema. The `marketplace` schema is not accessible through Supabase's public PostgREST API.
3. **Privilege Hardening on `public`**:
   - All permissions (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`) on tables in `public` have been revoked from the `anon` and `authenticated` roles.
   - `FORCE ROW LEVEL SECURITY` is enabled on all tables in `public`.
   - Direct anonymous or client-side attempts to query tables via `supabase-js` or PostgREST are rejected with HTTP 401 / `42501 (permission denied)`.
4. **PostGIS `spatial_ref_sys` System Table**:
   - The `public.spatial_ref_sys` table is an internal system catalog created automatically by the PostGIS geospatial extension and owned by `supabase_admin`.
   - It contains strictly public coordinate reference definitions (EPSG codes) and no user data.
   - Its appearance in Supabase Security Advisor as `rls_disabled_in_public` is an acknowledged system-level false positive that can safely be dismissed in the Supabase Dashboard.

---

## 9. Dependency Vulnerability Management

CI runs a production dependency audit (`npm audit --omit=dev`) and fails the
build on known advisories, so the backend must stay at zero findings.

### Current overrides

`backend/package.json` pins one transitive dependency:

```json
"overrides": { "qs": "^6.16.0" }
```

Express 4.22.2 depends directly on `qs@6.15.3`, which is affected by
[GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g)
(denial of service via attacker-controlled `isBuffer`) and
[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx)
(array-limit bypass via bracket-key comma parsing). `npm audit fix` alone cannot
resolve it because the vulnerable version is pinned inside Express itself. The
override forces the patched `qs` across the tree; it is a patch-level bump within
the same major, and the full unit and HTTP integration suites pass against it.

**Remove this override** once Express ships a release that depends on
`qs@^6.16.0` or later. Re-run `cd backend && npm audit --omit=dev` after any
dependency change and confirm it still reports zero vulnerabilities.
