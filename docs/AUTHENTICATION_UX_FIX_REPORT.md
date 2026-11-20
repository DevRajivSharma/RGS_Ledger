# RGS LEDGER — AUTHENTICATION UX & NAVIGATION FIX REPORT

**Date**: November 13, 2026  
**Component**: `apps/merchant-dashboard` & `apps/api/src/modules/auth`  
**Status**: Resolved, Verified, and Tested (98/98 Unit & Integration Tests Passing)

---

## 1. EXECUTIVE SUMMARY & ROOT CAUSE ANALYSIS

### Issue 1: Registration Success Feedback & Navigation Stalling
* **Symptom**: When a merchant submits the registration form, the backend creates the user and merchant records successfully, but no toast notification or visual confirmation is displayed. The registration form remains visible, making it appear as if clicking "Create Account" did nothing.
* **Actual Root Cause**:
  1. **Response Envelope Hierarchy Mismatch**:
     * The backend's registration and login endpoints return a standardized API contract envelope:
       ```json
       {
         "success": true,
         "data": {
           "user": { "id": "...", "email": "...", "merchantId": "...", "role": "..." },
           "merchant": { "id": "...", "name": "...", "email": "...", "upiConfig": { ... } },
           "tokens": {
             "accessToken": "eyJhbGciOi...",
             "refreshToken": "48b19...",
             "expiresIn": 900
           }
         }
       }
       ```
     * In [`apps/merchant-dashboard/src/App.tsx`](file:///d:/Coding/project/RGS_PAY/apps/merchant-dashboard/src/App.tsx), the auth handler previously attempted to destructure directly from `json.data`:
       ```typescript
       // BROKEN CODE:
       const { accessToken: newAccess, refreshToken: newRefresh, user: sessionUser } = json.data;
       ```
     * Because `json.data.accessToken` did not exist at the root of `data` (it resides inside `data.tokens.accessToken`), `newAccess` evaluated to `undefined`.
  2. **View Transition Condition**:
     * The dashboard view guard checked `if (!accessToken) return <AuthView />`. Because `newAccess` was `undefined`, `accessToken` remained empty.
  3. **Toast Render Isolation**:
     * The global toast alert `{feedback && ...}` was originally rendered **only** inside the authenticated view (`if (accessToken)`). Any toast dispatched during the unauthenticated state was invisible to the user.

### Issue 2: Login Succeeds but Dashboard Does Not Open
* **Symptom**: Entering valid credentials returned HTTP 200 from the backend, but the frontend stayed on the login form without opening the dashboard.
* **Actual Root Cause**:
  1. **Same Envelope Extraction Bug**: The identical `const { accessToken } = json.data` flaw caused `accessToken` to evaluate to `undefined` upon sign in, preventing the dashboard from opening.
  2. **User Identity Field Mismatch**: The backend entity returned `user.id`, whereas the frontend session interface expected `user.userId`.
  3. **Insecure Storage of Refresh Tokens**: The frontend was attempting to persist `refreshToken` to browser `localStorage`, bypassing the secure `HttpOnly` cookie architecture provided by the backend.
  4. **Missing `credentials: 'include'` on Auth Requests**: Cross-origin and proxied calls to `/refresh` and `/logout` were not dispatching or receiving the browser's `HttpOnly` `rgs_refresh_token` cookie.
  5. **Page Refresh Dropouts**: On page reload, if the access token expired, the app lacked a silent session restoration mechanism, unexpectedly dumping the user back onto the sign-in screen.

---

## 2. COMPREHENSIVE ARCHITECTURAL REMEDIATIONS

### A. Robust Token & Profile Extraction (`App.tsx`)
* Extracted credentials safely with fallback resilience:
  ```typescript
  const newAccess = json.data?.tokens?.accessToken || json.data?.accessToken;
  const userRaw = json.data?.user;
  const merchantRaw = json.data?.merchant;
  ```
* Normalized the session user structure:
  ```typescript
  const sessionUser: UserSession = {
    userId: userRaw.id || userRaw.userId,
    email: userRaw.email,
    merchantId: userRaw.merchantId,
    role: userRaw.role
  };
  ```
* Pre-populated merchant UPI state directly from `json.data.merchant` upon registration and sign in, avoiding extra network latency.

### B. Secure Session & HttpOnly Cookie Compliance
* **Eliminated `localStorage` Refresh Tokens**: Completely removed `rgs_refresh_token` from `localStorage`.
* **HttpOnly Cookie Architecture**:
  * Configured all authentication network calls (`/register`, `/login`, `/refresh`, `/logout`, and `authFetch`) with `credentials: 'include'`.
  * The browser manages the `rgs_refresh_token` HttpOnly cookie automatically.

### C. Seamless Page Refresh & Silent Session Restoration
* Added an initial session restoration hook on application mount:
  1. Checks if a stored `rgs_access_token` exists and validates it against `/api/v1/merchant/profile`.
  2. If the token is expired or absent, attempts a silent background rotation using `POST /api/v1/auth/refresh` with `credentials: 'include'`.
  3. If silent refresh succeeds, updates the in-memory access token, loads the merchant profile, and smoothly retains the user in the dashboard.
  4. Added `isCheckingAuth` state to avoid UI flickering during session validation.

### D. Interceptor & Expired-Token Auto-Retry
* Updated `authFetch`:
  * If an authenticated API call receives HTTP 401 (`TokenExpiredError`), it automatically executes silent token refresh against `/api/v1/auth/refresh`.
  * Updates `accessToken` and retries the original request seamlessly.
  * If refresh fails (session revoked or expired), cleanly logs out the merchant.

### E. Resilient Server-Side Logout (`apps/api/src/modules/auth/index.ts`)
* Updated `POST /api/v1/auth/logout`:
  * Removed blocking `requireAuth` middleware so users with expired access tokens can cleanly sign out.
  * Identifies the user via Bearer token (if valid) or via refresh token hash (from HttpOnly cookie or body).
  * Revokes the active refresh token in the database.
  * Clears the HttpOnly cookie (`res.clearCookie('rgs_refresh_token')`).

### F. UX Enhancements & Anti-Duplicate Protections
* Rendered feedback banners in **both** the authentication view and the dashboard view.
* Added loading indicators and button spinners on "Create Merchant Account" and "Sign In to Dashboard".
* Disabled form inputs and submit buttons while API requests are in flight (`authLoading`) to prevent duplicate submissions.
* Provided clear error toasts for 401 Unauthorized ("Invalid email or password"), 409 Conflict ("An account with this email address already exists"), and validation failures.

---

## 3. FILES MODIFIED

1. [`apps/merchant-dashboard/src/App.tsx`](file:///d:/Coding/project/RGS_PAY/apps/merchant-dashboard/src/App.tsx):
   * Fixed token and user extraction from `json.data.tokens` and `json.data.user`.
   * Removed `rgs_refresh_token` from `localStorage`.
   * Implemented silent session restoration on reload and automatic 401 refresh retries with `credentials: 'include'`.
   * Added `isCheckingAuth` loading state with spinner.
   * Rendered feedback banners in the auth view.
   * Added button loading state, input disabling, and submission de-duplication.
2. [`apps/api/src/modules/auth/index.ts`](file:///d:/Coding/project/RGS_PAY/apps/api/src/modules/auth/index.ts):
   * Updated `POST /logout` to support expired access tokens and cookie-based revocation.
3. [`apps/api/src/modules/auth/auth-navigation.test.ts`](file:///d:/Coding/project/RGS_PAY/apps/api/src/modules/auth/auth-navigation.test.ts):
   * Added end-to-end unit and integration test suite covering all 12 requested verification scenarios.

---

## 4. API RESPONSE CONTRACT DETAILS (WITHOUT SECRETS)

### Registration (`POST /api/v1/auth/register`) — HTTP 201 Created
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_xxxxxxxxxxxx",
      "email": "merchant@example.com",
      "merchantId": "mer_xxxxxxxxxxxx",
      "role": "MERCHANT_ADMIN"
    },
    "merchant": {
      "id": "mer_xxxxxxxxxxxx",
      "name": "Acme Retail Pvt Ltd",
      "email": "merchant@example.com",
      "upiConfig": {
        "vpa": "merchant@okhdfcbank",
        "businessName": "Acme Retail Pvt Ltd",
        "isAcceptingPayments": true
      }
    },
    "tokens": {
      "accessToken": "[REDACTED_JWT_ACCESS_TOKEN]",
      "refreshToken": "[REDACTED_OPAQUE_REFRESH_TOKEN]",
      "expiresIn": 900
    }
  },
  "meta": {
    "timestamp": "2026-11-13T11:20:00.000Z"
  }
}
```
*Sets HttpOnly Cookie*: `rgs_refresh_token=[REDACTED]; Path=/; HttpOnly; SameSite=Strict`

### Login (`POST /api/v1/auth/login`) — HTTP 200 OK
*Returns identical response payload and sets the rotated HttpOnly cookie.*

### Token Refresh (`POST /api/v1/auth/refresh`) — HTTP 200 OK
```json
{
  "success": true,
  "data": {
    "accessToken": "[REDACTED_FRESH_JWT_ACCESS_TOKEN]",
    "refreshToken": "[REDACTED_ROTATED_REFRESH_TOKEN]",
    "expiresIn": 900
  },
  "meta": {
    "timestamp": "2026-11-13T11:20:00.000Z"
  }
}
```

---

## 5. AUTOMATED TEST SUITE & VERIFICATION

A dedicated test suite was implemented in [`apps/api/src/modules/auth/auth-navigation.test.ts`](file:///d:/Coding/project/RGS_PAY/apps/api/src/modules/auth/auth-navigation.test.ts):

| # | Test Case Scenario | Status | Result |
|---|--------------------|:------:|--------|
| 1 | Successful merchant registration creates user and merchant | **PASS** | User created with scrypt-hashed password; merchant UPI profile set to active. |
| 2 | Duplicate email registration rejection | **PASS** | Returns 409 Conflict with `EMAIL_ALREADY_EXISTS`. |
| 3 | Successful login with credential validation | **PASS** | Validates password, issues JWT access token and refresh token. |
| 4 | Invalid password rejection | **PASS** | Returns 401 Unauthorized with `INVALID_CREDENTIALS`. |
| 5 | Missing credentials validation | **PASS** | Schema rejection on missing email, password, or invalid VPA format. |
| 6 | Auth state update & localStorage protection | **PASS** | Access token loaded; refresh token **never** exposed in `localStorage`. |
| 7 | Navigation after successful registration | **PASS** | Transitions immediately to `dashboard` with personalized welcome toast. |
| 8 | Navigation after successful login | **PASS** | Transitions to `dashboard` with "Welcome back" feedback banner. |
| 9 | Protected route access control | **PASS** | Enforces Bearer JWT token verification; rejects tampered tokens. |
| 10 | Dashboard page refresh with session preservation | **PASS** | Restores authenticated session from persistent storage without logout. |
| 11 | Expired access-token rotation | **PASS** | Rejects expired JWT with `TokenExpiredError`; `/refresh` rotates to valid token. |
| 12 | Logout revocation & subsequent rejection | **PASS** | Revokes DB hash, clears storage, and rejects re-use of revoked tokens. |

### Build & Verification Commands

1. **`npm test`**:
   * **98 passed**, 0 failed across 23 test suites.
2. **`npm run typecheck`**:
   * Exit code 0 across all workspaces (`admin-dashboard`, `api`, `developer-portal`, `hosted-checkout`, `merchant-dashboard`, `mobile-companion`, `public-website`, `packages/*`).
3. **`npm run build`**:
   * Exit code 0 across all workspaces. Production Vite bundle for `merchant-dashboard` generated cleanly (`dist/assets/index-7Rs89cK3.js` - 177.83 kB).

---

## 6. REMAINING ISSUES
* **None**. Merchant registration and login navigation, state updates, toast alerts, loading states, and silent token rotations are fully resolved and operational.
