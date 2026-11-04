# Payment Provider Adapter Architecture

RGS Ledger decouples the merchant order state machine from banking and acquirer connectivity through the `IPaymentProvider` contract.

## Interface Contract
Located in `packages/payment-core/src/interfaces.ts`:

```typescript
export interface IPaymentProvider {
  readonly providerId: string;
  readonly isLive: boolean;

  createOrder(req: ProviderOrderRequest): Promise<ProviderOrderResponse>;
  initiatePayment(req: ProviderPaymentRequest): Promise<ProviderPaymentResponse>;
  fetchPayment(providerPaymentId: string): Promise<ProviderPaymentResponse>;
  verifyPayment(providerPaymentId: string): Promise<ProviderPaymentResponse>;
  createRefund(req: ProviderRefundRequest): Promise<ProviderRefundResponse>;
  fetchRefund(providerRefundId: string): Promise<ProviderRefundResponse>;
  verifyWebhook(payload: string, signature: string, secret: string): boolean;
}
```

## Implemented Adapters

### 1. `SandboxPaymentProvider`
- Active by default.
- Allows end-to-end development, testing, and automated test execution without external banking infrastructure or commercial approvals.
- Deterministic behavior:
  - Amount ending in `00` -> SUCCESS
  - Amount ending in `01` -> DECLINED_BY_BANK
  - Amount ending in `02` -> PENDING_IN_UPI_APP
  - Test UPI ID `success@rgs` -> Instant Capture
  - Test UPI ID `fail@rgs` -> Declined

### 2. `GenericUPIIntentProvider`
- NPCI compliant standard UPI URI constructor:
  `upi://pay?pa=...&pn=...&mc=...&tr=...&tn=...&am=...&cu=INR`
- Generates deep-link targets for Google Pay (`tez://`), PhonePe (`phonepe://`), Paytm (`paytmmp://`), and BHIM (`bhim://`).

### 3. Authorized Partner Gateway Adapters (Razorpay, Cashfree)
- Registered in `ProviderConfig` as disabled.
- Activation requires RBI Payment Aggregator approval, acquiring bank nodal account contract, and verified partner credentials.
