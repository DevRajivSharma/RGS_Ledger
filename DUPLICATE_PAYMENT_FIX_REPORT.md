# RGS LEDGER — DUPLICATE PAYMENT RESOLUTION & RECONCILIATION REPORT

**Document Version:** 1.0.0  
**Audit Type:** Concurrency & Financial State Reconciliation  
**Target Environment:** Local Sandbox (`mongodb://127.0.0.1:27017/rgs_ledger`)  
**Status:** FULLY IMPLEMENTED, RECONCILED, & VERIFIED  

---

## 1. Executive Summary

During testing of the RGS Ledger payment checkout flow, multiple `PENDING` transactions were observed in the merchant Transactions dashboard for single orders (e.g., ₹300, ₹9, ₹769, ₹2345, and ₹499). An independent investigation diagnosed the problem as a multi-tier concurrency race triggered by **React 18 StrictMode double mounting**, an absence of client-supplied `Idempotency-Key` headers on payment attempt initiation, and a 10–36 ms race window between checkout session verification and payment document persistence in the backend.

A comprehensive three-phase solution was architected and deployed:
1. **Frontend Concurrency & Idempotency Hardening:** Ref-based double-dispatch guard and stable client idempotency key generation.
2. **Backend Concurrency Locks & Atomic Database-Level Protection:** Synchronous in-memory promise mutex, active attempt verification, atomic MongoDB partial unique indexing, and automated orphan cancellation upon capture.
3. **Safe Historical Database Reconciliation:** Development and execution of a non-destructive reconciliation script that safely transitioned 5 historical accidental duplicate records to `CANCELLED` and restored accurate order attempt metrics.
4. **Automated Verification:** Added 6 dedicated concurrency and idempotency tests in `apps/api/test/payment-concurrency.test.ts`. All 30 unit/integration tests and 18/18 E2E audit checks pass with 100% success.

---

## 2. Root Cause Analysis

| Layer | Root Cause | Consequence |
| :--- | :--- | :--- |
| **Frontend Checkout Client** | React 18 `<React.StrictMode>` double mounts `<CheckoutPage>` in development mode. The `useEffect([sessionId])` hook executed twice in immediate succession (0–3 ms apart). | Two simultaneous `POST /api/v1/checkout/sessions/:id/initiate` requests were dispatched before the checkout session had received its payment link. |
| **Client HTTP Transport** | Checkout initiation requests were dispatched without an `Idempotency-Key` header. | Requests bypassed the Express idempotency middleware (`apps/api/src/middleware/idempotency.ts`), allowing both HTTP requests to enter application service logic. |
| **Backend Service Layer** | `CheckoutService.initiatePayment` checked `if (session.paymentId)`. However, when concurrent requests arrived 10–36 ms apart, Request 1 had not yet called `session.save()`, so Request 2 observed `session.paymentId === undefined`. | Both requests executed `PaymentService.createPaymentAttempt`, generating two distinct payment IDs (`pay_...`), incrementing `order.attemptsCount` twice, and leaving one payment permanently `PENDING` when the user settled the second one. |
| **Database Schema** | MongoDB lacked a unique constraint preventing multiple active `PENDING` attempts for the same order. | The database permitted multiple pending payment attempts to coexist under the same `orderId`. |

---

## 3. Engineering Implementation Details

### Part A: Frontend Hardening (`apps/checkout/src/pages/CheckoutPage.tsx`)
- **Initiation Lock Ref:** Added `isInitiatingRef = useRef<Record<string, boolean>>({})` tracking active initiations by `${sessionId}_${method}_${attemptCount}` to prevent double-invocation during React StrictMode renders.
- **Stable Idempotency Key:** Derived an attempt-scoped key `idemp_cs_${sessionId}_${method}_${attemptCount}` transmitted via HTTP header `Idempotency-Key`.
- **Sequential Retry Support:** Introduced `attemptCount` state. When a payment attempt fails and the user clicks "Try Another Payment Attempt", `attemptCount` increments, generating a distinct idempotency key for the subsequent attempt while maintaining stability across component re-renders.

### Part B: Backend Concurrency Locks & Guards (`apps/api/src/services/payment.service.ts` & `checkout.service.ts`)
- **Synchronous In-Memory Mutex:** Added `PaymentService.initiationLocks = new Map<string, Promise<any>>()`. When Request 1 enters `createPaymentAttempt`, the lock promise is registered **synchronously before any asynchronous await**, forcing concurrent requests to queue.
- **Active Pending Verification:** Before creating a new document, the service queries for any existing `PENDING` payment for that order:
  ```ts
  const activePending = await Payment.findOne({ orderId: data.orderId, status: PaymentStatus.PENDING }).exec();
  if (activePending) return { payment: activePending, order, upiUri };
  ```
- **Order Capture Protection:** If `order.status === OrderStatus.CAPTURED`, payment initiation is immediately rejected with HTTP 400 `ORDER_ALREADY_CAPTURED`.
- **Auto-Cancellation of Orphan Attempts:** In `PaymentService.resolvePayment`, when a payment resolves to `SUCCESS`:
  ```ts
  await Payment.updateMany(
    { orderId: order._id, _id: { $ne: payment._id }, status: PaymentStatus.PENDING },
    { $set: { status: PaymentStatus.CANCELLED, errorCode: 'ORDER_CAPTURED_SUPERSEDED', errorDescription: `Superseded: Order successfully captured by payment ${payment._id}` } }
  ).exec();
  ```

### Part C: Atomic Database-Level Protection (`apps/api/src/database/models/index.ts`)
- Added a partial unique index on the Payment collection:
  ```ts
  PaymentSchema.index(
    { orderId: 1, status: 1 },
    {
      unique: true,
      partialFilterExpression: { status: PaymentStatus.PENDING },
      name: 'unique_active_order_payment'
    }
  );
  ```
- **Guaranteed Invariant:** Across all cluster nodes or backend processes, at most **one** payment attempt can exist with `status: PaymentStatus.PENDING` for any given order.
- In `PaymentService.createPaymentAttempt`, any race condition caught by the partial unique index (error code `11000`) is caught atomically, returning the active payment without error.

---

## 4. Database Reconciliation of Historical Records

A dedicated reconciliation utility `scripts/reconcile-duplicate-payments.ts` was implemented and executed against the local sandbox MongoDB database:
- **Safety First:** Required explicit `--apply` flag; default run was read-only dry-run.
- **Non-Destructive:** No documents were deleted; no `SUCCESS` records were modified; financial ledger journal entries were preserved unaltered.
- **Accidental Duplicates Reconciled:** 5 duplicate `PENDING` records were transitioned to `PaymentStatus.CANCELLED` with audit metadata:
  - `errorCode: 'DUPLICATE_ATTEMPT_SUPERSEDED'`
  - `errorDescription: 'Accidental duplicate attempt caused by client concurrency race during initial checkout session load'`
  - `order.attemptsCount` adjusted from inflated count to canonical count.

### Reconciled Records Table
| Order ID | Order Amount | Canonical Payment ID (Final State) | Reconciled Duplicate Payment ID | Time Delta | Action Taken |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ord_1d7b1897c88b6ec2ecb12197` | ₹769.00 | `pay_ee9972355447bfae682e5b72` (`SUCCESS`) | `pay_b5b15b6d610fa98ba9949102` | 36 ms | Transitioned to `CANCELLED`, attempts corrected 2 → 1 |
| `ord_af6a5f7e77b6329e46a788cb` | ₹9.00 | `pay_9a2f7c00e691244e883833d7` (`SUCCESS`) | `pay_d65ebda429007f35368aee4d` | 33 ms | Transitioned to `CANCELLED`, attempts corrected 2 → 1 |
| `ord_e528dc905581f1816f5c8bf9` | ₹300.00 | `pay_ad6ef1bfa98aa558cb79be6a` (`PENDING`) | `pay_510377c8e9b05b6301323aa7` | 10 ms | Transitioned to `CANCELLED`, attempts corrected 2 → 1 |
| `ord_2608fb3fffa548ad72c83329` | ₹2345.00 | `pay_9273c5cf0f23927d37a7b8ec` (`SUCCESS`) | `pay_510d54a2a11fcce18aa2f883` | 13 ms | Transitioned to `CANCELLED`, attempts corrected 2 → 1 |
| `ord_e0ded6684aa5a9ee99bc0e31` | ₹499.00 | `pay_8c32bc6572e8ecdc937ebf82` (`SUCCESS`) | `pay_e1c841bf16d97116b472ca74` | 36 ms | Transitioned to `CANCELLED`, attempts corrected 2 → 1 |

Following execution, subsequent dry runs confirm **0 duplicate payment records** across all 36 inspected orders.

---

## 5. Verification & Test Evidence

### 1. Payment Concurrency & Idempotency Test Suite (`apps/api/test/payment-concurrency.test.ts`)
```
✓ 1. Simultaneous concurrent payment initiations return the exact same payment ID (no duplicate PENDING payments)
✓ 2. Stable idempotency key replays cached response
✓ 3. Sequential retries after a FAILED payment cleanly create a new attempt
✓ 4. Successfully capturing an order auto-cancels any orphan PENDING attempts
✓ 5. Initiating payment on an already CAPTURED order is rejected with 400 ORDER_ALREADY_CAPTURED
✓ 6. Database-level partial unique index rejects multiple simultaneous PENDING payments for the same order

Test Files  1 passed (1)
Tests       6 passed (6)
Duration    2.93s
```

### 2. Full Monorepo Test Suite
```
✓ apps/api/test/api.test.ts (16 tests)
✓ apps/api/test/payment-concurrency.test.ts (6 tests)
✓ apps/api/test/payment-lifecycle.test.ts (8 tests)

Test Files  3 passed (3)
Tests       30 passed (30)
```

### 3. Full Monorepo Compilation
- `@rgs-ledger/payment-core`: Compiled clean (`tsc`)
- `@rgs-ledger/sdk-node`: Compiled clean (`tsc`)
- `@rgs-ledger/sdk-react`: Compiled clean (`tsc`)
- `@rgs-ledger/shared`: Compiled clean (`tsc`)
- `@rgs-ledger/admin`: Compiled and bundled clean (`vite build`)
- `@rgs-ledger/api`: Compiled clean (`tsc`)
- `@rgs-ledger/checkout`: Compiled and bundled clean (`vite build`)
- `@rgs-ledger/dashboard`: Compiled and bundled clean (`vite build`)
- `@rgs-ledger/developer-portal`: Compiled and bundled clean (`vite build`)
- `@rgs-ledger/shopify`: Compiled clean (`tsc`)
- `@rgs-ledger/woocommerce`: Verified package

### 4. End-to-End Senior Fintech Audit (`scripts/verify-e2e-audit.ts`)
```
================================================================
AUDIT COMPLETE: 18 VERIFIED, 0 FAILED
================================================================
[✓] [INFRASTRUCTURE] MongoDB Live Connectivity
[✓] [INFRASTRUCTURE] REST API Server Startup & Health
[✓] [AUTHENTICATION] Merchant Registration Flow
[✓] [AUTHENTICATION] Merchant Login & JWT Issuance
[✓] [AUTHENTICATION] Password Hashing Security (Bcrypt cost factor 12)
[✓] [SECURITY] Cross-Merchant Isolation Boundary (HTTP 404)
[✓] [SECURITY] Role-Based Access Control (Admin Protection)
[✓] [AUTHENTICATION] Super Admin Authorization
[✓] [PAYMENTS] End-to-End Successful Payment Journey
[✓] [FINANCIAL_LEDGER] Double-Entry Capture Journal Balancing
[✓] [PAYMENTS] Deterministic Payment Failure Scenario
[✓] [PAYMENTS] Deterministic Payment Pending Scenario
[✓] [REFUNDS] Partial Refund Execution & Order State
[✓] [FINANCIAL_LEDGER] Double-Entry Refund Journal Balancing
[✓] [FINANCIAL_LEDGER] Refund Ceiling Enforcement
[✓] [PAYMENTS] Idempotency Protection (Idempotency-Key)
[✓] [SECURITY] SSRF Protection on Webhook Delivery
[✓] [WEBHOOKS] HMAC-SHA256 Timing-Safe Signature & Replay Window
```

---

## 6. Commitments & Constraints Adherence

- **Local Sandbox Only:** All testing and reconciliation executed exclusively against `127.0.0.1:27017/rgs_ledger`.
- **Git Remote Safety:** No pushes to GitHub or alterations to remote repositories.
- **Financial Ledger Invariants:** Capture and refund double-entry ledger batches were not modified. Debits remain strictly balanced with credits across all merchant accounts.
- **Zero Loss of Audit Data:** Accidental duplicate payments were safely transitioned to terminal `CANCELLED` status with explanatory error codes rather than deleted.
