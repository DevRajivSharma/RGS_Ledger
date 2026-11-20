# RGS Ledger — System Architecture

## 1. High-Level System Overview

RGS Ledger is structured as a **Modular Monolith** adhering to Clean Architecture principles. It solves the problem of automated payment verification for small-to-medium Indian merchants accepting direct UPI payments without high gateway transaction fees.

```
+-----------------------------------------------------------------------------------------+
|                                    MERCHANT / BUYER                                     |
+-----------------------------------------------------------------------------------------+
       |                                      |                                   |
       v                                      v                                   v
+------------------+                 +------------------+                +-----------------+
|  Hosted Checkout |                 | Merchant Portal  |                | Mobile App      |
|  (React + Vite)  |                 | (React + Vite)   |                | (React Native)  |
+------------------+                 +------------------+                +-----------------+
       |                                      |                                   |
       +--------------------------------------+-----------------------------------+
                                              | HTTPS REST API
                                              v
+-----------------------------------------------------------------------------------------+
|                                  RGS LEDGER API SERVICE                                 |
|                                                                                         |
|   +-------------------+    +--------------------+    +-----------------------------+    |
|   |   Auth & Tenant   |    |  Payments & UPI    |    |   Email Evidence Ingestion  |    |
|   |   Isolation       |    |  Adapter           |    |   (Gmail / Outlook Parsers) |    |
|   +-------------------+    +--------------------+    +-----------------------------+    |
|                                                                                         |
|   +---------------------------------------------+    +-----------------------------+    |
|   |   Dual-Source Evidence Matching Engine      |    |   Android Push Notification |    |
|   |   (Rules & State Machine Evaluation)        |    |   Companion Ingestion       |    |
|   +---------------------------------------------+    +-----------------------------+    |
|                                                                                         |
|   +-------------------+    +--------------------+    +-----------------------------+    |
|   |   Reconciliation  |    | Webhooks & Outbox  |    | MongoDB Leased Background   |    |
|   |   Cases           |    | Dispatcher         |    | Job Runner                  |    |
|   +-------------------+    +--------------------+    +-----------------------------+    |
+-----------------------------------------------------------------------------------------+
                                              |
                                              v
+-----------------------------------------------------------------------------------------+
|                               MONGODB ATLAS (SOURCE OF TRUTH)                           |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Core Architectural Principles

1. **Modular Monolith**: Code is partitioned into distinct business modules (`auth`, `payments`, `upi`, `email-evidence`, `android-evidence`, `evidence-matching`, `reconciliation`, `webhooks`, `background-jobs`, etc.) rather than fragmented microservices.
2. **Clean Architecture**:
   - **Domain**: Pure business rules, entities, and state transition invariants.
   - **Application**: Service orchestrators and use case logic.
   - **Infrastructure**: Repositories, database models, and external adapters.
   - **Presentation**: HTTP controllers and routes.
3. **Decoupled UPI Generation**: All UPI URI creation (`upi://pay?...`) is encapsulated behind the `IUpiAdapter` interface in `packages/upi-adapter`. No third-party library calls or PSP methods leak into the business logic.
4. **Multi-Tenant Isolation**: All database operations mandate `merchantId` scoping. Cross-merchant data access is impossible by design.
5. **No Direct Bank Verification Claim**: Architecture explicitly defines that `SUCCESS` is the fulfillment of a dual-evidence policy, not bank-cleared settlement confirmation.
