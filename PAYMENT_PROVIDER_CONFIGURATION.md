# RGS LEDGER — PAYMENT PROVIDER CONFIGURATION SPECIFICATION

**Document ID:** `RGS-CONFIG-PROVIDER-2026-11`  
**Platform:** RGS Ledger — Enterprise Fintech Platform  
**Target Audience:** Merchants, DevOps, Security Engineers  

---

## 1. Multi-Merchant Account Architecture

RGS Ledger is architected to prevent commingling of merchant funds. It supports two approved operational models:

### Model A: Merchant-Connected Direct Provider Accounts (Primary Model)
- Each merchant completes independent onboarding with PhonePe Business, Paytm Business, or bank acquiring rails.
- Merchant credentials (MID, Salt Key, Merchant Key) are encrypted and stored per merchant in `MerchantProviderAccount`.
- When an order is created, RGS Ledger dynamically routes the payment attempt using that specific merchant's provider credentials.
- Settlements flow directly from the bank/PSP into the merchant's verified bank account without touching platform balances.

### Model B: Approved Platform Sub-Merchant Arrangement
- Operates only when RGS Ledger possesses a formalized sub-merchant acquiring agreement with a licensed Payment Aggregator or Acquiring Bank.
- RGS merchants are onboarded via partner sub-merchant APIs and mapped via `subMerchantId`.
- Payments are tagged with the sub-merchant identifier for escrow settlement.

> [!CAUTION]
> If neither Model A nor an approved Model B arrangement is in place for a merchant, live payment collection is disabled. RGS Ledger strictly forbids routing unrelated merchant transactions through a single platform-owned MID.

---

## 2. Encrypted Credential Storage & Security Isolation

### 2.1 AES-256-GCM Authenticated Encryption
All sensitive provider secrets (Salt Keys, Merchant Keys, API Secrets) are encrypted at rest using AES-256-GCM before persistence:

```
Ciphertext Format: [12-byte IV (hex)] : [16-byte Auth Tag (hex)] : [Ciphertext (hex)]
```

- **Master Key:** Derived from `ENCRYPTION_KEY` (32 bytes).
- **Authentication Tag:** Guarantees cryptographic integrity; any tampering with ciphertext causes immediate decryption failure.
- **Access Isolation:** Decryption occurs exclusively in-memory inside `MerchantProviderService.resolveProviderForPayment()` during authorized backend operations.

### 2.2 Strict Credential Masking
API endpoints, merchant dashboard responses, and application logs **never** return decrypted secrets. Masking rules:
- Public identifiers (`merchantId`, `saltIndex`, `website`) remain readable.
- Cryptographic keys (`saltKey`, `merchantKey`, `apiKey`) are masked:
  - Example: `099eb0cd-02cf-4e2a-8aca-3e6c6aff0399` -> `099e********0399`

---

## 3. Provider Configuration REST APIs

Merchants configure their provider credentials via authenticated REST endpoints:

### 3.1 Get Configured Providers
```http
GET /api/v1/merchant/providers
Authorization: Bearer <jwt_access_token>
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "mprov_a1b2c3d4e5f6",
      "merchantId": "mer_12345",
      "providerType": "PHONEPE",
      "accountModel": "MERCHANT_DIRECT",
      "environment": "SANDBOX",
      "status": "SANDBOX_CONNECTED",
      "isEnabled": true,
      "credentialsMasked": {
        "merchantId": "PGTESTPAYUAT",
        "saltKey": "099e********0399",
        "saltIndex": "1"
      },
      "lastRotatedAt": "2026-11-06T12:00:00.000Z"
    }
  ]
}
```

### 3.2 Save / Update Provider Account
```http
POST /api/v1/merchant/providers
Authorization: Bearer <jwt_access_token>
Content-Type: application/json

{
  "providerType": "PHONEPE",
  "accountModel": "MERCHANT_DIRECT",
  "environment": "SANDBOX",
  "isEnabled": true,
  "credentials": {
    "merchantId": "PGTESTPAYUAT",
    "saltKey": "099eb0cd-02cf-4e2a-8aca-3e6c6aff0399",
    "saltIndex": "1"
  }
}
```

### 3.3 Configure Raw UPI QR Payee
```http
POST /api/v1/merchant/providers
Authorization: Bearer <jwt_access_token>
Content-Type: application/json

{
  "providerType": "UPI_QR_MANUAL",
  "environment": "SANDBOX",
  "isEnabled": true,
  "vpaConfig": {
    "vpa": "mybusiness@icici",
    "displayName": "My Business Enterprise",
    "mcc": "5411"
  }
}
```

### 3.4 Delete / Revoke Provider Account
```http
DELETE /api/v1/merchant/providers/PHONEPE?environment=SANDBOX
Authorization: Bearer <jwt_access_token>
```

---

## 4. Provider Capability Matrix

| Provider Type | Adapter Class | UPI QR | UPI Intent | Hosted Pay Page | Cards | Netbanking | Webhooks | Status API | Auto Refund |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `SANDBOX` | `SandboxPaymentProvider` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `UPI_QR_MANUAL` | `UpiQrManualPaymentProvider`| ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `PHONEPE` | `UPIPayPhonePeProvider` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `PAYTM` | `UPIPayPaytmProvider` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `CARD_GATEWAY` | `CardPaymentProvider` | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| `NETBANKING_GATEWAY`| `NetbankingPaymentProvider`| ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |

---

## 5. Audit Trail & Credential Rotation

Every configuration mutation automatically generates an immutable audit record in `AuditLog`:
- **Actor:** Merchant Owner or Super Admin (`actorId`, `actorEmail`, `actorRole`).
- **Action:** `PROVIDER_ACCOUNT_UPDATED`.
- **Target Entity:** `MerchantProviderAccount`.
- **Changes Captured:** Provider type, enablement state, status change, and timestamp.
- **Rotation:** Updating credentials updates `lastRotatedAt` and immediately flushes any cached provider instances.
