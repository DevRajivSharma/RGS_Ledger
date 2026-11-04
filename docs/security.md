# RGS Ledger Security Architecture & Controls

Fintech infrastructure requires strict defense-in-depth controls across every software layer.

## Security Baseline Controls

### 1. Cryptographic Key Management & Storage
- **Merchant API Secret Keys**: Stored solely as SHA-256 hashes (`hashedSecret`). Plaintext secrets are displayed strictly once upon generation and are never stored in the database or returned in subsequent queries.
- **Webhook Signatures**: Generated using HMAC-SHA256 with timestamp (`t=<timestamp>,v1=<signature>`). Verified using constant-time comparison (`crypto.timingSafeEqual`) to eliminate side-channel timing attacks.
- **Passwords**: Hashed with bcrypt using 12 salt rounds.

### 2. Multi-Tenant Data Isolation
- Non-admin queries strictly enforce `merchantId` scoping.
- Frontend submitted `merchantId` values are rejected or overwritten with authenticated session identity to prevent parameter tampering and horizontal privilege escalation.

### 3. Server-Side Request Forgery (SSRF) Protection
- Webhook dispatch validates all destination endpoints.
- In production, outbound HTTP requests to internal IP addresses are strictly rejected:
  - Localhost / loopback (`127.0.0.1`, `::1`)
  - RFC 1918 Private Ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  - Cloud instance metadata service (`169.254.169.254`)
  - Internal TLDs (`.internal`, `.local`)

### 4. Idempotency & Replay Protection
- `Idempotency-Key` HTTP header hashes incoming request payloads and caches responses for 24 hours.
- Identical requests receive the exact verified response without duplicating order creations, double-charging customers, or duplicating refunds.

### 5. Sensitive Data Redaction
- UPI PINs and banking passwords are never requested or stored.
- Full card numbers (PAN) are tokenized in provider adapters; the platform stores only card network and last 4 digits (`cardLast4`).
