import React from 'react';

export interface LegalPageProps {
  type: 'terms' | 'privacy' | 'security' | 'data-retention' | 'acceptable-use';
  onNavigate: (path: string) => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ type }) => {
  const contentMap = {
    terms: {
      title: 'Terms of Service',
      lastUpdated: 'November 2026',
      badge: 'DRAFT — PENDING FORMAL LEGAL REVIEW',
      sections: [
        {
          heading: '1. Nature of the Software Service',
          text: 'RGS Ledger is a specialized non-custodial software platform that generates Unified Payments Interface (UPI) payment QR codes and matches incoming credit alert evidence. RGS Ledger is NOT a payment gateway, payment aggregator, financial institution, or bank. Money paid by customers transfers directly through national UPI rails to the merchant’s configured bank account.'
        },
        {
          heading: '2. Dual-Source Evidence Policy & Payment Statuses',
          text: 'Payment status transitions (PENDING, PARTIAL_SUCCESS, SUCCESS, REVIEW_REQUIRED) reflect satisfaction of RGS Ledger\'s internal dual-source matching rules. A "SUCCESS" status indicates that both an approved Email credit alert and an approved Android companion notification were captured and matched with identical amounts and UTRs. A "SUCCESS" status does not constitute a bank-authoritative confirmation from the National Payments Corporation of India (NPCI) or the underlying banking rail.'
        },
        {
          heading: '3. Merchant Responsibilities & Authorizations',
          text: 'Merchants explicitly authorize RGS Ledger to (a) read incoming banking credit alert emails from connected Gmail or Outlook accounts via authorized OAuth scopes, and (b) receive banking push notifications broadcast by the merchant\'s companion Android device via Android NotificationListenerService. The merchant is solely responsible for verifying customer identity and fulfilling goods or services.'
        },
        {
          heading: '4. Non-Custodial Limitation of Liability',
          text: 'Because RGS Ledger never receives, holds, settles, or transfers funds, RGS Ledger bears no liability for failed UPI rail transfers, banking server downtimes, delayed SMS/push notifications, customer disputes, or chargebacks. Merchants assume all commercial credit risk associated with their fulfillment decisions.'
        }
      ]
    },
    privacy: {
      title: 'Privacy Policy',
      lastUpdated: 'November 2026',
      badge: 'DRAFT — PENDING FORMAL LEGAL REVIEW',
      sections: [
        {
          heading: '1. Scope & Commitment to Privacy',
          text: 'RGS Ledger respects the privacy of merchants and their customers. This policy discloses how we collect, process, and protect transaction evidence and credentials.'
        },
        {
          heading: '2. Evidence Captured & Processed',
          text: 'When authorized by the merchant, RGS Ledger captures (a) merchant profile details and UPI VPAs, (b) bank credit alert emails received on merchant-authorized accounts, and (c) banking push notifications captured by the Android companion app. Raw notification payloads may contain sensitive financial data (amounts, masked account suffixes, UTR references). Raw payloads are encrypted at rest with AES-256 and never shared with or sold to third parties.'
        },
        {
          heading: '3. Restricted Scope of Google & Microsoft OAuth',
          text: 'Our Google API integration operates under a restricted read-only Gmail scope (`https://www.googleapis.com/auth/gmail.readonly`). We only process incoming credit alert emails matching approved merchant banking templates. We do not read personal emails, send emails, or share Google user data with artificial intelligence models or external advertisers.'
        },
        {
          heading: '4. Android Notification Access',
          text: 'The Android companion application utilizes Android\'s native `BIND_NOTIFICATION_LISTENER_SERVICE` permission. It is configured to capture notifications exclusively from merchant-enabled banking packages. It does not monitor personal messages, chats, or unrelated applications.'
        }
      ]
    },
    security: {
      title: 'Security Architecture & Practices',
      lastUpdated: 'November 2026',
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
          text: 'Every MongoDB query across payments, evidence, devices, templates, and reconciliation cases is strictly partitioned by merchant tenant ID (`merchantId`). Automated rate limiters, strict HTTP headers, and OWASP formula injection sanitization protect public and API endpoints.'
        },
        {
          heading: '4. Immutable Security Audit Logging',
          text: 'All privileged operations, template approvals, device pairings, API key rotations, and reconciliation resolutions are permanently recorded in an immutable MongoDB audit log collection with structured JSON metadata and automatic secret redaction.'
        }
      ]
    },
    'data-retention': {
      title: 'Data Retention & Deletion Policy',
      lastUpdated: 'November 2026',
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
      lastUpdated: 'November 2026',
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
    <div style={{ maxWidth: '840px', margin: '0 auto', padding: '40px 20px 60px' }}>
      {/* Draft Alert Notice */}
      <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '12px 16px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#92400E' }}>
        <span>⚠️</span>
        <span><strong>Notice: </strong>{current.badge}. This document accurately outlines platform operations as of {current.lastUpdated}.</span>
      </div>

      <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#111827', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
        {current.title}
      </h1>
      <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '36px' }}>
        Last Updated: {current.lastUpdated} &bull; RGS Ledger Platform
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '36px', display: 'flex', flexDirection: 'column', gap: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        {current.sections.map((sec, idx) => (
          <div key={idx}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 10px 0' }}>
              {sec.heading}
            </h2>
            <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#4B5563', margin: 0 }}>
              {sec.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
