# RGS Ledger — Version 1 Implementation Roadmap

## Phase 0: Project Foundation and Architecture (CURRENT)
- [x] Monorepo npm workspaces initialization
- [x] Shared TypeScript base configuration and strict typings
- [x] Core packages (`shared-types`, `api-contracts`, `validation`, `ui`, `upi-adapter`)
- [x] Express Modular Monolith API with Clean Architecture layers and Mongoose schemas
- [x] Frontend entry points (`public-website`, `merchant-dashboard`, `hosted-checkout`, `admin-dashboard`, `developer-portal`)
- [x] Mobile companion workspace (`mobile-companion`) with native Android Kotlin and iOS architecture
- [x] Cloudflare Worker cron scheduler and Render deployment manifests
- [x] Complete technical and architectural documentation

---

## Phase 1: Core Payments & Dynamic UPI QR Engine
- [ ] Connect `packages/upi-adapter` to local QR image rendering
- [ ] Implement `PaymentRequest` creation use cases with order IDs, custom amounts, and expiry
- [ ] Implement Hosted Checkout page dynamic QR rendering and real-time status polling
- [ ] Merchant UPI configuration and VPA verification

---

## Phase 2: Evidence Ingestion & Dual-Source Matching Engine
- [ ] Gmail and Outlook OAuth2 integration for bank email notification ingestion
- [ ] Regex template extraction engine for extracting amounts, UTRs, and timestamps from bank emails
- [ ] Ingestion endpoint for Android push notifications
- [ ] State machine implementation enforcing the dual-source rule:
  - Both Email + Android -> `SUCCESS`
  - Only 1 source -> `PARTIAL_SUCCESS`
  - Conflicting details -> `REVIEW_REQUIRED`
  - Late arrival -> `RECONCILIATION_REQUIRED`

---

## Phase 3: Android Companion Application
- [ ] Implement native Kotlin `NotificationListenerService`
- [ ] SQLite offline evidence buffering and background sync
- [ ] Device pairing via rotating QR code and fingerprinting
- [ ] Companion heartbeat and connection health reporting

---

## Phase 4: Webhooks, Outbox Dispatcher & Developer Tools
- [ ] Transactional Outbox processor for atomic event emission
- [ ] Webhook delivery dispatcher with exponential backoff and HMAC-SHA256 signature verification
- [ ] Merchant Developer Portal API key generation and sandbox testing tools
- [ ] Reconciliation case review workflow for merchant administrators

---

## Phase 5: Production Hardening & Beta Launch
- [ ] End-to-end integration and load testing
- [ ] Cloudflare Pages and Render continuous deployment verification
- [ ] Beta merchant onboarding and dual-source verification validation
