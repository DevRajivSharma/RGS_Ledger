# REST API Specification (V1)

## 1. Conventions & Response Format

All API endpoints are accessible under both `/api/v1/` and `/v1/` prefixes (except the root `/health` and `/` endpoints).

### Standard Success Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-11-13T07:15:00.000Z",
    "requestId": "req_abc123"
  }
}
```

### Standard Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "ORDER_ALREADY_EXISTS",
    "message": "An active payment request for order ID \"ORD-101\" already exists",
    "details": null
  },
  "meta": {
    "timestamp": "2026-11-13T07:15:00.000Z"
  }
}
```

---

## 2. Phase 1 Core Endpoints

### System & Health
- `GET /health` — Operational status, MongoDB connection state, uptime.

### Merchant Authentication (`/v1/auth` & `/api/v1/auth`)
- `POST /register`
  - Body: `{ email, password, merchantName, upiVpa }`
  - Creates Merchant profile and Admin User. Hashes password using scrypt.
  - Returns `tokens` (`accessToken`, `refreshToken`, `expiresIn`) and `user` / `merchant` details.
- `POST /login`
  - Body: `{ email, password }`
  - Returns access & refresh tokens on successful authentication.
- `POST /refresh`
  - Body: `{ refreshToken }`
  - Performs single-use refresh token rotation and issues a new access token.
- `POST /logout`
  - Headers: `Authorization: Bearer <token>`
  - Revokes user's active refresh token in database.

### Merchant Profile & UPI Configuration (`/v1/merchant` & `/api/v1/merchant`)
- `GET /profile` — Retrieve merchant business name and contact email.
- `PATCH /profile` — Update merchant name.
- `GET /upi` — Retrieve configured UPI VPA, business name, and payment acceptance toggle.
- `PUT /upi` — Update merchant UPI VPA, business display name, and `isAcceptingPayments` status.

### Payment Request Engine (`/v1/payments` & `/api/v1/payments`)
- `POST /`
  - Headers: `Authorization: Bearer <token>`
  - Body: `{ orderId, amountPaise, description?, expiresInMinutes?, idempotencyKey? }`
  - Generates NPCI UPI URI with `mode=04` (fixed amount), base64 PNG QR code data URL, mobile intent links, and public checkout reference (`chk_...`).
  - Supports idempotency via `idempotencyKey`.
- `GET /`
  - Headers: `Authorization: Bearer <token>`
  - Lists payments strictly scoped to the authenticated merchant (`status`, `limit`, `skip` query filters).
- `GET /:id`
  - Headers: `Authorization: Bearer <token>`
  - Returns payment details and QR code. Auto-expires if expiry window has passed.
- `POST /:id/cancel`
  - Headers: `Authorization: Bearer <token>`
  - Transitions `PENDING` payment to `CANCELLED`. Rejects if already expired or cancelled.

### Evidence Templates Lifecycle (`/v1/templates` & `/api/v1/templates`)
- `GET /` — List merchant templates (`channel`, `status`, `bankAccountId`, `includeArchived` filters).
- `POST /` — Create draft template (defaults to `PENDING_APPROVAL`).
- `GET /:id` — Get template by ID.
- `PATCH /:id` — Update draft or metadata (editing approved rules creates version n+1 in `PENDING_APPROVAL`).
- `POST /:id/approve` — Authorize a template version with sample verification.
- `POST /:id/disable` — Stop template from future evidence extraction while preserving approval history.
- `POST /:id/reactivate` — Reactivate an approved disabled template (supports atomic conflict resolution via `switchConflicting: true`).
- `POST /:id/archive` — Soft-archive a decommissioned template.
- `POST /:id/restore` — Restore an archived template back to active/disabled status.
- `DELETE /:id` — Permanently delete a template only if zero evidence dependencies exist.
- `POST /:id/version` — Create a new version for an approved immutable template.
- `GET /:id/history` — Inspect version history and rule diffs.
- `POST /test-regex` — Safely test regex patterns and field extractors with sample notification payloads.

### Public Hosted Checkout (`/v1/checkout` & `/api/v1/checkout`)
- `GET /:reference`
  - Public customer endpoint for checkout session (`chk_...`).
  - Returns sanitized checkout session: `merchantName`, `orderId`, `amountRupees`, `qrDataUrl`, `intentLinks`, `status`, `expiresAt`, `isExpired`.
- `GET /link/:linkRef`
  - Public customer endpoint for payment link details (`plink_...`).
  - Returns `title`, `description`, `amountRupees` (or `isOpenAmount: true`), `merchantName`.
- `POST /link/:linkRef/initiate`
  - Customer submits optional custom amount and initiates a payment attempt, generating a live checkout session with QR and intent links.

---

## 3. Error Codes Reference

| HTTP Status | Error Code | Description |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request payload failed Zod schema checks. |
| 400 | `UPI_NOT_CONFIGURED` | Merchant has not yet configured a UPI VPA. |
| 400 | `INVALID_STATUS_FOR_CANCEL` | Payment is already cancelled or expired. |
| 401 | `UNAUTHORIZED` | Missing or malformed Bearer token. |
| 401 | `INVALID_CREDENTIALS` | Invalid email or password during login. |
| 401 | `INVALID_TOKEN` | Expired or tampered JWT access token. |
| 401 | `INVALID_REFRESH_TOKEN` | Revoked or unrecognized refresh token. |
| 403 | `PAYMENT_ACCEPTANCE_DISABLED` | Merchant disabled payment acceptance. |
| 403 | `MERCHANT_SUSPENDED` | Merchant account is suspended. |
| 404 | `NOT_FOUND` | Payment or checkout resource not found. |
| 409 | `EMAIL_ALREADY_EXISTS` | Registration email already registered. |
| 409 | `ORDER_ALREADY_EXISTS` | Active payment request for this orderId already exists. |
| 429 | `TOO_MANY_REQUESTS` | Rate limit window exceeded. |
