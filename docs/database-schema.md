# Database Schema Specification

RGS Ledger uses MongoDB with Mongoose ODM. All financial amounts are stored as integer minor units (paise).

## Collections & Entity Models

### 1. `users`
Identity and credentials management.
- `_id`: ObjectId
- `email`: String (unique, indexed, lowercase)
- `passwordHash`: String (bcrypt, cost factor 12)
- `fullName`: String
- `phone`: String
- `role`: Enum (`SUPER_ADMIN`, `ADMIN`, `MERCHANT_OWNER`, `MERCHANT_ADMIN`, `DEVELOPER`, `FINANCE`, `SUPPORT`)
- `merchantId`: String (indexed)
- `isEmailVerified`: Boolean
- `isActive`: Boolean
- `lastLoginAt`: Date

### 2. `merchants`
Merchant tenant accounts.
- `_id`: String (e.g. `mer_...`)
- `businessName`: String
- `businessType`: Enum (`PROPRIETORSHIP`, `PRIVATE_LIMITED`, `LLP`, `PUBLIC_LIMITED`, `INDIVIDUAL`)
- `country`: String (default `IN`)
- `website`: String
- `kycStatus`: Enum (`NOT_STARTED`, `PENDING`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `ADDITIONAL_INFORMATION_REQUIRED`)
- `environmentMode`: Enum (`SANDBOX`, `LIVE`)
- `panNumber`: String (indexed)
- `gstin`: String
- `bankAccount`: Object `{ accountNumber, ifscCode, accountHolderName, bankName }`
- `address`: Object `{ line1, line2, city, state, pincode, country }`

### 3. `orders`
Authoritative payment intents.
- `_id`: String (`ord_...`)
- `merchantId`: String (indexed)
- `amount`: Number (Integer paise, min 100)
- `currency`: String (`INR`)
- `status`: Enum (`CREATED`, `ATTEMPTED`, `PROCESSING`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `CANCELLED`, `EXPIRED`, `PARTIALLY_REFUNDED`, `REFUNDED`)
- `receipt`: String (merchant reference)
- `customer`: Object `{ id, name, email, phone }`
- `attemptsCount`: Number
- `amountPaid`: Number
- `amountRefunded`: Number
- `environment`: Enum (`SANDBOX`, `LIVE`)

### 4. `payments`
Individual payment transactions.
- `_id`: String (`pay_...`)
- `orderId`: String (indexed)
- `merchantId`: String (indexed)
- `amount`: Number (Integer paise)
- `currency`: String (`INR`)
- `status`: Enum (`CREATED`, `PENDING`, `PROCESSING`, `SUCCESS`, `FAILED`, `CANCELLED`, `EXPIRED`)
- `method`: Enum (`UPI_INTENT`, `UPI_QR`, `CARD`, `NETBANKING`, `WALLET`)
- `upiId`: String
- `cardNetwork`: String
- `cardLast4`: String
- `bankCode`: String
- `providerPaymentId`: String (indexed)
- `capturedAt`: Date

### 5. `refunds`
Reversals and customer payouts.
- `_id`: String (`ref_...`)
- `paymentId`: String (indexed)
- `orderId`: String (indexed)
- `merchantId`: String (indexed)
- `amount`: Number (Integer paise)
- `status`: Enum (`CREATED`, `PENDING`, `PROCESSED`, `FAILED`, `CANCELLED`)
- `reason`: String
- `providerRefundId`: String

### 6. `ledger_accounts`
Chart of accounts for double-entry bookkeeping.
- `code`: String (unique, e.g. `MERCHANT_PAYABLE_mer_123`, `GATEWAY_CLEARING_INR`, `PLATFORM_FEE_REVENUE`, `TAX_GST_PAYABLE`)
- `merchantId`: String
- `name`: String
- `type`: Enum (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`)
- `currency`: String
- `balanceMinor`: Number (Integer paise)

### 7. `ledger_transactions` & `ledger_entries`
Immutable double-entry journal records.
- `ledger_transactions`: `{ _id, merchantId, type, referenceId, description, createdAt }`
- `ledger_entries`: `{ _id, transactionId, accountCode, direction: 'DEBIT' | 'CREDIT', amountMinor, description }`

### 8. `api_keys`
Merchant secret credentials.
- `_id`: String (`key_...`)
- `merchantId`: String (indexed)
- `keyId`: String (`rl_test_pk_...`, unique)
- `hashedSecret`: String (SHA-256 hash of secret key)
- `prefix`: String (first 16 chars)
- `environment`: Enum (`SANDBOX`, `LIVE`)
- `isActive`: Boolean

### 9. `webhook_endpoints` & `webhook_deliveries`
Outbox event subscriptions and delivery tracking.
- `webhook_endpoints`: `{ _id, merchantId, url, events, secretKey, isActive }`
- `webhook_deliveries`: `{ _id, merchantId, endpointId, event, statusCode, responseBody, isSuccessful, attemptNumber }`

### 10. `settlements`
Merchant bank nodal settlement payouts.
- `_id`: String (`set_...`)
- `merchantId`: String (indexed)
- `grossAmount`: Number
- `feeAmount`: Number
- `taxAmount`: Number
- `netAmount`: Number
- `status`: Enum (`PENDING`, `PROCESSING`, `SETTLED`, `FAILED`)
- `settlementReference`: String (unique)
- `payoutDate`: Date
