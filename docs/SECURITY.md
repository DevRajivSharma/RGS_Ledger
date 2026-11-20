# Security Foundation & Compliance

## 1. Core Security Principles

### 1. Mandatory Tenant Isolation
- Every database query for payments, profiles, devices, and settings is strictly scoped by `merchantId`.
- **JWT Derivation Invariant**: In protected routes, `req.merchantId` is extracted directly from the cryptographically verified JWT access token. User-supplied `merchantId` in request bodies or query parameters is completely ignored and can never override the authenticated merchant context.
- Verified by automated tenant isolation test suites: Merchant A can never query, update, or cancel Merchant B's payments or profile.

### 2. Password Security (scrypt + timingSafeEqual)
- Passwords are never stored in plaintext.
- Hashing is implemented using Node.js native `crypto.scryptSync` with a unique 16-byte random salt per user and 64-byte derived key length.
- Password verification uses `crypto.timingSafeEqual` to guarantee resistance against timing-based side-channel attacks.

### 3. JWT Access Tokens & Refresh Token Rotation
- **Access Tokens**: Short-lived (default: 15 minutes) HMAC-SHA256 signed JWTs containing `{ userId, merchantId, role }`. Verified against tamper attempts and expiration.
- **Refresh Tokens**: 32-byte cryptographically secure random values (`crypto.randomBytes(32)`).
- **Zero Plaintext Storage**: Only the SHA-256 hash of the active refresh token is stored in the database (`refreshTokenHash`).
- **Single-Use Rotation**: Using a refresh token immediately generates a fresh pair and replaces the hash in the database. Replay or reuse of an old refresh token is strictly rejected.
- **Revocation**: Logging out sets `refreshTokenHash` to `null`, instantly invalidating the session.

### 4. Public Hosted Checkout Protection
- Public checkout sessions use randomly generated, unguessable reference identifiers (`chk_<32 hex chars>`).
- Public checkout DTOs (`PublicCheckoutDetails`) explicitly filter out merchant email addresses, user passwords, internal database IDs, and sensitive webhook endpoints.
- Customers only receive public details necessary to complete the payment (`merchantName`, `orderId`, `amountRupees`, `qrDataUrl`, `intentLinks`, `status`).

### 5. Zero Secret Exposure
- Secrets and `.env` files are strictly excluded from git via `.gitignore`.
- Production builds (`npm run build`) produce clean bundles with zero bundled backend secrets or API keys.

### 6. Startup Environment Validation
- Environment variables are strictly validated at boot time using Zod (`EnvironmentSchema`).
- If any required variable (`MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY_HEX`, `SCHEDULER_SHARED_SECRET`) is missing or invalid, the process halts immediately with a fatal error.

### 7. Structured & Redacted Logging
- The centralized logger (`apps/api/src/utils/logger.ts`) outputs structured JSON and automatically redacts sensitive keys:
  `password`, `token`, `accessToken`, `refreshToken`, `authorization`, `jwt`, `secret`, `encryption_key`, `pairingCode`.

### 8. Rate Limiting & Helmet
- Public endpoints are protected with Express rate limiters.
- HTTP security headers are enforced via `helmet` (HSTS, CSP, X-Frame-Options, X-Content-Type-Options).
