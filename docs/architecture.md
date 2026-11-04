# RGS Ledger Platform Architecture

## Executive Overview
**RGS Ledger** is an enterprise-grade fintech payment gateway infrastructure platform designed for high-concurrency payment ingestion, deterministic sandbox simulation, double-entry financial accounting, and merchant ecosystem management.

```
                              ┌──────────────────────────────────┐
                              │     Merchant / Customer Client   │
                              └────────────────┬─────────────────┘
                                               │
                                  REST API / Hosted Checkout
                                               ▼
                              ┌──────────────────────────────────┐
                              │      Express REST API Gateway    │
                              │  - Helmet / Rate Limiting        │
                              │  - Tenant Isolation (merchantId) │
                              │  - Idempotency Engine            │
                              │  - Role-Based Access Control     │
                              └────────┬────────────────┬────────┘
                                       │                │
                        Payment Flow   ▼                ▼  Async Webhooks / Jobs
                      ┌──────────────────────┐   ┌───────────────────────┐
                      │ Payment State Machine│   │ Redis / BullMQ Outbox │
                      │ - Orders             │   │ - Webhook Deliveries  │
                      │ - Payment Attempts   │   │ - Reconciliations     │
                      │ - Refunds            │   │ - SSRF Protection     │
                      └──────────┬───────────┘   └───────────┬───────────┘
                                 │                           │
                   Double Entry  ▼                           ▼
            ┌─────────────────────────────┐         ┌────────────────────┐
            │ Immutable Financial Ledger  │         │ External Merchant  │
            │  ∑ Debits === ∑ Credits     │         │ Webhook Endpoints  │
            └──────────────┬──────────────┘         └────────────────────┘
                           │
                           ▼
            ┌─────────────────────────────┐
            │   MongoDB Primary Storage   │
            └─────────────────────────────┘
```

## Key Architectural Principles

1. **Provider-Independent Payment Core**
   - The application does not hardcode vendor-specific payment logic.
   - All payment collection runs through the `IPaymentProvider` contract.
   - Default engine runs `SandboxPaymentProvider` with deterministic test outcomes.
   - Authorized payment providers (e.g., acquiring banks, licensed payment aggregators) connect as clean adapters without modifying the order lifecycle.

2. **Strict Integer Minor Unit Arithmetic (Paise)**
   - Financial amounts in INR are represented strictly as integers in paise (₹1.00 = 100 paise).
   - Prevents IEEE 754 binary floating-point representation drift and rounding errors.

3. **Double-Entry Financial Accounting Ledger**
   - Every financial event (capture, refund, gateway fee, payout) generates balanced journal entries.
   - Mathematical constraint: `Total Debits === Total Credits`.
   - Historical entries are immutable; reversals and adjustments are handled through new offsetting journal entries.

4. **Multi-Tenant Isolation**
   - Every merchant resource (orders, payments, API keys, customers, webhooks) is indexed and isolated by `merchantId`.
   - Server-side tenant isolation middleware enforces data scoping at the database query level.

5. **Asynchronous Webhook Outbox with BullMQ & SSRF Filter**
   - Webhook deliveries do not block HTTP payment confirmation responses.
   - Outbound requests are filtered against internal/private IP ranges (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254`).
   - Deliveries are signed with HMAC-SHA256 timestamped signatures to prevent replay attacks.
