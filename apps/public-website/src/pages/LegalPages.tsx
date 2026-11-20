import React from 'react';

export interface LegalPageProps {
  type: 'terms' | 'privacy' | 'security' | 'data-retention' | 'acceptable-use';
  onNavigate: (path: string) => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ type, onNavigate }) => {
  const contentMap = {
    terms: {
      title: 'Terms of Service',
      lastUpdated: 'November 20, 2026',
      badge: 'OFFICIAL PLATFORM TERMS',
      sections: [
        {
          heading: '1. Acceptance of Terms & Service Overview',
          text: 'These Terms of Service ("Terms") govern access to and use of RGS Ledger (https://rgsledger.rajivsharma.online), operated by Rajiv Sharma. By registering a merchant account, generating UPI QR codes, or installing the Android Companion application, you agree to be bound by these Terms.'
        },
        {
          heading: '2. Nature of the Software Service (Zero-Custody FinTech Architecture)',
          text: 'RGS Ledger is an independent software tool providing Unified Payments Interface (UPI) payment QR code generation and automated dual-source credit-alert evidence matching. RGS Ledger is NOT a payment aggregator, payment gateway, custodian, or bank. Money paid by customers transfers directly from customer bank accounts across NPCI UPI rails to the merchant\'s own configured bank account. RGS Ledger never receives, holds, settles, or escrows customer or merchant money, maintains no wallets, and issues no card rails.'
        },
        {
          heading: '3. Dual-Source Evidence Policy & Payment Status Meanings',
          text: 'Payment status transitions (PENDING, PARTIAL_SUCCESS, SUCCESS, REVIEW_REQUIRED) reflect satisfaction of internal dual-source evidence matching rules. A "SUCCESS" status indicates that both an approved Email credit alert and an approved Android companion notification were captured and matched with identical amounts and UTRs. CRITICAL FINTECH DISCLOSURE: A payment status of "SUCCESS" does not constitute a bank-authoritative confirmation from the National Payments Corporation of India (NPCI) or the underlying banking rail.'
        },
        {
          heading: '4. Merchant Authorizations & Responsibilities',
          text: 'Merchants explicitly authorize RGS Ledger to: (a) read incoming banking credit alert emails from connected Gmail accounts via the read-only Gmail scope (gmail.readonly) solely for extracting credit alerts matching merchant-approved templates, and (b) receive banking push notifications broadcast by the merchant\'s companion Android device via Android NotificationListenerService. The merchant is solely responsible for verifying customer identity and fulfilling goods or services.'
        },
        {
          heading: '5. Prohibited Uses & Compliance',
          text: 'Merchants may NOT use RGS Ledger for: (a) processing illegal, fraudulent, or deceptive transactions, (b) replaying counterfeit, forged, or intercepted notifications, (c) circumventing banking compliance checks, anti-money laundering (AML) controls, or KYC requirements, or (d) disrupting or overloading the platform infrastructure.'
        },
        {
          heading: '6. Limitation of Liability',
          text: 'Because RGS Ledger never receives, holds, settles, or transfers funds, RGS Ledger and its operator bear no liability for failed UPI rail transfers, banking server downtimes, delayed SMS/push notifications, customer disputes, or chargebacks. Merchants assume all commercial credit risk associated with their fulfillment decisions.'
        },
        {
          heading: '7. Account Termination & Revocation',
          text: 'Merchants may terminate their account at any time. Merchants can revoke Gmail OAuth permissions immediately through Google Account Security or within the Merchant Dashboard. Upon account termination, stored integration tokens and configurations are permanently erased.'
        },
        {
          heading: '8. Governing Law & Support Contact',
          text: 'These Terms are governed by the laws of India. For legal or support inquiries, contact support@rajivsharma.online or visit https://rgsledger.rajivsharma.online.'
        }
      ]
    },
    privacy: {
      title: 'Privacy Policy',
      lastUpdated: 'November 20, 2026',
      badge: 'OFFICIAL PRIVACY POLICY',
      sections: [
        {
          heading: '1. Introduction & Overview',
          text: 'RGS Ledger (https://rgsledger.rajivsharma.online), operated by Rajiv Sharma, respects the privacy of merchants and their customers. This Privacy Policy discloses how we collect, process, protect, store, and delete transaction evidence and credentials when merchants use our UPI payment collection and evidence matching platform.'
        },
        {
          heading: '2. Zero-Custody Architecture & FinTech Boundaries',
          text: 'RGS Ledger is a zero-custody software platform. We do NOT hold customer or merchant money, maintain wallets, process debit/credit cards, or connect to direct bank core APIs. Payments move directly from the payer to the merchant\'s bank account via standard UPI rails. Payment "SUCCESS" indicates that our dual-source evidence policy was satisfied, NOT that RGS Ledger received direct confirmation from a banking rail.'
        },
        {
          heading: '3. Google API Services & Gmail OAuth Integration (gmail.readonly)',
          text: 'To automate the matching of bank credit alerts, merchants may optionally connect their Google Account. We request strictly one read-only scope: https://www.googleapis.com/auth/gmail.readonly. Our sync engine accesses ONLY incoming emails sent by authorized financial institutions and bank sender domains (e.g. Union Bank of India, HDFC Bank, ICICI Bank, SBI, Axis Bank, Kotak Mahindra Bank, Canara Bank, PNB) matching merchant-approved regex notification templates. We extract strictly: transaction amount (in paise), Unique Transaction Reference (UTR / RRN), masked bank account suffix (e.g. XX1234), transaction timestamp, and credit status. We do NOT access personal emails, non-banking messages, drafts, outbox, sent messages, attachments, or contacts. We cannot write, compose, send, or delete emails.'
        },
        {
          heading: '4. Google API Services User Data Policy & Limited Use Disclosure',
          text: 'RGS Ledger\'s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. Specifically: (a) Google user data is NEVER used or transferred to develop, train, or fine-tune generalized artificial intelligence (AI) or machine learning (ML) models. (b) Google user data is NEVER sold, rented, or transferred to third-party advertisers, data brokers, or marketing platforms. (c) No human personnel read merchant email content unless the merchant provides explicit affirmative consent for technical troubleshooting, required for security investigations, or required by applicable law.'
        },
        {
          heading: '5. Android Companion Notification Capture',
          text: 'The Android companion application utilizes Android\'s native NotificationListenerService (guarded by BIND_NOTIFICATION_LISTENER_SERVICE) with explicit merchant permission in Android Settings. It filters notifications on-device exclusively from merchant-enabled banking packages and SMS applications to extract credit alert amounts and UTRs. It has zero access to personal SMS, chat apps, phone calls, or media. On-device records are encrypted in local SQLite and auto-pruned after 7 days.'
        },
        {
          heading: '6. Credential Storage, Encryption & Tenant Isolation',
          text: 'All OAuth access and refresh tokens are encrypted at rest using AES-256-GCM authenticated encryption. Raw notification payloads are encrypted at rest and indexed solely by SHA-256 hashes (rawPayloadHash). Every database query across payments, evidence, devices, and templates is strictly isolated by merchant tenant ID (merchantId). Merchant session tokens use short-lived JWT access tokens (15 minutes).'
        },
        {
          heading: '7. Data Retention, Disconnection & Erasure',
          text: 'Extracted transaction evidence is retained for 90 days for operational reconciliation and merchant tax reporting (configurable up to 365 days by platform administration). Merchants can disconnect Gmail at any time via the Merchant Dashboard (Integrations → Disconnect) or directly from Google Account Permissions (https://myaccount.google.com/permissions). Disconnection permanently and immediately deletes stored OAuth tokens. Merchants can request complete account erasure by contacting privacy@rajivsharma.online.'
        },
        {
          heading: '8. Third-Party Infrastructure',
          text: 'RGS Ledger operates on enterprise cloud providers: MongoDB Atlas (encrypted database), Render (API backend service), and Cloudflare / Vercel (static content delivery). We never sell, rent, or trade merchant or customer data with any third party.'
        },
        {
          heading: '9. Contact Information & Data Protection',
          text: 'For questions regarding this policy or to exercise data protection rights, contact: Rajiv Sharma, Operator of RGS Ledger, Email: privacy@rajivsharma.online or support@rajivsharma.online, Website: https://rgsledger.rajivsharma.online.'
        }
      ]
    },
    security: {
      title: 'Security Architecture & Practices',
      lastUpdated: 'November 20, 2026',
      badge: 'ARCHITECTURAL DISCLOSURE',
      sections: [
        {
          heading: '1. Zero-Custody Architecture',
          text: 'The most effective security principle is minimizing financial attack surface: RGS Ledger never stores customer credit card numbers, CVVs, netbanking passwords, or UPI MPINs. We have no mechanism to initiate debits or withdraw money from any bank account.'
        },
        {
          heading: '2. Cryptographic Token Protection & Storage',
          text: 'All OAuth refresh tokens and sensitive credentials stored in our database are encrypted at rest using AES-256-GCM. Merchant session tokens use short-lived JWT access tokens (15 minutes) paired with HttpOnly, Secure, SameSite refresh cookies protected by deterministic HMAC-SHA256 rotation.'
        },
        {
          heading: '3. Tenant Isolation & Defense-in-Depth',
          text: 'Every MongoDB query across payments, evidence, devices, templates, and reconciliation cases is strictly partitioned by merchant tenant ID (merchantId). Automated rate limiters, strict HTTP headers, and OWASP formula injection sanitization protect public and API endpoints.'
        },
        {
          heading: '4. Immutable Security Audit Logging',
          text: 'All privileged operations, template approvals, device pairings, API key rotations, and reconciliation resolutions are permanently recorded in an immutable MongoDB audit log collection with structured JSON metadata and automatic secret redaction.'
        }
      ]
    },
    'data-retention': {
      title: 'Data Retention & Deletion Policy',
      lastUpdated: 'November 20, 2026',
      badge: 'OPERATIONAL POLICY',
      sections: [
        {
          heading: '1. Evidence Retention Schedule',
          text: 'Raw payment evidence (emails, Android push notifications, and extracted metadata) is retained for operational reconciliation and tax audit purposes for a configurable retention window (default 90 days, configurable up to 365 days by platform administration).'
        },
        {
          heading: '2. Automated Background Pruning',
          text: 'Historical evidence exceeding the platform retention window is periodically purged via durable MongoDB background jobs. Summarized payment records and ledger associations remain available for accounting continuity.'
        },
        {
          heading: '3. Account Termination & Deletion',
          text: 'Upon merchant account closure or upon verified request, merchant profile records, active device pairings, and stored OAuth credentials are deactivated and permanently deleted in accordance with data protection guidelines.'
        }
      ]
    },
    'acceptable-use': {
      title: 'Acceptable Use Policy',
      lastUpdated: 'November 20, 2026',
      badge: 'MERCHANT COMPLIANCE',
      sections: [
        {
          heading: '1. Permitted Uses',
          text: 'RGS Ledger is designed exclusively for legitimate commercial, non-profit, and professional merchants collecting voluntary UPI payments for lawful goods, services, invoices, and donations.'
        },
        {
          heading: '2. Strictly Prohibited Activities',
          text: 'Merchants may NOT use RGS Ledger for: (a) unauthorized fund transfers, money laundering, or illegal gambling, (b) replaying counterfeit, forged, or intercepted notifications, (c) circumventing banking compliance checks, or (d) generating misleading payment requests designed to defraud payers.'
        },
        {
          heading: '3. Investigation & Termination',
          text: 'Accounts found generating fraudulent evidence, abusing rate limits, or replaying false credit notifications will be immediately suspended and reported to relevant authorities where required by law.'
        }
      ]
    }
  };

  const current = contentMap[type];

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto', padding: '40px 20px 60px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#6B7280', marginBottom: '24px' }}>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); onNavigate('/'); }}
          style={{ color: '#2563EB', textDecoration: 'none' }}
        >
          Home
        </a>
        <span>/</span>
        <span style={{ color: '#111827', fontWeight: 600 }}>{current.title}</span>
      </div>

      {/* Official Status Notice */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '12px 16px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#1E40AF' }}>
        <span>🛡️</span>
        <span><strong>Verified Document: </strong>{current.badge}. Applicable to all merchants and users of RGS Ledger as of {current.lastUpdated}.</span>
      </div>

      <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#111827', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
        {current.title}
      </h1>
      <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '36px' }}>
        Last Updated: {current.lastUpdated} &bull; RGS Ledger Platform &bull; Operator: Rajiv Sharma
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '36px', display: 'flex', flexDirection: 'column', gap: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {current.sections.map((sec, idx) => (
          <div key={idx}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 10px 0' }}>
              {sec.heading}
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#4B5563', margin: 0 }}>
              {sec.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
