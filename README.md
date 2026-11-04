# RGS Ledger — Enterprise Fintech Payment Gateway Platform

> *"Payments Simplified. Transactions Secured."*

RGS Ledger is an enterprise-grade fintech SaaS payment gateway platform inspired by Stripe, Razorpay, and Cashfree. It provides multi-tenant merchant onboarding, high-velocity payment processing, dynamic UPI QR and Intent links, an immutable double-entry accounting ledger, hosted checkout, webhook dispatch with SSRF protection, developer SDKs, WooCommerce & Shopify ecommerce integrations, and a dedicated super-admin console.

---

## Architecture & Monorepo Overview

```
rgs-ledger/
├── apps/
│   ├── api/                 # Express, TypeScript, Mongoose, Redis/BullMQ, REST API platform
│   ├── dashboard/           # Merchant Dashboard (React 18, Vite, Tailwind, Recharts)
│   ├── checkout/            # Hosted Checkout (Mobile-first, UPI QR, Cards, Netbanking)
│   ├── developer-portal/    # Interactive Developer Portal & API Reference
│   └── admin/               # Super Admin Platform Management Console
├── packages/
│   ├── shared/              # Shared enums, types, Zod schemas, minor unit (paise) math, HMAC crypto
│   ├── payment-core/        # Provider interface, state machines, sandbox engine, double-entry ledger
│   ├── sdk-node/            # Official Node.js SDK
│   └── sdk-react/           # React Checkout Modal SDK
├── integrations/
│   ├── woocommerce/         # Installable WordPress/WooCommerce Gateway Plugin
│   └── shopify/             # Shopify Payments App GraphQL Adapter
├── docs/                    # Architecture, Database Schema, Security, Compliance, Setup
├── docker-compose.yml       # Production-ready container orchestration
└── package.json             # Root npm workspace configuration
```

---

## Quickstart & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Build All Packages & Apps
```bash
npm run build
```

### 3. Run Automated Tests
```bash
npm test
```

### 4. Seed Database
Seeds Super Admin (`admin@rgsledger.com`), Demo Merchant (`merchant@acmestore.in`), test API keys, and ledger transactions:
```bash
npm run seed
```

### 5. Launch Development Services
- **REST API**: `npm run dev:api` -> `http://localhost:4000`
- **Merchant Dashboard**: `npm run dev:dashboard` -> `http://localhost:5173`
- **Hosted Checkout**: `npm run dev:checkout` -> `http://localhost:5174`
- **Developer Portal**: `npm run dev:docs` -> `http://localhost:5175`
- **Super Admin Console**: `npm run dev:admin` -> `http://localhost:5176`

---

## Key Credentials (Pre-Seeded)

| Portal | URL | Identity | Credentials |
|---|---|---|---|
| Super Admin Console | `http://localhost:5176` | Platform Admin | `admin@rgsledger.com` / `Admin@RGS1234!` |
| Merchant Dashboard | `http://localhost:5173` | Acme Store Owner | `merchant@acmestore.in` / `Merchant@RGS1234!` |
| Hosted Checkout | `http://localhost:5174/pay/:id` | End Customer | Test VPA `success@rgs`, Test Card `4111 1111 1111 1111` |

---

## Technical Highlights

1. **Integer Minor Unit Precision**: All INR calculations strictly execute in integer paise (₹1.00 = 100 paise) to eliminate floating-point drift.
2. **Double-Entry Financial Ledger**: Mathematically guarantees that `Total Debits === Total Credits` for every payment capture, refund, platform fee, and bank payout.
3. **Idempotency & Replay Protection**: Automatic 24-hour request payload caching using `Idempotency-Key`.
4. **Webhook Security**: Timestamped HMAC-SHA256 signatures with constant-time verification and SSRF filtering against private network targets.
5. **Provider-Independent Adapter Architecture**: Ready to switch between Sandbox simulation and authorized licensed Payment Aggregator partners.

---

## License
MIT License. Built for enterprise fintech payment infrastructure.
