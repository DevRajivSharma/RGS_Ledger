# RGS LEDGER — LOCAL ENVIRONMENT & CONFIGURATION GUIDE

**Document ID:** `RGS-ENV-2026-11-04`  
**Platform:** RGS Ledger — Fintech Payment Gateway Platform  
**Target Environment:** Local Development & Testing  
**Security Classification:** Development Configuration Reference  

---

## 1. Overview & Setup Philosophy

RGS Ledger is architected to be fully functional out-of-the-box in local development with minimal external dependencies.
- **Immediate Local Execution:** Requires only Node.js (v20+) and local MongoDB (v6.0+).
- **Graceful Fallbacks:** If optional services like Redis or SMTP are not running locally, the platform automatically engages resilient in-memory queues and console logging rather than failing or crashing.
- **Production Guardrails:** Production money movement and live banking rails remain disabled. Sandbox mode simulates deterministic payment outcomes (success, decline, pending, timeout) with full mathematical and ledger fidelity.

---

## 2. Consolidated Environment Variable Directory

Below is the complete reference of all environment variables across all workspaces:

| Variable Name | Category | Used By | Required? | Safe Local Default | Purpose |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `NODE_ENV` | Runtime | API | Yes | `development` | Sets runtime environment (`development`, `test`, `production`). In production, strict security headers and cookie flags are enforced. |
| `PAYMENT_ENVIRONMENT` | Gateway | API, Core | Yes | `SANDBOX` | Operating mode (`SANDBOX` vs `PRODUCTION`). Live money movement is locked unless all regulatory criteria are satisfied. |
| `LOG_LEVEL` | Logging | API | Optional | `info` | Winston/Morgan logging verbosity (`debug`, `info`, `warn`, `error`). |
| `API_PORT` | Local URLs | API | Yes | `4000` | Port on which Express REST API listens. |
| `API_URL` | Local URLs | API | Yes | `http://localhost:4000` | Fully-qualified public or loopback URL of the REST API. |
| `DASHBOARD_URL` | Local URLs | API | Yes | `http://localhost:5173` | Allowed CORS origin and redirect target for Merchant Dashboard. |
| `CHECKOUT_URL` | Local URLs | API | Yes | `http://localhost:5174` | Allowed CORS origin and base target for Hosted Checkout sessions. |
| `DEVELOPER_PORTAL_URL`| Local URLs | API | Yes | `http://localhost:5175` | Allowed CORS origin for Developer Portal. |
| `ADMIN_URL` | Local URLs | API | Yes | `http://localhost:5176` | Allowed CORS origin for Super Admin Console. |
| `VITE_API_URL` | Local URLs | Frontends | Yes | `http://localhost:4000/api/v1` | Base REST API URL used by Dashboard, Checkout, Admin, and Developer Portal frontends. |
| `MONGODB_URI` | Database | API | **Yes** | `mongodb://localhost:27017/rgs_ledger` | Connection string for primary database (wiredTiger engine). |
| `REDIS_URL` | Cache/Queue | API | Optional | `redis://localhost:6379` | Connection string for Redis BullMQ webhook retry queue. Falls back to in-memory queue if offline. |
| `JWT_ACCESS_SECRET` | Security | API | **Yes** | `rgs_dev_access_secret_min_32_chars_ok` | Secret key for signing 15-minute access JWTs. |
| `JWT_REFRESH_SECRET` | Security | API | **Yes** | `rgs_dev_refresh_secret_min_32_chars_ok` | Secret key for signing 7-day refresh JWTs. |
| `JWT_ACCESS_EXPIRES_IN`| Security | API | Optional | `15m` | Lifetime duration of access tokens. |
| `JWT_REFRESH_EXPIRES_IN`| Security | API | Optional | `7d` | Lifetime duration of refresh tokens. |
| `COOKIE_SECRET` | Security | API | **Yes** | `rgs_dev_cookie_secret_min_32_chars_ok` | Cookie signing secret for session cookies. |
| `ENCRYPTION_KEY` | Security | API | **Yes** | `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` | 256-bit AES-GCM encryption key for securing merchant settlement bank accounts at rest. |
| `WEBHOOK_SIGNING_SECRET`| Security | API, Shared | **Yes** | `whsec_dev_signing_secret_change_in_production` | Default HMAC-SHA256 signing secret for system webhook dispatches. |
| `DEFAULT_CURRENCY` | Gateway | API, Shared | Optional | `INR` | Default 3-letter ISO currency code. |
| `STORAGE_PROVIDER` | Storage | API | Optional | `local` | Document upload backend (`local`, `s3`, `gcs`). |
| `STORAGE_BUCKET` | Storage | API | Optional | `rgs-ledger-documents` | Bucket name if using S3/GCS. |
| `LOCAL_UPLOAD_DIR` | Storage | API | Optional | `./uploads` | Filesystem path for KYC identity documents when `STORAGE_PROVIDER=local`. |
| `SMTP_HOST` | Email | API | Optional | `localhost` | Mail server hostname (e.g. MailHog, Mailpit, AWS SES). |
| `SMTP_PORT` | Email | API | Optional | `1025` | Mail server port. |
| `SMTP_USER` | Email | API | Optional | `""` | SMTP authentication username. |
| `SMTP_PASSWORD` | Email | API | Optional | `""` | SMTP authentication password. |
| `EMAIL_FROM` | Email | API | Optional | `no-reply@rgsledger.com` | "From" sender address on notifications. |
| `NOTIFICATIONS_ENABLED`| Email | API | Optional | `true` | Toggle for transactional email dispatches. |
| `PROVIDER_BASE_URL` | Provider | Core, API | Optional | `https://api.partner-bank.example.com` | Upstream acquiring bank API endpoint (mocked in Sandbox). |
| `PROVIDER_PUBLIC_KEY` | Provider | Core, API | Optional | `pub_test_mock_gateway_key` | Acquirer partner public credential. |
| `PROVIDER_SECRET_KEY` | Provider | Core, API | Optional | `sec_test_mock_gateway_secret` | Acquirer partner secret credential. |

---

## 3. Categorized Variable Breakdown

### 3.1 Local Development URLs
- Used for intra-service communication, CORS configuration, and webhook redirect generation.
- **Local Defaults:**
  - `API_URL`: `http://localhost:4000`
  - `DASHBOARD_URL`: `http://localhost:5173`
  - `CHECKOUT_URL`: `http://localhost:5174`
  - `DEVELOPER_PORTAL_URL`: `http://localhost:5175`
  - `ADMIN_URL`: `http://localhost:5176`
  - `VITE_API_URL`: `http://localhost:4000/api/v1`

### 3.2 MongoDB Configuration
- **Variable:** `MONGODB_URI`
- **Default:** `mongodb://localhost:27017/rgs_ledger`
- **Requirement:** **Mandatory**. MongoDB must be running. WiredTiger storage engine handles schema models, transactions, orders, and append-only ledger entries.

### 3.3 Redis Configuration & BullMQ Status
- **Variable:** `REDIS_URL`
- **Default:** `redis://localhost:6379`
- **Current Runtime State:** Redis is currently **OFFLINE** on the local Windows host.
- **Application Resilience:** `apps/api/src/queues/webhook-queue.ts` detects Redis availability via an asynchronous handshake (`lazyConnect`).
  - *When Redis is online:* BullMQ initializes full distributed queues (`Queue`, `Worker`) with exponential backoff and retry persistence.
  - *When Redis is offline:* The application automatically logs:
    ```
    [Queue] Redis offline. Operating in resilient In-Memory webhook queue mode.
    ```
    and processes outbound webhooks via asynchronous `setImmediate()` in-memory queues without crashing the API or blocking payment journeys.
- **To Start Redis (Optional):**
  If you have Docker running, launch an ephemeral Redis instance:
  ```powershell
  docker run -d --name rgs-redis -p 6379:6379 redis:7-alpine
  ```

### 3.4 Authentication & Cryptographic Secrets
All secrets require 256-bit entropy in production. Safe local defaults are pre-configured:
- `JWT_ACCESS_SECRET`: `rgs_dev_access_secret_change_in_production_min_32_chars`
- `JWT_REFRESH_SECRET`: `rgs_dev_refresh_secret_change_in_production_min_32_chars`
- `COOKIE_SECRET`: `rgs_dev_cookie_secret_change_in_production_min_32_chars`
- `ENCRYPTION_KEY`: `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` (64 hex characters)
- `WEBHOOK_SIGNING_SECRET`: `whsec_dev_signing_secret_change_in_production`

### 3.5 Email / Transactional Notifications
- If `SMTP_HOST` is unreachable, transactional alerts are caught gracefully and logged to console.
- For local testing with a visual inbox, run **Mailpit** or **MailHog** on port 1025.

### 3.6 File Storage Configuration
- Defaults to `STORAGE_PROVIDER=local` with files saved in `./uploads`.
- S3 or Google Cloud Storage configurations are only needed in staging/production.

### 3.7 Payment Provider Configuration
- `PROVIDER_BASE_URL`, `PROVIDER_PUBLIC_KEY`, `PROVIDER_SECRET_KEY`:
- Points to sandbox adapter. **Do not fabricate external bank credentials.** The local sandbox provider handles test payments without upstream calls.

### 3.8 Production Deployment URLs (Future)
When deploying to cloud infrastructure, replace `localhost` URLs with your validated domain endpoints:
- `API_URL`: `https://api.yourdomain.com`
- `DASHBOARD_URL`: `https://dashboard.yourdomain.com`
- `CHECKOUT_URL`: `https://checkout.yourdomain.com`
- `DEVELOPER_PORTAL_URL`: `https://docs.yourdomain.com`
- `ADMIN_URL`: `https://admin.yourdomain.com`

---

## 4. Secret & Git Security Audit

1. **Git Exclusion Confirmed:**
   `.gitignore` has been updated and strictly excludes all `.env` files while preserving example templates:
   ```gitignore
   .env
   .env.*
   !.env.example
   !.env.template
   ```
   Verified via `git check-ignore -v .env .env.local .env.production .env.test`.
2. **Repository Secret Scan Confirmed:**
   Full cryptographic regex scan performed across all 160 tracked files and entire Git commit history. **Zero AWS, Google, Stripe, Razorpay, or database passwords exist in the repository.**

---

## 5. Step-by-Step Local Setup Instructions

### Step 1: Create the Root `.env` File
In the project root `D:\Coding\project\RGS_PAY\.env`, copy the contents from `.env.example`:

```bash
# Windows PowerShell
Copy-Item .env.example .env
```

The resulting file contents:
```ini
NODE_ENV=development
PAYMENT_ENVIRONMENT=SANDBOX
LOG_LEVEL=info

API_PORT=4000
API_URL=http://localhost:4000
DASHBOARD_URL=http://localhost:5173
CHECKOUT_URL=http://localhost:5174
DEVELOPER_PORTAL_URL=http://localhost:5175
ADMIN_URL=http://localhost:5176

MONGODB_URI=mongodb://localhost:27017/rgs_ledger
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=rgs_dev_access_secret_change_in_production_min_32_chars
JWT_REFRESH_SECRET=rgs_dev_refresh_secret_change_in_production_min_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
COOKIE_SECRET=rgs_dev_cookie_secret_change_in_production_min_32_chars
WEBHOOK_SIGNING_SECRET=whsec_dev_signing_secret_change_in_production

STORAGE_PROVIDER=local
STORAGE_BUCKET=rgs-ledger-documents
LOCAL_UPLOAD_DIR=./uploads

DEFAULT_CURRENCY=INR

SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=no-reply@rgsledger.com
NOTIFICATIONS_ENABLED=true

PROVIDER_BASE_URL=https://api.partner-bank.example.com
PROVIDER_PUBLIC_KEY=pub_test_mock_gateway_key
PROVIDER_SECRET_KEY=sec_test_mock_gateway_secret
```

### Step 2: (Optional) Create Frontend `.env` Files
Each frontend application has safe built-in fallbacks to `http://localhost:4000/api/v1`. If you wish to override the API target, create `.env` in any frontend directory:

- `apps/dashboard/.env`
- `apps/checkout/.env`
- `apps/admin/.env`
- `apps/developer-portal/.env`

Contents for each:
```ini
VITE_API_URL=http://localhost:4000/api/v1
```

---

## 6. External Accounts & Future Credentials Checklist

| Category | Immediate Local Development | Future Production Requirements |
| :--- | :--- | :--- |
| **Database** | Local MongoDB (`127.0.0.1:27017`) | MongoDB Atlas cluster or managed MongoDB instance with replication and daily backups. |
| **Cache & Queues** | In-Memory fallback (or local Docker Redis) | Managed Redis (Upstash, AWS ElastiCache, or Redis Enterprise). |
| **Payment Acquirer** | Simulated Sandbox Provider (`GenericUPIIntentProvider`) | Authorized Acquiring Bank / Payment Aggregator partnership agreement & production API credentials. |
| **Regulatory Authorization**| Sandbox operation (no license required) | RBI In-Principle PA authorization (India) or partnering with a licensed sponsor bank. |
| **Domain & DNS** | `localhost` | Production domains with SSL/TLS certificates and Wildcard DNS. |
| **Email Service** | Local console logging / mock | SendGrid, Postmark, Resend, or AWS SES with verified SPF, DKIM, and DMARC DNS records. |
| **File Storage** | Local directory (`./uploads`) | AWS S3 Bucket or Google Cloud Storage with strict IAM bucket policies. |

---

## 7. Service Startup & Verification Commands

### 1. Ensure MongoDB is Running
```powershell
mongod --dbpath "D:\Coding\project\RGS_PAY\.data\db" --port 27017 --bind_ip 127.0.0.1
```

### 2. Seed Initial Test Data
Initializes default Super Admin, Demo Merchant, test API keys, orders, and ledger entries:
```powershell
npm run seed
```
- **Super Admin Credentials:** `admin@rgsledger.com` / `Admin@RGS1234!`
- **Demo Merchant Credentials:** `merchant@acmestore.in` / `Merchant@12345!`
- **Test Public Key:** `rl_test_pk_acme_store_demo_key_99`
- **Test Secret Key:** `rl_test_sk_acme_store_demo_secret_99`

### 3. Run the Automated E2E Verification Suite
Verifies all 18 infrastructure, auth, payment, ledger, and security checks:
```powershell
npx tsx scripts/verify-e2e-audit.ts
```

### 4. Start Application Workspaces
You can start applications individually or simultaneously:

| Application | Command | Access URL |
| :--- | :--- | :--- |
| **Backend REST API** | `npm run dev:api` | `http://localhost:4000` |
| **Merchant Dashboard** | `npm run dev:dashboard` | `http://localhost:5173` |
| **Hosted Checkout** | `npm run dev:checkout` | `http://localhost:5174` |
| **Developer Portal** | `npm run dev:portal` | `http://localhost:5175` |
| **Super Admin Console**| `npm run dev:admin` | `http://localhost:5176` |
| **All Frontends Together** | `npm run dev:frontends` | Ports 5173 – 5176 |

### 5. Verify API Health
```powershell
curl http://localhost:4000/health
```
Expected output:
```json
{
  "status": "UP",
  "environment": "SANDBOX",
  "database": "CONNECTED",
  "uptime": 12.34
}
```
