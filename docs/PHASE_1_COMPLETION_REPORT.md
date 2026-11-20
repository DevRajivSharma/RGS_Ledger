# Phase 1 Completion Report — Merchant Foundation & UPI Payment Engine

**Project**: RGS Ledger  
**Date**: November 13, 2026  
**Status**: COMPLETE (All 12 Completion Criteria Verified)  
**Branch**: `Master`

---

## 1. Executive Summary

Phase 1 establishes the operational core of RGS Ledger:
1. **Part A — Audit Findings Remediated**: API production build output standardized via `esbuild` flat-bundling (`apps/api/dist/server.js`), Render deployment manifest aligned, Dockerfile synchronized, and `npm run build` added to CI.
2. **Part B — Merchant Authentication Engine**: Merchant registration, login, logout, password hashing via native `scryptSync` + `timingSafeEqual`, HMAC-SHA256 JWT access tokens (15-min lifespan), and single-use refresh token rotation with SHA-256 database hashing.
3. **Part C — Merchant Profile & UPI Configuration**: Profile query/patch, UPI VPA configuration, MCC support, and payment acceptance toggle (`isAcceptingPayments`).
4. **Part D — NPCI UPI 1.6 & Local QR Engine**: Isolated `packages/upi-adapter` delegating strictly to `upipay@1.0.0` for local QR generation and intent URL building. Strict prohibition of PhonePe/Paytm PSP adapters maintained. Amount locked via `mode=04` and paise precision preserved.
5. **Part E — Payment Request Engine**: Create payment, auto-generate QR and mobile deep links, retrieve payment, cancel payment, auto-expiry on query, and idempotency key caching.
6. **Part F — Functional Hosted Checkout**: Customer-facing React app (`apps/hosted-checkout`) with dynamic QR rendering, timer countdown, mobile intent buttons, polling, and fintech disclosure. Zero leakage of private merchant credentials.
7. **Part G — Functional Merchant Dashboard**: Merchant operational portal (`apps/merchant-dashboard`) supporting login, registration, UPI configuration, payment request creation, and lifecycle management.
8. **Part H — Versioned API**: Endpoints mounted under both `/v1` and `/api/v1`.
9. **Part I — Automated Test Suite**: 41 native Node.js tests passing in 2.4s covering all security, auth, isolation, QR, and payment rules.
10. **Part J — Security Controls**: Mandatory tenant scoping, timing-safe auth, rate limiting, and no secrets in client bundles.
11. **Part K — Documentation**: Complete specifications published.

---

## 2. Verification Checklist & Proofs

| # | Requirement | Verification Method | Status | Notes |
|---|---|---|---|---|
| 1 | `npm test` passing | `tsx --test packages/*/src/**/*.test.ts apps/api/src/**/*.test.ts` | **PASS** | 41/41 tests pass (0 fail, 0 cancel, 0 skip) in 2.4s |
| 2 | `npm run typecheck` | `tsc --noEmit` across all 12 workspaces | **PASS** | 0 TypeScript errors |
| 3 | `npm run build` | Full workspace build | **PASS** | All apps (API, Checkout, Dashboards, Web) build cleanly |
| 4 | Render start command | `node apps/api/dist/server.js` | **PASS** | Flat 56.9 KB bundle boots directly in Node 22 |
| 5 | Dockerfile.api sync | Inspect `Dockerfile.api` | **PASS** | Targets `node apps/api/dist/server.js` |
| 6 | No secrets in git | Inspect `.gitignore` and client bundles | **PASS** | `.env*` ignored, zero keys embedded |
| 7 | Merchant data isolation | Automated isolation test suite | **PASS** | `req.merchantId` derived strictly from JWT; cross-merchant queries rejected |
| 8 | NPCI UPI spec & `mode=04` | `packages/upi-adapter` tests | **PASS** | Fixed amount locked with `mode=04`, paise formatted to rupees |
| 9 | Public checkout session | `apps/hosted-checkout` tests | **PASS** | Public DTO excludes passwords, internal IDs, and merchant email |
| 10 | No PSP / Bank SDKs | Monorepo dependency audit | **PASS** | Zero PhonePe, Paytm, Razorpay, or bank rails |
| 11 | Non-custodial disclosure | UI verification | **PASS** | Visible on checkout, dashboard, and API responses |
| 12 | Phase 1 Documentation | Docs verified | **PASS** | All specs updated in `docs/` |

---

## 3. Test Suite Breakdown

```
TAP version 13
ok 1 - API App Initialization
  ok 1 - creates express app instance successfully
ok 2 - Auth Middleware
  ok 1 - rejects request with missing Authorization header (401)
  ok 2 - rejects request with non-Bearer Authorization header format (401)
  ok 3 - rejects request with invalid or tampered token (401)
ok 3 - AuthService — Merchant Registration & Authentication
  ok 1 - registers a new merchant and associated admin user successfully
  ok 2 - rejects duplicate email registration with 409 conflict
  ok 3 - rejects invalid UPI ID formats on registration with 400
  ok 4 - rejects passwords shorter than 8 characters
  ok 5 - authenticates valid credentials and generates tokens
  ok 6 - rejects login with wrong password (401)
  ok 7 - rotates refresh token and issues new access token
  ok 8 - logout revokes the refresh token
ok 4 - Public Hosted Checkout Data Contract
  ok 1 - constructs public checkout payload without leaking internal merchant credentials
ok 5 - MerchantService — Profile & UPI Configuration Isolation
  ok 1 - retrieves and updates merchant profile strictly scoped to merchantId
  ok 2 - updates UPI configuration and acceptance status
  ok 3 - rejects invalid UPI ID formats with validation error
  ok 4 - throws NOT_FOUND when accessing non-existent merchant profile
ok 6 - PaymentService — Payment Engine & Lifecycle
  ok 1 - creates payment request with valid QR code, intent links, and chk_ reference
  ok 2 - enforces idempotency using idempotencyKey
  ok 3 - rejects duplicate active payment for the same order ID with 409
  ok 4 - rejects payment creation when merchant is not accepting payments (403)
  ok 5 - rejects payment creation when merchant UPI is not configured (400)
  ok 6 - cancels a pending payment and transitions status to CANCELLED
  ok 7 - strictly enforces tenant isolation: Merchant A cannot view or cancel Merchant B payment
  ok 8 - auto-expires payment when queried after expiresAt
ok 7 - Security Utilities
  ok 1 - hashes and verifies passwords accurately with timing-safe comparison
  ok 2 - signs and verifies JWT access tokens with payload preservation
  ok 3 - rejects tampered and invalid JWT access tokens
  ok 4 - generates cryptographically secure refresh tokens and deterministic SHA-256 hashes
  ok 5 - generates properly prefixed secure IDs for checkout and payments
ok 8 - NpciUpiAdapter
  ok 1 - validates VPA formats correctly
  ok 2 - generates QR code and intent links with correct fixed amount from paise
  ok 3 - throws error for invalid VPA on QR generation
  ok 4 - rejects non-integer, zero, or negative amounts in paise
ok 9 - Validation Schemas
  ok 1 - accepts valid UPI VPAs
  ok 2 - rejects invalid UPI VPAs
  ok 3 - accepts standard 12-digit and alphanumeric UTRs
  ok 4 - rejects too short or special-char UTRs
  ok 5 - validates proper payment request input
  ok 6 - rejects negative or fractional paise
  ok 7 - validates merchant UPI configuration

# tests 41
# suites 13
# pass 41
# fail 0
# cancelled 0
# skipped 0
# duration_ms 2408
```

---

## 4. Architectural Boundaries Maintained

1. **Non-Custodial Architecture**:
   - Customer funds travel directly to the merchant's configured bank UPI ID.
   - Payment statuses in Phase 1 strictly transition between `PENDING`, `CANCELLED`, and `EXPIRED`.
   - Never is a payment marked `SUCCESS` without dual-source evidence matching (scheduled for Phase 2).
2. **Clean Monolithic Boundaries**:
   - Domain layer (`packages/shared-types`, `packages/api-contracts`, `packages/validation`, `packages/upi-adapter`) remains completely decoupled from Express and MongoDB details.
   - Controllers and services enforce strict tenant isolation by binding `req.merchantId` directly from the authenticated JWT token payload.
3. **Paise Precision**:
   - All amounts internally and in database storage are positive integers representing paise.
   - Decimal rupees are computed only when formatting UPI intent links and rendering UI displays.

---

## 5. Ready for Phase 2

With the merchant registration, authentication, UPI QR engine, payment request state machine, hosted checkout, and dashboard in place, the system is fully prepared for **Phase 2: Dual-Source Evidence Ingestion & Evidence Matching Engine** (Bank credit emails & Android companion notification listener).
