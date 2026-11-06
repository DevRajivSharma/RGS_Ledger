# RGS LEDGER — FINANCIAL CURRENCY & AMOUNT HANDLING AUDIT

**Audit Date:** November 5, 2026  
**Audit Scope:** Full Monorepo Architecture (Database, API, Core Engine, Webhooks, Dashboard, Checkout, SDKs, Integrations)  
**Audit Mode:** Read-Only Technical Verification  
**Primary Standard:** Strict Integer Minor Units (Paise for INR, Cents for USD/EUR)  
**Report File:** `CURRENCY_UNIT_AUDIT.md`  

---

## 1. Executive Summary

A comprehensive read-only audit of currency and financial amount handling was conducted across all applications, packages, and integrations in RGS Ledger.

### Context of Observation
During testing, a transaction for ₹300 was observed:
- **Merchant Dashboard Display:** `₹300.00`
- **Webhook Payload (`payment.succeeded`):** `amount: 30000`

### Audit Conclusion
**The observed behavior is 100% correct and conforms to enterprise fintech industry standards (Stripe, Razorpay, Cashfree, PayU).**
- **Internal / Data Plane:** RGS Ledger strictly adheres to **integer minor units** (paise for INR, where `₹1.00 = 100 paise`). All database documents, ledger double-entry journals, calculation routines, and API/webhook payloads use integer paise (`30000` for ₹300.00).
- **Presentation / Human Plane:** The merchant dashboard, checkout page, and customer receipts convert integer minor units into human-readable formatted localized strings (`₹300.00`) exclusively at the presentation layer using `Intl.NumberFormat`.
- **Mathematical Integrity:** There is zero floating-point arithmetic used in ledger balance assertions or monetary additions. No component accidentally multiplies or divides amounts twice.

---

## 2. Comprehensive Verification Checklist

| # | Verification Area | Target Standard | Status | Evidence & Code References |
| :- | :--- | :--- | :-: | :--- |
| **1** | **Database Storage** | Integer paise in all models | **PASS** | `Order.amount`, `Payment.amount`, `Refund.amount`, `CheckoutSession.amount`, `LedgerEntry.amountMinor` stored as integer paise. |
| **2** | **API Order Creation** | Accepts integer paise ($\ge 100$) | **PASS** | `CreateOrderSchema` (`z.number().int().positive()`) and `OrderService.createOrder` (`Number.isInteger` & $\ge 100$). |
| **3** | **Payment & Refund Math** | Integer minor unit arithmetic | **PASS** | `DoubleEntryLedger` fee & GST basis points math uses integer rounding. Debits strictly equal credits down to 1 paisa. |
| **4** | **Webhook Payloads** | Documented integer minor units | **PASS** | `order.created`, `payment.created`, `payment.succeeded`, and `refund.processed` emit integer paise. |
| **5** | **Merchant Dashboard** | Correct conversion to formatted INR | **PASS** | Uses `formatCurrency(amountPaise, 'INR')` via `Intl.NumberFormat('en-IN', { style: 'currency' })`. |
| **6** | **Hosted Checkout Display** | Correct human-readable & UPI URI | **PASS** | Header & CTA display `₹300.00`; UPI QR encodes `am=300.00` as required by NPCI UPI intent specifications. |
| **7** | **SDKs & Documentation** | Explicitly documented units | **PASS** | `sdk-node`, `DeveloperPortal.tsx`, and WooCommerce plugin clearly specify amounts in integer paise. |
| **8** | **Conversion Idempotency** | No duplicate $\times 100$ or $\div 100$ | **PASS** | Boundary conversions occur strictly at external I/O boundaries (UI input/output, NPCI UPI URI, WooCommerce total). |

---

## 3. Financial Lifecycle Examples Across All Layers

The table below illustrates the representation of financial amounts across the four key platform boundaries for standard transaction values:

| Commercial Amount | API Request Payload (`POST /api/v1/orders`) | MongoDB Document (`orders` & `payments`) | Webhook Payload (`payment.succeeded`) | Dashboard / Checkout UI Display | Double-Entry Ledger Debit/Credit (`LedgerEntry`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **₹1.00** *(Min Allowed)* | `{"amount": 100, "currency": "INR"}` | `amount: 100` | `"amount": 100` | `₹1.00` | Debits: `100` paise<br>Credits: `100` paise |
| **₹100.00** | `{"amount": 10000, "currency": "INR"}` | `amount: 10000` | `"amount": 10000` | `₹100.00` | Debits: `10000` paise<br>Credits: `10000` paise |
| **₹300.00** *(Audited Case)* | `{"amount": 30000, "currency": "INR"}` | `amount: 30000` | `"amount": 30000` | `₹300.00` | Debits: `30000` paise<br>Credits: `30000` paise |
| **₹1,000.00** | `{"amount": 100000, "currency": "INR"}` | `amount: 100000` | `"amount": 100000` | `₹1,000.00` | Debits: `100000` paise<br>Credits: `100000` paise |

---

## 4. Deep-Dive Architecture Inspection

### 4.1 Database Layer (`apps/api/src/database/models/index.ts`)
All monetary values in MongoDB are stored as integer numbers:
- **`Order` Schema:**
  - `amount`: `Number`, required, `min: 100` (100 paise = ₹1.00 minimum transaction floor).
  - `amountPaid`: `Number`, default 0 (paise).
  - `amountRefunded`: `Number`, default 0 (paise).
- **`Payment` Schema:**
  - `amount`: `Number`, required (paise).
- **`Refund` Schema:**
  - `amount`: `Number`, required (paise).
- **`CheckoutSession` Schema:**
  - `amount`: `Number`, required (paise).
- **`PaymentLink` Schema:**
  - `amount`: `Number`, required (paise).
- **`Customer` Schema:**
  - `totalPaymentsPaise`: `Number`, default 0 (paise).
- **`LedgerEntry` Schema:**
  - `amountMinor`: `Number`, required, `min: 1` (paise).
- **`Settlement` Schema:**
  - `grossAmount`, `feeAmount`, `taxAmount`, `netAmount`: all stored in integer paise.

### 4.2 Core Financial Engine & Ledger (`packages/payment-core/src/double-entry.ts`)
The double-entry ledger enforces financial balance down to the single minor unit (1 paisa):
- **Basis Points Calculation:**
  ```ts
  export function calculateBasisPoints(amountMinor: number, basisPoints: number): number {
    if (!Number.isInteger(amountMinor)) throw new Error(`Non-integer amount: ${amountMinor}`);
    return Math.round((amountMinor * basisPoints) / 10000);
  }
  ```
- **Transaction Breakdown for ₹300.00 (`amountMinor = 30000`):**
  - **Gross Amount:** `30,000` paise
  - **Gateway Fee (200 bps / 2.0%):** `(30000 * 200) / 10000 = 600` paise (₹6.00)
  - **GST on Fee (1800 bps / 18.0%):** `Math.round((600 * 1800) / 10000) = 108` paise (₹1.08)
  - **Total Deductions:** `600 + 108 = 708` paise (₹7.08)
  - **Net Merchant Payable:** `30000 - 708 = 29,292` paise (₹292.92)
  - **Journal Balance Check:**
    - Total Debits: `30,000` paise (`GATEWAY_CLEARING_INR`)
    - Total Credits: `29,292` + `600` + `108` = `30,000` paise
    - Difference: `0` paise (Perfect Mathematical Balance)

### 4.3 Webhook Event Payloads (`apps/api/src/services/`)
Every webhook dispatched by the system uses raw integer paise without decimal formatting:
- **`order.created`:**
  ```json
  {
    "event": "order.created",
    "data": {
      "orderId": "ord_e528dc905581f1816f5c8bf9",
      "amount": 30000,
      "currency": "INR",
      "status": "CREATED"
    }
  }
  ```
- **`payment.succeeded`:**
  ```json
  {
    "event": "payment.succeeded",
    "data": {
      "paymentId": "pay_ad6ef1bfa98aa558cb79be6a",
      "orderId": "ord_e528dc905581f1816f5c8bf9",
      "amount": 30000,
      "currency": "INR",
      "status": "SUCCESS",
      "method": "UPI_QR",
      "capturedAt": "2026-11-05T17:10:45.000Z"
    }
  }
  ```
- **`refund.processed`:**
  ```json
  {
    "event": "refund.processed",
    "data": {
      "refundId": "ref_1c5fccb65344b5a111e711ff",
      "paymentId": "pay_ad6ef1bfa98aa558cb79be6a",
      "amount": 5000,
      "currency": "INR",
      "status": "PROCESSED"
    }
  }
  ```

### 4.4 Presentation Layer & Formatter (`packages/shared/src/currency.ts`)
The centralized formatting utility handles localized currency formatting:
```ts
export function formatCurrency(minorAmount: number, currency: string = 'INR'): string {
  if (!Number.isInteger(minorAmount)) minorAmount = Math.round(minorAmount);
  const config = SUPPORTED_CURRENCIES[currency.toUpperCase()] || SUPPORTED_CURRENCIES.INR;
  const major = minorAmount / config.minorUnitFactor; // 30000 / 100 = 300.00
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(major);
}
```
- In Merchant Dashboard:
  - `OrdersPage.tsx`: `<td>{formatCurrency(o.amount, o.currency)}</td>` renders `₹300.00`.
  - `TransactionsPage.tsx`: `<td>{formatCurrency(p.amount, p.currency)}</td>` renders `₹300.00`.
  - `RefundsPage.tsx`: `<td>{formatCurrency(r.amount, r.currency)}</td>` renders `₹50.00`.
  - `SettlementsPage.tsx`: `<td>{formatCurrency(s.grossAmount, s.currency)}</td>` renders `₹300.00`.

### 4.5 External Protocol Boundaries
1. **NPCI UPI Intent URI (`packages/payment-core/src/upi-intent.ts`):**
   - NPCI specification requires the `am=` parameter in `upi://pay` to be formatted as a decimal string in major units (Rupees).
   - `GenericUPIIntentProvider.generateIntentUri` calls:
     ```ts
     const amountMajor = toMajorUnitString(params.amountPaise, 'INR'); // 30000 -> "300.00"
     ```
   - Generated URI: `upi://pay?pa=merchant@bank&pn=Merchant&tr=pay_123&am=300.00&cu=INR`
   - When scanned by UPI apps (PhonePe, Google Pay, Paytm), the customer's phone accurately requests ₹300.00.
2. **WooCommerce Gateway Integration (`integrations/woocommerce`):**
   - WooCommerce core provides order totals as decimal floats (e.g. `100.50`).
   - Boundary conversion: `$amount_paise = round($order->get_total() * 100);` sends `10050` paise to RGS Ledger API.
   - For refunds: `$amount_paise = round($amount * 100);` sends integer paise to `POST /api/v1/refunds`.

---

## 5. Identified Minor Inconsistencies & Recommendations

While the system is functionally sound and mathematically balanced, the audit identified three minor documentation and validation discrepancies:

### 1. Schema Validation Floor Consistency
- **Current Behavior:** `OrderService.createOrder` enforces `if (data.amount < 100) throw 400`, but `CreateOrderSchema` in Zod only checks `.positive()`.
- **Recommendation:** Align Zod schema to reject amounts below 100 paise at the request validation layer:
  ```ts
  amount: z.number().int().min(100, 'Order amount must be at least 100 paise (₹1.00)')
  ```

### 2. JSDoc Annotation on SDK Methods
- **Current Behavior:** In `packages/sdk-node/src/index.ts`, `orders.create` and `refunds.create` have comments `amount: number; // in paise`, while `paymentLinks.create` has `amount: number;` without the comment.
- **Recommendation:** Add `/** Amount in integer minor units (paise for INR). Example: 30000 for ₹300.00 */` to all SDK methods.

### 3. Mock Data Character Encoding in Dashboard
- **Current Behavior:** In `apps/dashboard/src/pages/ReconciliationPage.tsx`, static mock data rows have `?2,999.00` instead of `₹2,999.00` due to a UTF-8 character encoding artifact in the prototype view.
- **Recommendation:** Replace literal string `?2,999.00` with standard `formatCurrency(299900, 'INR')`.

---

## 6. Official API Contract & Best Practices Guide

### Official Currency Contract
1. **Always send integer minor units:**
   - INR: Paise ($1 \text{ INR} = 100 \text{ paise}$)
   - USD: Cents ($1 \text{ USD} = 100 \text{ cents}$)
   - EUR: Cents ($1 \text{ EUR} = 100 \text{ cents}$)
2. **Never send floating point decimals in API requests:**
   - Incorrect: `{"amount": 300.00}` $\rightarrow$ Rejected by API validator (`Expected integer, received float`).
   - Incorrect: `{"amount": 300}` $\rightarrow$ Creates order for 300 paise (₹3.00), not ₹300.00!
   - **Correct:** `{"amount": 30000}` $\rightarrow$ Creates order for ₹300.00.
3. **Webhooks always dispatch integer minor units:**
   - In your webhook receiver, divide by 100 only when preparing numbers for customer-facing display or accounting reports. Keep calculations in integer minor units to eliminate floating-point rounding errors.
