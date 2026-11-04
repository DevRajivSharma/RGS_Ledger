# RGS Ledger REST API Reference (v1)

Base URL: `http://localhost:4000/api/v1`

## Authentication
Requests must include one of:
1. `Authorization: Bearer <JWT_ACCESS_TOKEN>`
2. `Authorization: Bearer rl_test_sk_...` (or header `x-api-key: rl_test_sk_...`)

---

## 1. Authentication Endpoints

### Register Merchant
`POST /auth/register`
```json
{
  "email": "merchant@store.in",
  "password": "Password123!",
  "fullName": "Vikram Aditya",
  "phone": "+919876543210",
  "businessName": "Acme Retail Technologies Pvt Ltd",
  "businessType": "PRIVATE_LIMITED",
  "website": "https://acmestore.in"
}
```

### Merchant Login
`POST /auth/login`
```json
{
  "email": "merchant@store.in",
  "password": "Password123!"
}
```

### Refresh Token
`POST /auth/refresh`
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsIn..."
}
```

---

## 2. Orders Endpoints

### Create Order
`POST /orders`
Header: `Idempotency-Key: <unique_key>`
```json
{
  "amount": 49900,
  "currency": "INR",
  "receipt": "INV-2026-001",
  "customer": {
    "name": "Rahul Sharma",
    "email": "rahul@example.com",
    "phone": "+919876543210"
  }
}
```

### Get Order
`GET /orders/:id`

### List Orders
`GET /orders?page=1&limit=20&status=CAPTURED`

---

## 3. Hosted Checkout Endpoints

### Create Checkout Session
`POST /checkout/sessions`
```json
{
  "orderId": "ord_1234567890",
  "successUrl": "https://store.in/success",
  "cancelUrl": "https://store.in/cancel",
  "expiresInMinutes": 30
}
```

### Fetch Checkout Session (Public)
`GET /checkout/sessions/:sessionId`

### Process Hosted Payment (Public)
`POST /checkout/sessions/:sessionId/pay`
```json
{
  "method": "UPI_INTENT",
  "upiId": "success@rgs"
}
```

---

## 4. Payments & Refunds Endpoints

### Get Payment
`GET /payments/:id`

### List Payments
`GET /payments?page=1&limit=20`

### Create Refund
`POST /refunds`
```json
{
  "paymentId": "pay_1234567890",
  "amount": 10000,
  "reason": "Customer sizing return"
}
```

---

## 5. API Keys & Webhooks

### Generate API Key
`POST /api-keys`
```json
{
  "name": "Production Backend Server",
  "environment": "SANDBOX"
}
```

### Register Webhook Endpoint
`POST /webhooks`
```json
{
  "url": "https://store.in/api/rgs-webhook",
  "events": ["payment.succeeded", "refund.processed"]
}
```
