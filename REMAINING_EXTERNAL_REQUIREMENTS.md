# RGS LEDGER — REMAINING EXTERNAL REQUIREMENTS & GO-LIVE RUNBOOK

**Document ID:** `RGS-RUNBOOK-GOLIVE-2026-11`  
**Platform:** RGS Ledger — Enterprise Fintech Platform  
**Target Audience:** Founder, Platform Owner, DevOps Lead, Legal Counsel  

---

## 1. Overview

The local software engineering, database schemas, cryptographic security, provider adapters, and test suites for RGS Ledger are **100% complete**. 

This document details the **external actions, legal agreements, business registrations, and credentials** that you (the platform owner) must execute in the real world before accepting live customer payments.

---

## 2. External Provider Credentials Checklist

Standard bank-to-bank UPI payment acceptance in India carries **0% commission (zero MDR)** by law. You must register directly with the infrastructure providers:

### 2.1 PhonePe Business Setup
1. **Registration:** Sign up at [business.phonepe.com](https://business.phonepe.com).
2. **KYC Submission:** Submit Business PAN, Authorized Signatory Aadhaar, Business Address Proof, and Current Bank Account Details (Cancelled Cheque).
3. **Approval:** Typically takes 1–3 business days.
4. **Developer Settings:**
   - Log into the PhonePe Business dashboard.
   - Navigate to **Developer Settings -> API Keys / Webhook Configuration**.
   - Copy:
     - `PHONEPE_MERCHANT_ID` (e.g. `M1234567890`)
     - `PHONEPE_SALT_KEY` (UUID string)
     - `PHONEPE_SALT_INDEX` (typically `1`)
   - Whitelist your Production Inbound Webhook URL:
     `https://api.yourdomain.com/api/v1/callbacks/phonepe`
5. **Configuration in RGS Ledger:**
   - Log into the RGS Merchant Dashboard.
   - Go to **Settings -> Provider Configuration -> Add Provider**.
   - Select **PhonePe**, choose **LIVE** environment, input credentials, and click **Save & Enable**.

### 2.2 Paytm Business Setup
1. **Registration:** Sign up at [business.paytm.com](https://business.paytm.com).
2. **KYC Submission:** Submit PAN, Bank Details, Business Proof.
3. **Approval:** 1–2 business days.
4. **Developer Settings:**
   - Navigate to **Developer Settings -> API Keys**.
   - Copy:
     - `PAYTM_MERCHANT_ID` (MID)
     - `PAYTM_MERCHANT_KEY`
     - `PAYTM_WEBSITE` (typically `DEFAULT` for live production)
   - Whitelist your Production Callback URL:
     `https://api.yourdomain.com/api/v1/callbacks/paytm`
5. **Configuration in RGS Ledger:**
   - Input credentials in the RGS Merchant Dashboard under **Paytm Provider Settings**.

---

## 3. Card & Netbanking Acquiring Requirements

> [!WARNING]
> **UPIPay does NOT support Cards or Netbanking.**
> UPI is a domestic instant settlement rail governed by NPCI. Processing Cards (Visa, Mastercard, RuPay) and Netbanking requires an authorized banking acquirer.

To enable Card and Netbanking payments on RGS Ledger:
1. **Select an Acquiring Partner:**
   - Option A: Direct Bank Payment Aggregator (e.g., HDFC SmartHub Vyapar, ICICI Eazypay).
   - Option B: Licensed Payment Aggregator (e.g., Cashfree, Razorpay, Pine Labs, BillDesk).
2. **Sign Merchant Agreement:** Execute a commercial merchant acquiring agreement with the selected provider covering MDR rates (typically 1.5%–2% for cards).
3. **Obtain API Credentials:** Acquire `CARD_GATEWAY_KEY` and `CARD_GATEWAY_SECRET`.
4. **Configure in RGS Ledger:** Add the credentials to `MerchantProviderAccount` under `ProviderType.CARD_GATEWAY`.

---

## 4. Production Cloud & Network Infrastructure

Before deploying to production, prepare the following cloud infrastructure:

### 4.1 Domains & TLS Certificates
- `api.yourdomain.com` (REST API & PSP callbacks)
- `dashboard.yourdomain.com` (Merchant Dashboard)
- `checkout.yourdomain.com` (Hosted Checkout UI)
- `developer.yourdomain.com` (API Documentation & Portal)
- `admin.yourdomain.com` (Super Admin Console)
- **Requirement:** High-assurance TLS 1.3 / 1.2 certificates with valid certification chains (Let's Encrypt / Cloudflare / AWS ACM). PhonePe and Paytm reject callbacks to non-HTTPS or self-signed domains.

### 4.2 Database & Cache Clusters
- **MongoDB:** MongoDB Atlas Dedicated Cluster (M10+) with automated daily snapshots, WiredTiger storage, and IP allowlisting.
- **Redis:** Managed Redis (AWS ElastiCache / Redis Cloud / Upstash) for BullMQ persistent webhook retries.

### 4.3 Static IP Address
- Obtain a static outbound IP address (NAT Gateway / Elastic IP) for your API servers.
- Some bank PSP firewalls require whitelisting your server IP for server-to-server Status API calls.

---

## 5. Production Cryptographic Secrets Generation

Do not use development defaults in production. Generate cryptographically strong random keys:

```bash
# Generate 256-bit (64 hex characters) Master Encryption Key:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT Access Secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT Refresh Secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Cookie Secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate System Webhook Signing Secret:
node -e "console.log('whsec_' + require('crypto').randomBytes(24).toString('hex'))"
```

Store these values in **AWS Secrets Manager**, **HashiCorp Vault**, or your cloud provider's encrypted environment store.

---

## 6. Legal & Regulatory Checklist

Before enabling live customer checkout:

| Compliance Item | Requirement | Status | Action Needed |
| :--- | :--- | :---: | :--- |
| **Operating Model** | Must operate under Model 1 (Technology Provider) where each merchant receives settlements directly. | 🟢 Ready | Strictly avoid commingling merchant funds into a platform bank account. |
| **Terms of Service** | Publicly accessible Terms of Service on checkout and website. | 🟡 To Draft | Legal counsel must draft platform terms including dispute timelines. |
| **Privacy Policy** | Explicit disclosures regarding data storage, customer contact details, and IT Act compliance. | 🟡 To Draft | Disclose that card data is never stored locally. |
| **Refund & Cancellation** | Documented refund policy with clear turnaround times (typically 5–7 business days). | 🟡 To Draft | Surface refund policy link on hosted checkout footer. |
| **Grievance Officer** | Contact details of an Indian Grievance Officer published on website (mandated under Consumer Protection E-Commerce Rules). | 🟡 To Assign | Assign a support email and physical address for escalations. |
