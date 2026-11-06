# RGS LEDGER — SERVER-AUTHORITATIVE PAYMENT CONFIRMATION FLOW

**Document ID:** `RGS-FLOW-CONFIRMATION-2026-11`  
**Platform:** RGS Ledger — Enterprise Fintech Platform  
**Security Classification:** Core Financial Safety Standard  

---

## 1. Fintech Safety Principles

In commercial fintech engineering, **client-side events are never evidence of money receipt**. 
- A customer viewing a QR code is not evidence of payment.
- A customer clicking "I have paid" is not evidence of payment.
- A browser redirect returning from a gateway is not evidence of payment.
- A webhook payload claiming `SUCCESS` without cryptographic signature verification and independent status inquiry is not evidence of payment.

RGS Ledger strictly enforces **Server-Authoritative Confirmation**:

```
[Inbound Callback] ──> [Signature Verification] ──> [Amount & Identity Check] ──> [Independent Status Query] ──> [Double-Entry Capture]
```

---

## 2. Sequence Diagram: Automated PSP Payment Flow (PhonePe / Paytm)

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Checkout as Hosted Checkout UI
    participant API as RGS Ledger API
    participant DB as MongoDB Cluster
    participant Ledger as Double-Entry Ledger
    participant PSP as PhonePe / Paytm PSP
    participant Queue as BullMQ Webhook Queue
    participant Merchant as Merchant Webhook Server

    Customer->>Checkout: Selects "UPI Apps" / "PhonePe" & clicks Pay
    Checkout->>API: POST /api/v1/checkout/sessions/:id/initiate (method: UPI_INTENT)
    API->>DB: Find Order & Merchant Provider Credentials
    API->>PSP: client.createPayment({ amount, orderId, callbackUrl, redirectUrl })
    PSP-->>API: { paymentUrl, providerTransactionId }
    API->>DB: Create Payment (status: PENDING, method: UPI_INTENT)
    API-->>Checkout: { paymentId, paymentUrl, upiUri }
    Checkout->>Customer: Redirect to Provider Hosted Payment Page / Open UPI App

    Customer->>PSP: Authorizes Payment with UPI MPIN on Phone
    PSP->>Customer: Debits Customer Bank Account via NPCI

    par PSP Callback to RGS Ledger
        PSP->>API: POST /api/v1/callbacks/phonepe (Raw Body, X-VERIFY)
        API->>API: 1. Verify X-VERIFY HMAC-SHA256 checksum
        API->>API: 2. Verify expectedAmount === payment.amount (in paise)
        API->>PSP: 3. Authoritative Query: client.checkStatus(orderId)
        PSP-->>API: { status: 'SUCCESS', amount: 50000, transactionId }
        API->>DB: Atomic Update Payment -> SUCCESS, Order -> CAPTURED
        API->>Ledger: Record balanced journal (Debit: Settlement Clearing, Credit: Merchant Payable)
        API->>Queue: Enqueue payment.succeeded event
        API-->>PSP: 200 OK { success: true }
    and Customer Browser Navigation
        PSP->>Checkout: Redirect Customer to redirectUrl
        Checkout->>API: GET /api/v1/checkout/sessions/:id
        API-->>Checkout: Session status: COMPLETED, Order status: CAPTURED
        Checkout->>Customer: Displays Verified Success Screen
    end

    Queue->>Merchant: POST merchant_webhook_url (Signed: HMAC-SHA256)
```

---

## 3. Sequence Diagram: Raw UPI QR Flow (Manual Bank Verification)

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Checkout as Hosted Checkout UI
    participant API as RGS Ledger API
    participant DB as MongoDB Cluster
    participant Bank as Merchant Current Account (Bank Portal)
    actor Finance as Merchant Finance Officer
    participant Ledger as Double-Entry Ledger
    participant Queue as BullMQ Webhook Queue

    Customer->>Checkout: Opens UPI QR Tab
    Checkout->>API: POST /api/v1/checkout/sessions/:id/initiate (method: UPI_QR)
    API->>API: Generate NPCI Dynamic QR (mode=04, fixed amount, merchant VPA)
    API->>DB: Create Payment (status: PENDING, manualVerificationStatus: AWAITING_MANUAL_CONFIRMATION)
    API-->>Checkout: { paymentId, qrImage (Base64), upiUri }
    Checkout->>Customer: Displays Non-Editable Fixed Amount QR

    Customer->>Customer: Scans QR in GPay/PhonePe & pays ₹500
    Customer->>Checkout: Informs merchant / shares UTR
    Note over Checkout,API: Payment remains strictly PENDING. Zero automated capture.

    Finance->>Bank: Logs into ICICI/HDFC Corporate Internet Banking
    Bank-->>Finance: Confirms credit of ₹500 with UTR: 412398471201

    Finance->>API: POST /api/v1/payments/:id/confirm-manual { utr: "412398471201" }
    API->>API: 1. Assert payment is PENDING & AWAITING_MANUAL_CONFIRMATION
    API->>API: 2. Validate UTR format (alphanumeric >= 6 chars)
    API->>DB: Update Payment -> SUCCESS, manualVerificationStatus -> MANUAL_VERIFIED
    API->>DB: Update Order -> CAPTURED, amountPaid -> amount
    API->>Ledger: Record double-entry capture journal
    API->>Queue: Enqueue payment.succeeded webhook
    API-->>Finance: 200 OK (Payment Verified and Captured)
```

---

## 4. Key Security Controls in Payment Resolution

### 4.1 Amount Substitution Protection (`expectedAmount`)
In payment gateway attacks, an adversary modifies the client payment to pay ₹1.00 on the provider page and then transmits the legitimate ₹1.00 webhook to fulfill a ₹10,000 order.
- In RGS Ledger, both `verifyWebhook()` and `checkStatus()` enforce `expectedAmount: payment.amount`.
- If the PSP callback contains `amount: 100` but the order requires `1000000`, the callback is rejected with `401 Unauthorized` and logged as a security alert.

### 4.2 Constant-Time Signature Comparison
All signature verifications use `crypto.timingSafeEqual`:
```typescript
const bufProvided = Buffer.from(providedSignature, 'hex');
const bufExpected = Buffer.from(expectedSignature, 'hex');
if (bufProvided.length !== bufExpected.length) return false;
return crypto.timingSafeEqual(bufProvided, bufExpected);
```
This eliminates timing side-channel attacks that could allow attackers to deduce valid signatures byte-by-byte.

### 4.3 Defense-in-Depth Status Query
Even when an incoming webhook carries a cryptographically valid signature, RGS Ledger queries the provider's authoritative Status API (`client.checkStatus()`) before recording ledger entries. This protects against compromised callback URLs and rogue webhook replay.

### 4.4 Automated Reconciliation (`reconcilePayment`)
For payments that remain in `PENDING` due to customer drop-off or network timeouts, the background reconciliation worker polls the provider Status API:
```typescript
const status = await provider.verifyPayment(payment.providerPaymentId, payment.amount);
if (status.status === PaymentStatus.SUCCESS) {
  await PaymentService.resolvePayment({ paymentId, action: 'SUCCESS' });
}
```
Transactions are never prematurely failed or cancelled on network timeouts.
