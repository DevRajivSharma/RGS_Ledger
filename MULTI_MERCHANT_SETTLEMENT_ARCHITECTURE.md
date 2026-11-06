# RGS LEDGER — MULTI-MERCHANT SETTLEMENT & REGULATORY ARCHITECTURE

**Document ID:** `RGS-SETTLE-REG-2026-11`  
**Platform:** RGS Ledger — Enterprise Fintech Platform  
**Compliance Reference:** Reserve Bank of India (RBI) Master Direction – Regulation of Payment Aggregators (PAs) and Payment Gateways (PGs)  
**Security Classification:** Regulatory & Legal Architecture Reference  

---

## 1. Regulatory Context & Legal Boundaries

Operating a payment platform in India is strictly governed by the **Reserve Bank of India (RBI)** under the *Payment and Settlement Systems Act, 2007 (PSS Act)* and the *Guidelines on Regulation of Payment Aggregators and Payment Gateways (DPSS.CO.PD.No.1810/02.14.008/2019-20)*.

> [!IMPORTANT]
> **Regulatory Boundary Declaration:**
> RGS Ledger does NOT currently hold an RBI Payment Aggregator (PA) authorization. Therefore, RGS Ledger **CANNOT** collect, pool, hold, or disburse funds through a platform-owned bank account on behalf of multiple merchants.

---

## 2. Permitted Architectural Models

To operate lawfully within Indian banking regulations, RGS Ledger implements and adheres to three distinct operational models:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SETTLEMENT OPERATING MODELS                               │
├──────────────────────────────┬─────────────────────────────┬───────────────────────────┤
│ Model 1: Technology Provider │ Model 2: Licensed PA Partner│ Model 3: Direct Raw QR    │
│ (Pure TSP — Permitted)       │ (Sub-Merchant — Permitted)  │ (Direct VPA — Permitted)  │
├──────────────────────────────┼─────────────────────────────┼───────────────────────────┤
│ • Merchant has own PhonePe/  │ • RGS partners with licensed│ • Merchant provides own   │
│   Paytm business account.    │   bank / RBI-authorized PA. │   authorized bank VPA.    │
│ • RGS acts as tech layer.    │ • PA manages Escrow Account.│ • Customer pays directly  │
│ • Funds settle directly to   │ • Settlement routed via PA's│   to merchant's bank.     │
│   merchant's bank account.   │   approved nodal framework. │ • RGS holds zero funds.   │
│ • RGS holds ₹0 in custody.   │ • Full regulatory compliance│ • Manual UTR verify.      │
└──────────────────────────────┴─────────────────────────────┴───────────────────────────┘
```

### Model 1: Pure Technology Service Provider (TSP) — Default Live Model
- **Mechanics:** Each merchant completes independent onboarding with PhonePe Business or Paytm Business.
- **Routing:** RGS Ledger uses the merchant's encrypted API credentials to initiate payments and receive callbacks.
- **Settlement:** The payment settlement is executed entirely by NPCI and the merchant's acquiring PSP (PhonePe/Paytm) directly into the merchant's KYC-verified bank account.
- **Regulatory Status:** Fully compliant under RBI guidelines for Technology Service Providers (TSPs). RGS Ledger never touches the settlement funds, never pools money, and requires no RBI PA authorization.

### Model 2: Authorized Payment Aggregator Partnership (Future Escrow Model)
- **Mechanics:** RGS Ledger executes a formal commercial partnership with an RBI-authorized Payment Aggregator (e.g. Cashfree, Razorpay, or a Scheduled Commercial Bank).
- **Escrow Operations:** Funds are routed into a designated **Non-Interest-Bearing Escrow Account** maintained with a designated Scheduled Commercial Bank in compliance with RBI guidelines.
- **Sub-Merchant Onboarding:** RGS merchants undergo KYC verification via partner APIs and receive a mapped `subMerchantId`.
- **Settlement:** The Escrow Bank calculates net settlement (Gross - MDR Fee - GST) and executes T+1 or T+2 payouts directly to the merchant's verified bank account.

### Model 3: Direct Raw UPI QR (Merchant VPA)
- **Mechanics:** The merchant configures their own business VPA (e.g. `merchant@icici`).
- **Settlement:** Payments made via UPI apps credit the merchant's bank account instantly over the NPCI IMPS rail.
- **Confirmation:** The merchant verifies credits via internet banking statements and confirms orders manually via RGS Ledger.

---

## 3. Prohibited Arrangements (What Must Never Be Done)

Fintech regulations strictly prohibit the following shortcuts:
1. **Commingled Platform MID:** Using a single PhonePe or Paytm MID owned by the platform to collect payments for 50 different third-party e-commerce merchants. This constitutes **unauthorized payment aggregation** under Section 3 of the PSS Act and is subject to immediate regulatory enforcement, account freezes, and penal sanctions.
2. **Platform Custody Without Escrow:** Collecting customer funds into a standard current account owned by RGS Ledger and later paying out merchants.
3. **Cardholder Data Storage:** Storing raw card numbers or CVVs without PCI-DSS Level 1 certification and RBI CoF tokenization compliance.

---

## 4. Double-Entry Settlement Ledger Architecture

Regardless of upstream provider routing, RGS Ledger tracks every transaction using an immutable, balanced **Double-Entry Financial Ledger** in integer minor units (paise).

### 4.1 Ledger Chart of Accounts

| Account Code | Account Name | Type | Normal Balance | Purpose |
| :--- | :--- | :--- | :---: | :--- |
| `1010` | `SETTLEMENT_CLEARING` | ASSET | Debit | Tracks funds in flight with upstream PSP / Bank rails. |
| `2010` | `MERCHANT_PAYABLE` | LIABILITY | Credit | Net funds owed to the merchant for completed sales. |
| `4010` | `PLATFORM_FEE_INCOME` | REVENUE | Credit | Platform technology and processing fees earned. |
| `2020` | `GST_TAX_PAYABLE` | LIABILITY | Credit | 18% GST collected on processing fees for tax remittance. |
| `1020` | `ESCROW_BANK_ACCOUNT` | ASSET | Debit | Physical cash held in escrow bank account (Model 2). |

### 4.2 Journal Entry: Payment Capture (e.g. ₹1,000.00 Transaction with 2% Platform Fee)

```
Gross Amount: ₹1,000.00 (100000 paise)
Processing Fee (2%): ₹20.00 (2000 paise)
GST on Fee (18%): ₹3.60 (360 paise)
Net Merchant Credit: ₹976.40 (97640 paise)

Journal Batch:
  DEBIT   1010  SETTLEMENT_CLEARING       100000 paise
  CREDIT  2010  MERCHANT_PAYABLE           97640 paise
  CREDIT  4010  PLATFORM_FEE_INCOME         2000 paise
  CREDIT  2020  GST_TAX_PAYABLE              360 paise
Total Debits = 100000 paise | Total Credits = 100000 paise (BALANCED)
```

### 4.3 Journal Entry: Merchant Settlement Payout (T+1 Payout of ₹976.40)

```
Journal Batch:
  DEBIT   2010  MERCHANT_PAYABLE           97640 paise
  CREDIT  1010  SETTLEMENT_CLEARING        97640 paise
Total Debits = 97640 paise | Total Credits = 97640 paise (BALANCED)
```

---

## 5. Settlement Schedule & Dispute Hold Policy

1. **Settlement Cycle:** Standard T+1 (for domestic UPI transactions).
2. **Dispute / Chargeback Hold:** When a customer disputes a transaction via NPCI / bank chargeback portal, a `DISPUTE_HOLD` journal debits `MERCHANT_PAYABLE` and credits `DISPUTE_RESERVE` until adjudication is completed.
3. **Refund Ceilings:** Refunds can never exceed `amountPaid - amountRefunded`. Partial refunds are balanced by reverse double-entry journals.
