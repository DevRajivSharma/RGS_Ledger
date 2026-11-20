# Database Architecture & Schema Specification

## 1. Overview & Storage Strategy

- **Database Engine**: MongoDB Atlas (compatible with M0 free tier up to enterprise multi-region clusters).
- **Driver**: Mongoose 8.x with TypeScript definitions.
- **Transactions**: Multi-document ACID transactions via replica set sessions for state changes, outbox writes, and evidence pairing.
- **Tenant Isolation**: Every merchant-owned document contains an immutable `merchantId` index.

---

## 2. Phase 1 Implemented Collections & Schemas

### `users`
Merchant operators and administrators with hashed credentials.
```typescript
{
  email: string;            // unique, lowercase, trimmed
  passwordHash: string;     // scrypt with cryptographic salt
  merchantId: ObjectId;     // Ref: merchants (indexed)
  role: 'SUPER_ADMIN' | 'MERCHANT_ADMIN' | 'MERCHANT_OPERATOR' | 'MERCHANT_VIEWER';
  status: 'ACTIVE' | 'SUSPENDED';
  refreshTokenHash?: string;// SHA-256 hash of active single-use refresh token (indexed)
  createdAt: Date;
  updatedAt: Date;
}
```
**Indexes**:
- `{ email: 1 }` (unique)
- `{ merchantId: 1 }`
- `{ refreshTokenHash: 1 }` (sparse)

### `merchants`
Merchant profiles and their configured payment acceptance VPA.
```typescript
{
  name: string;
  email: string;            // unique
  upiConfig: {
    vpa: string;            // validated name@handle format
    businessName: string;
    mcc?: string;           // 4-digit Merchant Category Code
    isAcceptingPayments: boolean; // default: true
  };
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
  updatedAt: Date;
}
```
**Indexes**:
- `{ email: 1 }` (unique)
- `{ "upiConfig.vpa": 1 }`

### `payment_requests`
Core payment intent records with generated NPCI UPI QR code, mobile links, and public reference.
```typescript
{
  merchantId: ObjectId;         // Ref: merchants (mandatory tenant scope)
  orderId: string;              // Merchant reference ID (e.g. "ORD-98214")
  amountPaise: number;          // Strictly integer paise (e.g. 49900 = ₹499.00)
  currency: 'INR';
  description?: string;
  merchantVpa: string;          // Snapshot of merchant UPI at time of creation
  merchantName: string;
  upiUri: string;               // NPCI UPI URI with mode=04
  qrDataUrl: string;            // Data URL base64 PNG QR code
  checkoutReference: string;    // Public unguessable checkout token ("chk_...")
  idempotencyKey?: string;      // Client-supplied idempotency key
  status: PaymentStatus;        // PENDING, CANCELLED, EXPIRED, PARTIAL_SUCCESS, SUCCESS, ...
  evidenceSummary: {
    hasEmailEvidence: boolean;
    hasAndroidEvidence: boolean;
  };
  expiresAt: Date;              // Payment expiration timestamp (default: +15 mins)
  createdAt: Date;
  updatedAt: Date;
}
```
**Indexes**:
- `{ merchantId: 1, orderId: 1 }`
- `{ checkoutReference: 1 }` (unique)
- `{ merchantId: 1, idempotencyKey: 1 }` (unique, sparse)
- `{ status: 1 }`
- `{ expiresAt: 1 }`

---

## 3. Planned Collections (Phase 2 & Beyond)

| Collection Name | Purpose | Key Indexes |
|---|---|---|
| `merchant_integrations` | External provider bindings (Gmail, Outlook) | `{ merchantId: 1, type: 1 }` |
| `payment_evidence` | Ingested email and Android push credit evidence | `{ rawPayloadHash: 1 }` (unique), `{ utr: 1 }`, `{ merchantId: 1, amountPaise: 1 }` |
| `message_templates` | Regex patterns and extractors for bank SMS/emails | `{ senderIdentifier: 1 }`, `{ bankName: 1 }` |
| `android_devices` | Registered companion mobile devices | `{ deviceFingerprint: 1 }` (unique), `{ merchantId: 1 }` |
| `api_credentials` | Merchant API keys and client secrets | `{ keyHash: 1 }` (unique), `{ merchantId: 1 }` |
| `webhook_endpoints` | Merchant webhook callback URLs and signing secrets | `{ merchantId: 1, isActive: 1 }` |
| `webhook_events` | Emitted domain events pending dispatch | `{ merchantId: 1, status: 1 }` |
| `webhook_deliveries` | Delivery attempts, status codes, and backoff retries | `{ endpointId: 1, eventId: 1 }` |
| `reconciliation_cases` | Manual dispute and late-evidence review items | `{ merchantId: 1, status: 1 }` |
| `background_jobs` | Durable leased tasks with retry counts | `{ status: 1, runAt: 1, leasedUntil: 1 }` |
| `outbox_events` | Transactional outbox records for event publishing | `{ status: 1, aggregateType: 1 }` |
| `audit_logs` | Immutable audit trail of administrative and API actions | `{ merchantId: 1, createdAt: -1 }` |
