# RGS Ledger — Phase 0.5 Engineering Foundation Audit Report

**Date of Audit**: November 13, 2026  
**Auditor**: Lead Software Architect & Principal Systems Engineer  
**Scope**: Codebase, Tooling, Dependencies, Build Pipelines, Security & Deployment Topology  
**Current Branch**: `master` (Workspace folder: `D:\Coding\project\RGS_PAY`, Remote: `https://github.com/DevRajivSharma/RGS_Ledger.git`)  

---

## Executive Summary

Phase 0 established a coherent npm-workspaces monorepo architecture with clean module boundaries for RGS Ledger. This Phase 0.5 audit evaluated the actual behavior of all toolchains, packages, dependencies, deployment manifests, database models, and UPI integration mechanisms. 

The audit identified key areas where build and deployment configurations would fail under real production pipelines (such as Docker and Render start path mismatches, and TypeScript emit directory structure), as well as confirmed functional areas (test runners, input validation, frontend bundles, and security redaction).

**Overall Project Status**: **FOUNDATION VERIFIED WITH ACTIONABLE CORRECTIONS — NOT YET PRODUCTION READY.**

---

## 1. Git and Repository Verification

| Property | Value | Verification Status |
|---|---|---|
| **Working Directory** | `D:\Coding\project\RGS_PAY` | Verified |
| **Git Remote Origin** | `https://github.com/DevRajivSharma/RGS_Ledger.git` | Verified |
| **Active Branch** | `master` (`remotes/origin/master`) | Verified |
| **Commit History** | `35e1e82` (Redesign Reset), `7925302` (Legacy Docs), `b5c93e6` (Legacy Feat) | Preserved |
| **Branch Safety** | No branches deleted, no force-pushes executed, no commits modified | Enforced |

**Confirmation**: Despite the local directory being named `RGS_PAY`, `git remote -v` conclusively proves it tracks the authoritative `DevRajivSharma/RGS_Ledger` repository on GitHub.

---

## 2. Dependency & Build Audit Results

All commands were executed in the project root:

| Command | Exit Code | Real Duration | Actual Result / Status |
|---|---|---|---|
| `npm ci` | `0` | 13s | Cleanly installed 990 packages across all workspaces from `package-lock.json` |
| `npm test` | `0` | 1.4s | 11 unit tests executed across 7 suites (`app`, `validation`, `upi-adapter`); 0 failures |
| `npm run typecheck` | `0` | 2.5s | Verified all 12 workspaces with `npm run typecheck --workspaces --if-present` |
| `npm run build` | `0` | 3.2s | Successfully compiled `api` (tsc) and all 5 frontends (`vite build`) |

---

## 3. UPIPay Integration Findings

### Selected Library
- **Package**: `upipay` (v1.0.0, MIT License)
- **Repository**: [https://github.com/iamrobinsharaya/upipay](https://github.com/iamrobinsharaya/upipay)
- **Maintainer**: Robin Sharaya
- **Runtime Dependency**: `qrcode` (`^1.5.4`)

### Supported Local UPI QR Functionality
`upipay` exports independent submodules:
1. `generateUPIQR(request)`:
   - Takes `{ vpa, name, amount, orderId, note?, mode?: 'fixed' | 'open', mc?: string }`.
   - Returns a Promise resolving to `{ qrImage: string, upiUri: string, orderId: string }`.
   - `mode: 'fixed'` sets `mode=04` in the NPCI URI, locking the payment amount on the payer's screen.
   - `qrImage` provides a Base64 data URI (`data:image/png;base64,...`) suitable for direct HTML `<img src={...} />` rendering.
2. `generateUPIQRSvg(request)`: Returns an inline SVG string for responsive rendering.
3. `buildUPIUri(request)`: Formats standard NPCI URI: `upi://pay?pa=...&pn=...&am=...&cu=INR&tr=...&mode=04`.
4. `buildIntentLinks(upiUri)`: Generates app-specific intent URIs:
   - PhonePe: `phonepe://pay?...`
   - Google Pay: `tez://upi/pay?...`
   - Paytm: `paytmmp://pay?...`
   - BHIM: `upi://pay?...`

### Prohibited Features in `upipay` (Strictly Avoided)
`upipay` also bundles automated PSP broker adapters (`UPIPay`, `PhonePeAdapter`, `PaytmAdapter`) featuring:
- `client.createPayment()`
- `client.checkStatus()`
- `client.verifyWebhook()`
- `client.createRefund()`

> **Audit Finding**: Under RGS Ledger's non-custodial dual-source policy, merchants do not register for PhonePe/Paytm Business merchant API keys. Payments go to raw merchant UPI VPAs. **RGS Ledger must only import from `upipay/qr` (`generateUPIQR`, `buildIntentLinks`) and never instantiate the PSP client classes.**

### Comparison Table: Current Manual Adapter vs UPIPay QR

| Feature | Current Manual Adapter (`packages/upi-adapter`) | Supported UPIPay (`upipay/qr`) | Recommended Action for Phase 1 |
|---|---|---|---|
| **VPA Format Validation** | Built-in regex test | Built-in regex test | Retain current validation in `packages/validation` |
| **NPCI URI Generation** | `NpciUpiAdapter.generateUpiUri()` | `buildUPIUri()` | Delegate to `buildUPIUri` or retain zero-dependency internal generation |
| **QR Code Image Generation** | Stubbed (`qrDataUrl: undefined`) | Supported (`generateUPIQR` returning Base64 PNG & SVG) | **Delegate to `upipay/qr` for local QR rendering** |
| **Intent Deep Links** | Manually constructed | `buildIntentLinks()` returning PhonePe, GPay, Paytm, BHIM deep links | Adopt `buildIntentLinks()` |
| **External API Calls** | Zero (fully offline) | Zero (for `/qr` submodule only) | Keep adapter strictly decoupled |

---

## 4. Classified Audit Findings

### [CRITICAL] 1. TypeScript Emit Directory Structure vs Production Start Commands
- **Classification**: **CRITICAL**
- **Location**: `apps/api/tsconfig.json`, `infrastructure/docker/Dockerfile.api`, `infrastructure/deployment/render.yaml`
- **Issue**: When `apps/api` compiles via `tsc`, it imports shared source files from `../../packages/*`. TypeScript preserves the common directory root (`rgs-ledger/`), resulting in compiled files placed at `apps/api/dist/apps/api/src/server.js` rather than `apps/api/dist/server.js`.
- **Impact**: Any production runner (Render or Docker) executing `node apps/api/dist/server.js` will immediately crash with `MODULE_NOT_FOUND`.
- **Resolution**: Either bundle `apps/api` using `tsup` into a self-contained `apps/api/dist/server.js`, or update `Dockerfile.api` and `render.yaml` to point to the actual path `apps/api/dist/apps/api/src/server.js`.

### [HIGH] 2. Mobile Companion Native Build Scaffold vs Expo Native Projects
- **Classification**: **HIGH**
- **Location**: `apps/mobile-companion/`
- **Issue**: The workspace contains an Expo configuration and placeholder Kotlin files (`android/app/src/main/kotlin/.../NotificationListener.kt`), but lacks root Android Gradle scripts (`settings.gradle`, `build.gradle`, `gradle-wrapper.jar`). Running native builds or `./gradlew assembleRelease` cannot work directly in this state.
- **Impact**: The mobile companion is currently an architectural specification and TypeScript placeholder, not a buildable native APK.
- **Resolution**: In Phase 3, implement an Expo Config Plugin to dynamically configure the Android `NotificationListenerService` during `npx expo prebuild`, or eject to a full Bare React Native workspace.

### [HIGH] 3. Tenant Isolation in Repository Implementations
- **Classification**: **HIGH**
- **Location**: `apps/api/src/modules/*/`
- **Issue**: While the database schemas and indexes enforce `{ merchantId: 1 }`, the repository placeholder classes currently define basic signatures (e.g. `findById(id: string)` without requiring `merchantId`).
- **Impact**: Risk of cross-tenant data leaks if developers query by entity ID alone without tenant scoping.
- **Resolution**: All repository query methods must strictly require `merchantId: string` as an explicit first parameter: `findById(merchantId: string, id: string)`.

### [MEDIUM] 4. In-Memory Rate Limiting Resilience
- **Classification**: **MEDIUM**
- **Location**: `apps/api/src/middleware/rate-limiter.ts`
- **Issue**: Rate limiting is stored in an in-memory `Map`.
- **Impact**: Rate limits reset upon server restarts and do not share state across horizontally scaled instances on Render.
- **Resolution**: Suitable for Phase 0 and zero-budget single-instance beta; roadmap must specify Redis adapter transition when multiple instances are deployed.

### [MEDIUM] 5. Missing CI Build Step for Production Bundles
- **Classification**: **MEDIUM**
- **Location**: `.github/workflows/ci.yml`
- **Issue**: CI workflow executes `npm ci`, `npm run typecheck`, and `npm test`, but does not run `npm run build`.
- **Impact**: Packaging, minification, or Vite bundler syntax errors might pass CI undetected.
- **Resolution**: Add `- run: npm run build` to `.github/workflows/ci.yml`.

### [LOW] 6. Discarded Deprecated Transitive Dependencies
- **Classification**: **LOW**
- **Location**: `package-lock.json`
- **Issue**: `npm ci` flagged deprecated transitive sub-dependencies (`glob@7.2.3`, `uuid@3.4.0`) inherited from Expo CLI and Babel packages.
- **Impact**: Minor developer warning; no impact on runtime API execution.

---

## 5. Security Architecture Audit

1. **Secret Leakage Prevention**:
   - `.env` is absent from Git and strictly guarded by `.gitignore`.
   - `.env.example` contains clear placeholders without sensitive values.
2. **Runtime Redaction**:
   - `apps/api/src/utils/logger.ts` intercepts and masks sensitive keys (`password`, `token`, `secret`, `authorization`, `jwt`, `encryption_key`, `pairingcode`). Verified in unit tests.
3. **HTTP Hardening**:
   - `helmet` applies essential security headers (HSTS, Content Security Policy, frameguard).
   - Ingress request payload sizes are hard-capped at 1MB to mitigate memory exhaustion denial-of-service.

---

## 6. Payment Domain Verification

The audit verified strict architectural separation across the payment domain:
- **`PaymentRequest`**: Tracks the merchant intent, requested amount (in integer paise), expiry, and evidence summary.
- **`PaymentEvidence`**: Stores ingested push/email metadata and raw payload hashes independently of payment requests.
- **Dual-Source Invariant**: In `AGENTS.md` and `docs/PAYMENT_LIFECYCLE.md`, single-source evidence is strictly mapped to `PARTIAL_SUCCESS`. `SUCCESS` mandates matching both Email and Android Companion channels.
- **Deduplication**: `payment_evidence.rawPayloadHash` has a unique database index preventing replay attacks.
- **Reconciliation Isolation**: Late transactions and conflicting amounts transition to `RECONCILIATION_REQUIRED` / `REVIEW_REQUIRED`, completely isolating them from normal settlement workflows.

---

## 7. Recommended Corrections

Before concluding Phase 1:
1. **Fix Start Path for API**:
   Update `apps/api/package.json`, `render.yaml`, and `Dockerfile.api` to reference `apps/api/dist/apps/api/src/server.js` (or add `tsup` bundling to emit a single flat `dist/server.js`).
2. **Add Build Step to GitHub Actions**:
   Update `.github/workflows/ci.yml` to execute `npm run build`.
3. **Strict Tenancy Enforcement**:
   Update all repository method signatures to enforce `merchantId` as a mandatory parameter.

---

## 8. Readiness Assessment for Phase 1

| Component | Status | Readiness Level |
|---|---|---|
| Monorepo & Workspaces | Stable | 100% |
| API Modular Monolith | Verified | 95% (Requires start path correction) |
| Database Models & Schemas | Verified | 100% |
| Frontend Shells | Verified | 100% |
| UPIPay Integration Strategy | Audited | 100% (Submodule boundaries documented) |
| Mobile Architecture | Scaffolded | Ready for Phase 3 native implementation |

**Conclusion**: The repository foundation is sound, verified, and free of architectural drift. The team is ready to proceed to **Phase 1: Core Payments & Dynamic UPI QR Engine** upon approval of this report.
