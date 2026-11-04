# Fintech Compliance & Regulatory Boundary Notes

## Regulatory & Legal Boundaries (India / Global)

### 1. Payment Gateway (PG) vs Payment Aggregator (PA)
Under the **Reserve Bank of India (RBI) Guidelines on Regulation of Payment Aggregators and Payment Gateways (DPSS.CO.PD.No.1810/02.14.008/2019-20)**:
- **Payment Gateway (PG)**: Technology infrastructure providers that facilitate routing of payment data without handling or pooling customer funds in an escrow/nodal account.
- **Payment Aggregator (PA)**: Entities that onboard merchants, collect customer funds, and execute settlements into merchant bank accounts. PAs require formal RBI authorization, minimum net-worth criteria (₹15 Crore initially, increasing to ₹25 Crore), and periodic audit oversight.
- **RGS Ledger Position**: RGS Ledger operates as a **Payment Gateway Technology Platform**. Money movement, nodal escrow accounts, and settlement processing must be routed through an authorized licensed Payment Aggregator or acquiring bank partner.

### 2. NPCI UPI Framework
- UPI intent linking complies with National Payments Corporation of India (NPCI) URI specifications (`upi://pay`).
- RGS Ledger does not collect, record, or store customer UPI PINs.
- Authentication occurs exclusively inside the customer's NPCI-approved UPI PSP application (Google Pay, PhonePe, Paytm, BHIM).

### 3. PCI-DSS Compliance Boundary (SAQ A)
- Hosted Checkout uses a secure redirect / iframe session architecture.
- Merchant servers never touch, process, or store raw cardholder data (PAN, CVV, expiry), qualifying merchants for the minimal **PCI-DSS Self-Assessment Questionnaire A (SAQ A)** scope.

### 4. Data Localization Requirements
- RBI directives on **Storage of Payment System Data (April 2018)** require all end-to-end transaction data relating to payment systems in India to be stored only in systems located in India.
- Production MongoDB and Redis clusters must be hosted within Indian cloud regions (e.g. `ap-south-1` Mumbai / Hyderabad).
