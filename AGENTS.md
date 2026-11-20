# AGENTS.md — RGS LEDGER DEVELOPER & AI AGENT GUIDE

## 1. PROJECT PURPOSE & CORE PHILOSOPHY

**RGS Ledger** is a production-oriented UPI QR payment collection and evidence-matching platform.

### What RGS Ledger Does:
1. Merchants register on RGS Ledger and configure their existing UPI ID (VPA).
2. RGS Ledger generates dynamic or fixed-amount UPI payment QR codes and intent links.
3. Customers scan the QR code and pay directly to the merchant's bank account via their UPI app (GPay, PhonePe, Paytm, BHIM, etc.).
4. RGS Ledger independently ingests payment-credit evidence from **two sources**:
   - **Email notifications**: Automated parsing of bank credit alert emails (Gmail / Outlook).
   - **Android Companion application**: In-device push notification capture via Android `NotificationListenerService`.
5. RGS Ledger matches both evidence sources against open payment requests.
6. RGS Ledger updates payment status according to its **dual-source evidence policy**.
7. Merchants integrate via REST APIs, SDKs, hosted checkout, payment links, and webhook notifications.

### STRICT BOUNDARIES — What RGS Ledger DOES NOT Do:
- **DOES NOT** hold customer money or merchant funds.
- **DOES NOT** maintain customer/merchant wallets or balances.
- **DOES NOT** process credit cards or debit cards.
- **DOES NOT** provide netbanking gateways.
- **DOES NOT** connect to direct bank APIs or scrape online banking statements.
- **DOES NOT** use payment aggregator/processor APIs to execute or settle payments.
- **DOES NOT** perform fund transfers or merchant settlement.
- **DOES NOT** claim direct bank-authoritative confirmation.

> **CRITICAL FINTECH DISCLOSURE**: Money goes directly to the merchant's configured UPI ID. Payment `SUCCESS` signifies that the dual-source evidence policy was satisfied, NOT that RGS Ledger received direct confirmation from a banking rail.

---

## 2. TECHNOLOGY STACK

- **Monorepo**: npm workspaces
- **Backend API**: Node.js 22+, Express.js, TypeScript, Mongoose 8+, Zod validation, JWT session authentication
- **Frontends**: React 18+, Vite, TypeScript, Tailwind CSS
- **Mobile Companion**: React Native, Expo 52+, TypeScript, Android Kotlin native `NotificationListenerService`
- **Database**: MongoDB Atlas (Source of truth)
- **Infrastructure**: Cloudflare Pages (Frontends), Render (Express API), Cloudflare Workers (Scheduled dispatch), GitHub Actions (CI)
- **UPI QR**: NPCI UPI URI Specification 1.6 abstracted through internal `packages/upi-adapter` (delegating to `upipay` library only for local QR image generation)

---

## 3. PAYMENT LIFECYCLE & DUAL-SOURCE EVIDENCE RULES

### Payment Statuses:
- `PENDING`: Initial state. QR generated, awaiting customer payment and incoming credit evidence.
- `PARTIAL_SUCCESS`: Exactly ONE evidence source (Email OR Android notification) matched the payment request.
- `SUCCESS`: BOTH Email AND Android Companion evidence matched the same underlying bank transaction and payment request.
- `REVIEW_REQUIRED`: Conflicting evidence detected (e.g. amount mismatch, duplicate UTR, or contradictory data).
- `EXPIRED`: Payment request window (e.g. 15 minutes) passed without sufficient evidence.
- `RECONCILIATION_REQUIRED`: Evidence arrived late (after expiry) or requires manual merchant/admin intervention.

### Invariant Business Rules:
1. **Dual-Source Requirement**: Both email and Android evidence are required to transition a payment request to `SUCCESS`.
2. **No Promotion on Timeout**: A timeout or expiry must **NEVER** promote `PARTIAL_SUCCESS` to `SUCCESS`.
3. **One Transaction = One Payment**: One underlying bank transaction (UTR) can never satisfy multiple payment requests.
4. **Email Channel Identity**: Gmail and Outlook together count as **one** email evidence channel. Receiving alerts on both Gmail and Outlook for the same payment does NOT satisfy the dual-source rule (Android Companion is still required).
5. **Deduplication**: Ingested duplicate evidence (same UTR or identical raw payload hash) must be deduplicated and marked `DUPLICATE`.
6. **Payment Status vs Evidence Status**: The application must strictly distinguish between `PaymentStatus` (`PENDING`, `SUCCESS`, etc.) and `EvidenceStatus` (`UNMATCHED`, `MATCHED`, `CONFLICTING`, `DUPLICATE`).

---

## 4. ARCHITECTURE & FOLDER CONVENTIONS

### Monorepo Structure:
```
rgs-ledger/
  apps/
    api/                  # Express.js Modular Monolith with Clean Architecture
    public-website/       # Public landing page & marketing site (React + Vite)
    merchant-dashboard/   # Merchant portal for payments, devices, and settings (React + Vite)
    hosted-checkout/      # Customer-facing checkout session page (React + Vite)
    admin-dashboard/      # System administrator dashboard (React + Vite)
    developer-portal/     # API docs, key management, webhook logs (React + Vite)
    mobile-companion/     # Android / iOS companion app (React Native + Expo)

  packages/
    shared-types/         # Domain enums, core entity interfaces, models
    api-contracts/        # REST DTO interfaces and API envelope types
    validation/           # Zod schemas for request validation & env vars
    ui/                   # Shared React UI components & fintech disclaimers
    upi-adapter/          # Decoupled NPCI UPI intent & QR generation adapter

  infrastructure/
    scheduler/            # Cloudflare Worker scheduled cron dispatcher
    docker/               # Production Dockerfiles
    deployment/           # Hosting manifests (Render, Cloudflare)
    scripts/              # Database scripts and maintenance utilities

  docs/                   # Full system technical architecture documentation
  .github/workflows/      # Continuous Integration workflows
```

### Backend Modular Monolith Conventions:
Located in `apps/api/src/modules/`:
- `auth`: Merchant registration, login, JWT session management.
- `merchants`: Merchant profile and UPI VPA configuration.
- `payments`: Payment request creation, lifecycle transitions, queries.
- `upi`: Internal UPI URI validation and generation.
- `checkout`: Public hosted checkout sessions.
- `integrations`: Third-party integration configurations (Gmail, Outlook).
- `email-evidence`: Ingestion and extraction of bank credit emails.
- `android-evidence`: Ingestion of push notifications from companion devices.
- `templates`: Bank SMS/notification regex patterns and field extractors.
- `evidence-matching`: Dual-source matching engine.
- `reconciliation`: Handling late, mismatched, or disputed transactions.
- `webhooks`: Merchant webhook event generation and durable retry delivery.
- `developer`: API keys, sandbox credentials, and access management.
- `admin`: System-level health monitoring and merchant oversight.
- `audit`: Immutable security audit logs.
- `background-jobs`: MongoDB-backed durable job runner with lease locking.

Each module adheres to Clean Architecture:
- `domain`: Pure business entities, value objects, domain errors.
- `application`: Use cases, services, workflow orchestrators.
- `infrastructure`: Mongoose models, external API clients, repositories.
- `presentation`: Thin controllers and Express router definitions.

---

## 5. MOBILE COMPANION ARCHITECTURE

- Built with React Native & Expo for Android and iOS.
- **Android**: Uses native Kotlin `NotificationListenerService` (declared with `BIND_NOTIFICATION_LISTENER_SERVICE` permission). Requires explicit user permission in Android Settings.
- **iOS Sandbox Limitation**: Apple iOS strictly forbids third-party apps from intercepting or reading notifications generated by other applications. **NEVER attempt to implement or promise a fake iOS notification listener.** The iOS companion app is restricted to merchant dashboard monitoring and device status reporting.
- **Offline Storage**: On Android, captured notifications are written to encrypted local storage (SQLite) immediately upon arrival and synchronized to the API with exponential backoff retries.
- **Pairing**: Devices pair securely with the merchant account using an 8-character rotating pairing code and device fingerprinting.

---

## 6. DATABASE & TRANSACTION RULES

- **MongoDB is the single source of truth.**
- All state-altering multi-document operations (e.g. matching evidence to a payment and writing audit/outbox entries) must execute inside a MongoDB transaction session.
- **Transactional Outbox Pattern**: Webhook events and notification tasks must be written to the `outbox_events` collection within the same transaction that updates payment state, ensuring zero lost events.
- **Durable Background Jobs**: Jobs use lease-based locking (`leasedUntil`, `leaseToken`) directly in MongoDB. If a server process dies unexpectedly, leases expire and another worker recovers the job.

---

## 7. SECURITY GUIDELINES

1. **No Secrets in Git**: Secrets, private keys, and API tokens must never be committed. All `.env` files are git-ignored.
2. **Startup Environment Validation**: The API validates all environment variables using Zod at boot and halts immediately if required variables are missing.
3. **Structured & Redacted Logging**: Log messages must be JSON-structured. The logger automatically redacts passwords, tokens, API secrets, and sensitive notification content.
4. **Tenant Isolation**: Every database query for payments, evidence, devices, or webhooks must be scoped by `merchantId`.
5. **Rate Limiting & Helmet**: Standard HTTP security headers and rate limiters protect all public endpoints.
6. **Graceful Shutdown**: The API traps `SIGINT` and `SIGTERM`, closes the HTTP server cleanly, finishes ongoing transactions, and closes database connections.

---

## 8. CODE & TESTING STANDARDS

- **TypeScript Strict Mode**: `strict: true`, no `any` wherever possible, strict null checks.
- **Testing**: Built with native Node.js test runner (`node:test` + `node:assert`) for lightweight, cross-platform unit and integration testing without heavy framework dependencies.
- **No Overengineering**: Build straightforward, maintainable code. Do not introduce premature abstractions, unnecessary microservices, or complex caching layers before needed.
