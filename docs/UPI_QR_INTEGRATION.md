# NPCI UPI QR & Intent Deep-Link Integration Specification

## 1. Overview & Architectural Boundaries

RGS Ledger is a non-custodial payment evidence-matching platform. It does not touch merchant or customer money, does not hold wallets, and does not connect to bank rails or aggregator settlement APIs.

All payment collection is achieved by generating standard **NPCI UPI URIs (Specification 1.6)** and dynamic QR codes that encode the merchant's configured UPI VPA (Virtual Payment Address).

### External Library Isolation (`upipay`)
- **Package**: `upipay@1.0.0`
- **Permitted Functionality**: Only local QR code generation (`generateUPIQR`) and intent URL formatting (`buildIntentLinks`) from `upipay/qr`.
- **Strictly Prohibited**:
  - PhonePe / Paytm Business PSP adapters
  - Webhook verification functions
  - PSP status polling
  - Bank gateway integration

The `packages/upi-adapter` package completely isolates `upipay` from the rest of the monorepo. No backend module, route, or frontend imports `upipay` directly.

---

## 2. UPI URI Specification & Parameters

Generated UPI URIs conform to the NPCI UPI Common Specifications:

```
upi://pay?pa={payee_vpa}&pn={payee_name}&am={amount_in_rupees}&cu=INR&tn={transaction_note}&tr={reference_order_id}&mode=04
```

| Parameter | Name | Description |
|---|---|---|
| `pa` | Payee Address (VPA) | Merchant's configured UPI ID (e.g., `store@okhdfcbank`). Validated against `^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$`. |
| `pn` | Payee Name | Merchant's business name. |
| `am` | Amount | Payment amount formatted in INR rupees with up to two decimal places (e.g., `499.50`). |
| `cu` | Currency | Fixed to `INR`. |
| `tn` | Transaction Note | Order description or note. |
| `tr` | Transaction Reference | Merchant order ID / payment reference for customer reference. |
| `mode` | UPI Mode | Fixed to `04` (Fixed Amount QR / Intent), which locks the payment amount in customer UPI apps and prevents customer alteration. |

---

## 3. Amount Handling: Paise to Rupees Invariant

- **Database & Domain Models**: Amounts are ALWAYS represented as positive integers in **paise** (`amountPaise`).
- **Paise Precision**: 1 INR = 100 paise. Floating-point arithmetic on currency values is strictly prohibited in database persistence.
- **Conversion to Rupees**: Done solely at URI / display formatting time:
  $$\text{amountRupees} = \frac{\text{amountPaise}}{100}$$
  Formatted with `amountRupees.toFixed(2)` when creating the `am` parameter.

---

## 4. Mobile UPI Intent Deep Links

For mobile web customers on Android and iOS devices, RGS Ledger constructs application-specific intent links alongside the generic `upi://pay` URI:

| Provider | URL Scheme Format | Target App |
|---|---|---|
| Generic UPI | `upi://pay?...` | System UPI chooser (Any UPI app) |
| PhonePe | `phonepe://pay?...` | PhonePe |
| Google Pay | `tez://upi/pay?...` | Google Pay (Tez rail) |
| Paytm | `paytmmp://pay?...` | Paytm |
| BHIM | `upi://pay?...` | BHIM UPI |

---

## 5. Security & Isolation Controls

1. **Non-Custodial Destination**: The payee VPA (`pa`) is loaded directly from the authenticated merchant's verified configuration. A merchant cannot specify another merchant's VPA.
2. **Fixed Amount Protection**: The `mode=04` flag signals to UPI applications that this is a merchant payment with an unalterable amount.
3. **No Secret Leakage**: The public checkout session exposes only the public QR image, intent links, order ID, and merchant display name. Internal MongoDB IDs, user passwords, refresh tokens, and internal routing keys are completely omitted.
