# RGS Ledger

> **Production-Oriented UPI QR Payment Evidence and Verification Platform**

RGS Ledger enables merchants to accept direct-to-bank UPI payments through dynamic NPCI QR codes and verifies payment receipt using an independent **dual-source evidence engine** (combining automated bank email parsing and Android push notification capture).

---

## Important Disclosures & Boundaries

RGS Ledger is **non-custodial**:
- Money travels **directly from the payer to the merchant's configured UPI ID**.
- RGS Ledger does not hold customer or merchant money, operate digital wallets, or manage settlement accounts.
- RGS Ledger does not process credit cards, debit cards, or netbanking.
- RGS Ledger does not connect to direct bank APIs or scrape online banking statements.
- `SUCCESS` indicates that the configured dual-source evidence policy rules were verified; it is **not** a direct bank-authoritative confirmation.

---

## Phase 1 Implementation Status

- [x] **Merchant Foundation**: Registration, login, logout, scrypt password hashing, JWT access tokens, refresh token rotation.
- [x] **UPI QR Engine**: NPCI UPI 1.6 adapter (`packages/upi-adapter`), amount-locking (`mode=04`), base64 PNG QR generation, intent links (PhonePe, GPay, Paytm, BHIM).
- [x] **Payment Lifecycle**: Payment request creation, cancellation, idempotency protection (`idempotencyKey`), auto-expiry countdowns.
- [x] **Hosted Checkout (`apps/hosted-checkout`)**: Public customer checkout session (`/checkout/:reference` or `?ref=...`) with live QR rendering, intent deep links, countdown timer, and polling.
- [x] **Merchant Dashboard (`apps/merchant-dashboard`)**: Authenticated portal to update UPI VPA, toggle payment acceptance, create payments, and manage payment lifecycle.
- [x] **Strict Tenant Isolation**: `merchantId` derived strictly from verified JWT tokens, preventing cross-tenant data access.
- [x] **Automated Test Suite**: 41 native Node.js tests covering auth, token rotation, tenant isolation, UPI generation, and payment lifecycle.

---

## Monorepo Architecture

This repository is organized as an npm workspaces monorepo:

```
rgs-ledger/
  apps/
    api/                  # Modular Monolith Express API backend
    public-website/       # Marketing and informational portal
    merchant-dashboard/   # Merchant operations and payment tracking
    hosted-checkout/      # Customer-facing dynamic QR checkout page
    admin-dashboard/      # System administrator management dashboard
    developer-portal/     # API references, SDK documentation, webhooks
    mobile-companion/     # React Native & Expo Android companion app

  packages/
    shared-types/         # Domain models, enums, entity definitions
    api-contracts/        # REST DTO interfaces and API envelope types
    validation/           # Zod schemas for request validation & env vars
    ui/                   # Shared React UI components & fintech disclaimers
    upi-adapter/          # Decoupled NPCI UPI intent & QR generation adapter

  infrastructure/
    scheduler/            # Cloudflare Worker scheduled cron dispatcher
    docker/               # Production multi-stage Dockerfiles
    deployment/           # Deployment configurations (Render, Cloudflare)
    scripts/              # Verification and utility scripts

  docs/                   # Comprehensive system architectural documentation
```

---

## Getting Started

### Prerequisites
- Node.js 22+
- npm 10+
- MongoDB instance (local or MongoDB Atlas connection string)

### Setup & Installation
```bash
# 1. Install all monorepo dependencies
npm ci

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your MONGODB_URI and JWT secrets

# 3. Run typecheck across all workspaces
npm run typecheck

# 4. Run automated test suite
npm test

# 5. Build all packages and applications
npm run build
```

### Running Applications Locally

```bash
# Start backend API (Port 4000)
npm --workspace=@rgs-ledger/api run dev

# Start Merchant Dashboard (Port 3001)
npm --workspace=@rgs-ledger/merchant-dashboard run dev

# Start Hosted Checkout (Port 3002)
npm --workspace=@rgs-ledger/hosted-checkout run dev
```

---

## Security & Verification Standards

- **Tenant Isolation**: Mandatory `merchantId` scoping on all queries.
- **Password Hashing**: Node native `scryptSync` with cryptographic salt and `timingSafeEqual`.
- **JWT & Tokens**: Short-lived access tokens (15m) + single-use refresh token rotation with SHA-256 hash storage.
- **Amount Safety**: Financial values strictly persisted as positive integer **paise** to eliminate floating-point precision hazards.
