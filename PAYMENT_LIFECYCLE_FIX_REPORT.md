# RGS LEDGER — PAYMENT ATTEMPT LIFECYCLE FIX & VERIFICATION REPORT

**Document ID:** `RGS-LIFECYCLE-FIX-2026-11-05`  
**Platform:** RGS Ledger — Fintech Payment Gateway Platform  
**Target Module:** Payment Attempt Lifecycle, Hosted Checkout, and Merchant State Synchronization  
**Status:** **FULLY RESOLVED & VERIFIED**  

---

## 1. Issue Summary & Root Cause Analysis

### Identified Problem
Previously, when a merchant created an order and the customer opened the hosted checkout page:
1. An order was created (`status: CREATED`, `attemptsCount: 0`).
2. When the customer visited the hosted checkout URL (`/pay/:sessionId`), the QR code canvas was drawn using static session parameters, but **no persistent payment transaction was created in MongoDB**.
3. Consequently, the merchant's **Transactions** page showed zero records while the customer was viewing the payment options.
4. When the customer clicked "Simulate Paid on UPI App (Success)" or "Simulate Declined on UPI App (Failure)", the backend created and resolved the payment in a single synchronous operation, bypassing the customer-facing `PENDING` payment attempt lifecycle.

### Architecture Rectification
A two-phase payment lifecycle was implemented to align with real-world payment aggregators (Razorpay, Cashfree, Stripe):
- **Phase 1 (Payment Initiation):** When a payment method is selected or the checkout QR code is generated, a persistent `Payment` document is created in MongoDB with status `PENDING`, a unique ID (`pay_*`), and linked to the `Order` and `Merchant`. The order's `attemptsCount` is incremented, its status transitions to `ATTEMPTED`, and the transaction immediately appears in the merchant dashboard.
- **Phase 2 (Payment Resolution):** When the payment completes (via customer app confirmation, simulation button, or asynchronous bank callback), the **EXACT SAME transaction** transitions from `PENDING` to `SUCCESS` or `FAILED`. No duplicate payment records or duplicate ledger entries are created.

---

## 2. Files Modified & Implemented

| File Path | Description of Changes |
| :--- | :--- |
| `packages/shared/src/schemas.ts` | Updated `InitiatePaymentSchema` to support optional `paymentId`, `action` (`SUCCESS`, `FAILED`, `PENDING`), and optional `method`. |
| `apps/api/src/database/models/index.ts` | Added `paymentId?: string` to `ICheckoutSession` interface and schema to track the active payment attempt on a checkout session. |
| `apps/api/src/services/payment.service.ts` | Added `createPaymentAttempt()` (creates persistent PENDING payment in MongoDB, sets order to ATTEMPTED, increments `attemptsCount`), `resolvePayment()` (idempotently transitions existing payment to SUCCESS or FAILED, writes balanced double-entry ledger, dispatches webhooks), and refactored `initiatePayment()`. |
| `apps/api/src/services/checkout.service.ts` | Updated `getSession()` to load and return active payment attempt; added `initiatePayment()` to create or reuse payment attempts for checkout sessions. |
| `apps/api/src/controllers/checkout.controller.ts` | Added `initiatePayment()`, updated `processPayment()` to resolve existing payment attempts without duplication, and added `simulatePayment()`. |
| `apps/api/src/controllers/payment.controller.ts` | Added `simulateCallback()` to handle simulated bank provider webhook callbacks on existing payment attempts. |
| `apps/api/src/routes/index.ts` | Registered routes: `POST /checkout/sessions/:sessionId/initiate`, `POST /checkout/sessions/:sessionId/simulate`, and public `POST /payments/:id/simulate-callback`. |
| `apps/checkout/src/pages/CheckoutPage.tsx` | Automatically initiates payment attempt on mount for QR code; retains and displays Payment ID and Status badge in header; preserves state on page refresh; added "Simulate Payment Pending" option and live simulated callback triggers. |
| `apps/dashboard/src/pages/TransactionsPage.tsx` | Added 8-second polling and an explicit "Refresh" button with loading spinner to display pending, success, and failed transactions in real time. |
| `apps/api/test/payment-lifecycle.test.ts` | New comprehensive automated test suite with 8 test cases verifying the complete payment lifecycle end-to-end. |

---

## 3. Verified Payment Lifecycle Flow

```
1. Merchant creates Order:
   POST /api/v1/orders ──> Order: CREATED, attemptsCount: 0, Payments in DB: 0
                                │
                                ▼
2. Customer opens Hosted Checkout:
   GET /checkout/sessions/:sessionId
   POST /checkout/sessions/:sessionId/initiate
   ──> Payment Created in MongoDB: PENDING (pay_xxx)
   ──> Order State: ATTEMPTED, attemptsCount: 1
   ──> Merchant Transactions Page: IMMEDIATELY SHOWS PENDING
   ──> Checkout Page: Retains Payment ID pay_xxx, QR links to pay_xxx
                                │
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
[SIMULATE SUCCESS]       [SIMULATE FAILURE]       [SIMULATE PENDING]
- Updates SAME pay_xxx   - Updates SAME pay_xxx   - pay_xxx stays PENDING
  to SUCCESS               to FAILED              - Order stays ATTEMPTED
- Order: CAPTURED        - Order: FAILED          - Checkout shows
- Ledger: 4 balanced     - Zero capture ledger      Callback Triggers:
  entries (250000 paise) - payment.failed           * Success Callback
- payment.succeeded        webhook                  * Decline Callback
  webhook                                         - Calling callback updates
- Checkout shows Success                          SAME pay_xxx to SUCCESS
```

---

## 4. Automated Test Results

### 1. Payment Lifecycle Suite (`apps/api/test/payment-lifecycle.test.ts`)
```
 RUN  v1.6.1 D:/Coding/project/RGS_PAY

 ✓ apps/api/test/payment-lifecycle.test.ts (8 tests) 326ms
   ✓ 1. ORDER CREATION: creates an order record without creating any payment transaction
   ✓ 2. PAYMENT INITIATION: checkout initiation creates one persistent PENDING transaction in MongoDB
   ✓ 3. IDEMPOTENCY: repeated initiation with same method / session reuses existing PENDING payment
   ✓ 4. PAGE REFRESH SYNCHRONIZATION: getSession returns existing payment without creating duplicates
   ✓ 5. SANDBOX SUCCESS: updates the SAME transaction from PENDING to SUCCESS and creates balanced ledger
   ✓ 6. FINANCIAL SAFETY: repeated success calls are idempotent and do not create duplicate ledger entries
   ✓ 7. SANDBOX FAILURE: updates existing PENDING transaction to FAILED without capture ledger
   ✓ 8. SANDBOX PENDING & SIMULATED PROVIDER CALLBACK: stays PENDING until simulated bank callback

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  2.45s
```

### 2. Full Vitest Test Suite (`npm run test`)
```
 RUN  v1.6.1 D:/Coding/project/RGS_PAY/apps/api

 ✓ test/api.test.ts (16 tests) 65ms
 ✓ test/payment-lifecycle.test.ts (8 tests) 398ms

 Test Files  2 passed (2)
      Tests  24 passed (24)
   Duration  2.50s
```

### 3. End-to-End Audit Runner (`scripts/verify-e2e-audit.ts`)
```
================================================================
RGS LEDGER — INDEPENDENT SENIOR FINTECH SOFTWARE AUDIT RUNNER
================================================================
[✓] [INFRASTRUCTURE] MongoDB Live Connectivity: MongoDB v8.0.5 on 127.0.0.1:27017
[✓] [INFRASTRUCTURE] REST API Server Startup & Health: HTTP 200 UP response
[✓] [AUTHENTICATION] Merchant Registration Flow: Token and API key generated
[✓] [AUTHENTICATION] Merchant Login & JWT Issuance: Access token + HttpOnly cookies
[✓] [AUTHENTICATION] Password Hashing Security: Bcrypt cost factor 12 salt rounds
[✓] [SECURITY] Cross-Merchant Isolation Boundary: Blocked with HTTP 404
[✓] [SECURITY] Role-Based Access Control (Admin Protection): Blocked with HTTP 403
[✓] [AUTHENTICATION] Super Admin Authorization: Platform metrics returned
[✓] [PAYMENTS] End-to-End Successful Payment Journey: Order CAPTURED, Payment SUCCESS
[✓] [FINANCIAL_LEDGER] Double-Entry Capture Journal Balancing: Debits (250000) === Credits (250000)
[✓] [PAYMENTS] Deterministic Payment Failure Scenario: PAYMENT_FAILED_USER_DECLINED handled
[✓] [PAYMENTS] Deterministic Payment Pending Scenario: PENDING state preserved
[✓] [REFUNDS] Partial Refund Execution & Order State: Order PARTIALLY_REFUNDED
[✓] [FINANCIAL_LEDGER] Double-Entry Refund Journal Balancing: Debits (50000) === Credits (50000)
[✓] [FINANCIAL_LEDGER] Refund Ceiling Enforcement: Rejected with REFUND_AMOUNT_EXCEEDED
[✓] [PAYMENTS] Idempotency Protection: Cached response returned
[✓] [SECURITY] SSRF Protection on Webhook Delivery: Blocked 127.0.0.1 and metadata IP 169.254.169.254
[✓] [WEBHOOKS] HMAC-SHA256 Timing-Safe Signature & Replay: Valid passes, tampered/expired fails
================================================================
AUDIT COMPLETE: 18 VERIFIED, 0 FAILED
================================================================
```

### 4. Production Monorepo Build (`npm run build`)
All 9 workspaces compiled without warnings or errors:
- `@rgs-ledger/shared`: TypeScript build clean.
- `@rgs-ledger/payment-core`: TypeScript build clean.
- `@rgs-ledger/sdk-node`: TypeScript build clean.
- `@rgs-ledger/sdk-react`: TypeScript build clean.
- `@rgs-ledger/admin`: Vite production bundle generated.
- `@rgs-ledger/api`: TypeScript backend build clean.
- `@rgs-ledger/checkout`: Vite production bundle generated.
- `@rgs-ledger/dashboard`: Vite production bundle generated.
- `@rgs-ledger/developer-portal`: Vite production bundle generated.

---

## 5. Security & Financial Guarantees Preserved

1. **Idempotency:** Repeated payment initiation or resolution requests return the cached payment object without creating duplicate payments or journals.
2. **Double-Entry Invariant:** Capturing a payment creates exactly 4 balanced journal entries where $\sum \text{Debits} \equiv \sum \text{Credits}$. Failed and pending attempts write 0 capture journals.
3. **No Over-Refunds:** Refund validation checks cumulative refunded amounts against total captured paise.
4. **Merchant Isolation:** All payment and order queries are strictly scoped by `merchantId`.
5. **No Production Leakage:** Sandbox simulation engine remains isolated; live bank settlement remains disabled.

---

## 6. Remaining Limitations & Operating Notes

- **Real Banking Webhooks:** In production, bank provider callbacks will arrive from upstream bank partner IPs; the public callback route `/payments/:id/simulate-callback` is for sandbox testing and must be restricted to verified bank IP whitelists or HMAC webhook signatures in live environments.
- **Browser Polling:** The merchant Transactions page currently polls every 8 seconds in the background. In high-concurrency production deployments, this can be upgraded to WebSocket/Server-Sent Events (SSE).
