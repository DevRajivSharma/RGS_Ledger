# RGS LEDGER — UPIPAY INTEGRATION ARCHITECTURE SPECIFICATION

**Document ID:** `RGS-ARCH-UPIPAY-2026-11`  
**Integration Library:** `upipay@1.0.0` (https://github.com/iamrobinsharaya/upipay)  
**Security Classification:** Core Fintech Architectural Standard  

---

## 1. Executive Summary & Package Verification

RGS Ledger integrates `upipay` as its high-performance, zero-commission UPI payment engine. Rather than relying solely on high-level documentation, the actual source files of `upipay` (`src/client.ts`, `src/adapters/phonepe.ts`, `src/adapters/paytm.ts`, `src/upi/qr.ts`, `src/utils/validation.ts`, `src/utils/ip-guard.ts`, `SECURITY.md`, `CHANGELOG.md`, `package.json`) were audited and verified.

### Package Audit Details:
- **Package Version:** `upipay@1.0.0` (pinned exactly in `packages/payment-core/package.json`).
- **Dependencies:** Exactly 1 runtime dependency (`qrcode@^1.5.4`). Zero external HTTP/network libraries (uses native Node.js `fetch` and native `crypto`).
- **Provenance:** Published with npm provenance attestation signed via GitHub Actions CI.
- **Runtime Environment:** Runs strictly server-side (Node.js 18+). The library includes a built-in browser guard (`throw new InvalidConfigError('UPIPay must be instantiated only in server-side environments')`) preventing accidental client-side credential exposure.

---

## 2. The Critical Distinction: Mechanism A vs. Mechanism B

Fintech engineering requires distinguishing between client-side presentational payment requests and server-authoritative payment execution. `upipay` exposes two fundamentally different payment mechanisms:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            UPIPAY PAYMENT MECHANISMS                             │
├────────────────────────────────────────┬─────────────────────────────────────────┤
│ MECHANISM A: Raw UPI QR / Intent       │ MECHANISM B: PhonePe / Paytm PSP APIs   │
├────────────────────────────────────────┼─────────────────────────────────────────┤
│ • generateUPIQR()                      │ • client.createPayment()                │
│ • buildUPIUri()                        │ • client.checkStatus()                  │
│ • buildIntentLinks()                   │ • client.verifyWebhook()                │
│ • Zero merchant account needed         │ • Requires merchant PSP onboarding      │
│ • NO automated server confirmation     │ • AUTOMATED server-to-server webhook    │
│ • Status: AWAITING_MANUAL_CONFIRMATION │ • Status: Authoritative SUCCESS/FAILED  │
│ • Requires manual bank UTR verification│ • Authoritative Status API check        │
└────────────────────────────────────────┴─────────────────────────────────────────┘
```

### Mechanism A — Raw UPI QR & Intent
- **Functions:** `generateUPIQR()`, `buildUPIUri()`, `buildIntentLinks()`.
- **Operating Model:** Computes an NPCI-compliant URI (`upi://pay?pa=...&pn=...&am=...&cu=INR&mode=04`) and renders a high-density QR code (Base64 PNG / Canvas).
- **FINTECH SAFETY PRINCIPLE:** A QR scan, deep-link app opening, return redirect, or customer screenshot is **NEVER** proof of receipt.
- **RGS Ledger Implementation:** Transactions initiated via `UpiQrManualPaymentProvider` are created in `PENDING` state with `manualVerificationStatus = 'AWAITING_MANUAL_CONFIRMATION'`. They are **never** auto-captured. They transition to `SUCCESS` only when authorized finance operators verify the credit on the bank statement and submit the UTR via `/api/v1/payments/:id/confirm-manual`.

### Mechanism B — PhonePe Business & Paytm Business PSP APIs
- **Functions:** `createPayment()`, `checkStatus()`, `verifyWebhook()`, `createRefund()`.
- **Operating Model:** Connects directly to PhonePe/Paytm merchant infrastructure.
- **Flow:**
  1. RGS Ledger creates order and calls `client.createPayment()`.
  2. Provider returns hosted payment URL and transaction ID.
  3. Customer completes payment on provider checkout page.
  4. Provider sends signed server-to-server callback / browser return POST.
  5. RGS Ledger verifies cryptographic signature (`X-VERIFY` or Checksum).
  6. RGS Ledger independently confirms status via `client.checkStatus()` with `expectedAmount`.
  7. Only upon authoritative confirmation, payment is resolved, double-entry ledger is captured, and merchant webhook is dispatched.

---

## 3. Provider Callback Architectures: PhonePe vs. Paytm

PhonePe and Paytm differ substantially in their callback architectures. RGS Ledger handles each with dedicated, provider-specific controllers:

### 3.1 PhonePe Business
- **Protocol:** Asynchronous server-to-server HTTP POST webhook to `/api/v1/callbacks/phonepe`.
- **Payload Shape:** Base64-encoded JSON response wrapped in `{ "response": "eyJ..." }`.
- **Signature Header:** `X-VERIFY: SHA256(base64Payload + saltKey) + "###" + saltIndex`.
- **Verification Rule:**
  - Raw request body is preserved.
  - Signature is validated using constant-time cryptographic equality (`crypto.timingSafeEqual`).
  - Embedded transaction amount is compared against expected order amount (`options.expectedAmount`).

### 3.2 Paytm Business
- **Protocol:** Dual-mode callback to `/api/v1/callbacks/paytm`. Paytm sends a POST request containing transaction parameters (`ORDERID`, `TXNAMOUNT`, `STATUS`, `CHECKSUMHASH`, `TXNID`).
- **CRITICAL BROWSER RETURN BEHAVIOR:** Paytm redirects the **customer's browser** via an HTTP POST form navigation to the callback URL.
  - If a server blindly returns `{ success: true }`, the customer's browser displays a blank white JSON page.
  - RGS Ledger inspects the request headers (`Accept: text/html` or `Content-Type: application/x-www-form-urlencoded`).
  - For browser return navigations, RGS Ledger verifies the checksum, updates the transaction, and returns a branded HTML auto-redirect receipt page navigating back to `${config.checkoutUrl}/checkout/:id`.
  - For server-to-server notification requests, it responds with 200 OK JSON.

---

## 4. Replay-Protection Audit & Source Code Verification

The prompt explicitly mandated inspecting the documented replay-protection defaults against the actual source code rather than relying on conflicting documentation.

### Finding:
- **CHANGELOG.md (line 31):** States `"Webhook replay protection enabled by default — stale webhooks (> 5 minutes) are rejected"`.
- **README.md (lines 388–392):** States `"Replay protection is opt-in (enableReplayProtection: false by default). PSPs embed the transaction timestamp in webhook payloads, not the webhook delivery time..."`.
- **Actual Source Code (`src/adapters/phonepe.ts` & `src/adapters/paytm.ts`):**
  ```typescript
  const replayEnabled = options?.enableReplayProtection === true;
  ```
- **Conclusion:** Replay protection in `upipay@1.0.0` is strictly **OPT-IN** (`false` by default).

### RGS Ledger Replay Mitigation Strategy:
Enabling strict timestamp tolerance windows on PSP transaction timestamps causes silent failures when PSP retry intervals (e.g. 15-minute retry cycles) or bank network delays occur. RGS Ledger implements the architecturally recommended defense:
- Database-level unique constraint on `{ orderId: 1, status: 1 }` (partial filter for active PENDING).
- Transaction-level idempotency record (`IdempotencyRecord` with 24-hour TTL).
- State-machine immutability: once a transaction reaches `SUCCESS`, subsequent callbacks are idempotent no-ops that never duplicate ledger captures.

---

## 5. Scope & Limitations of UPIPay

| Capability | Supported by UPIPay? | RGS Ledger Architectural Handling |
| :--- | :---: | :--- |
| UPI Dynamic QR | ✅ Yes | `generateUPIQR()` with `mode: 'fixed'` (NPCI `mode=04`). |
| UPI Deep Links | ✅ Yes | `buildIntentLinks()` (`phonepe://`, `tez://`, `paytmmp://`, `bhim://`). |
| PhonePe Hosted Checkout | ✅ Yes | `UPIPayPhonePeProvider` via `/pg/v1/pay`. |
| Paytm Hosted Checkout | ✅ Yes | `UPIPayPaytmProvider` via `/theia/api/v1/initiateTransaction`. |
| Credit & Debit Cards | ❌ **No** | Requires separate acquiring gateway (`CardPaymentProvider`). |
| Netbanking (50+ Banks) | ❌ **No** | Requires bank aggregator partnership (`NetbankingPaymentProvider`). |
| International Payments | ❌ **No** | UPI is an India domestic rail (INR only). |
| Wallet / PPI | ⚠️ Partial | Supported only if enabled in merchant's PSP account. |

UPIPay is strictly a UPI-focused SDK. Card and Netbanking payments are handled through separate dedicated adapters with explicit capability declarations and regulatory safeguards.
