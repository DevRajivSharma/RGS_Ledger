import React from 'react';
import { getMerchantSignupUrl } from '../config/urls.js';

export interface HowItWorksPageProps {
  onNavigate: (path: string) => void;
}

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onNavigate: _onNavigate }) => {
  const steps = [
    {
      step: 1,
      title: 'Merchant Registration',
      subtitle: 'Create your merchant profile and establish security credentials.',
      detail: 'Register with your business email and secure password. RGS Ledger issues JWT access sessions with HttpOnly refresh-token rotation to keep sessions protected.'
    },
    {
      step: 2,
      title: 'UPI Receiving Account Configuration',
      subtitle: 'Configure the bank VPA where customer money settles directly.',
      detail: 'Add your existing merchant UPI ID (e.g., business@bank) and collection bank account suffix. Money goes directly to your bank account; RGS Ledger never touches the funds.'
    },
    {
      step: 3,
      title: 'Email Evidence Integration (Gmail / Outlook)',
      subtitle: 'Authorize secure, read-only ingestion of incoming credit alerts.',
      detail: 'Connect your merchant Gmail account via official Google OAuth with restricted read-only access. When your bank sends an email alert (e.g., "A/c *0562 credited by Rs 1500.00"), RGS Ledger captures it.'
    },
    {
      step: 4,
      title: 'Android Companion Installation & Pairing',
      subtitle: 'Pair your physical Android device running our native Kotlin listener.',
      detail: 'Install the companion app on your business Android phone. Pair via an 8-character rotating code. With explicit Android notification access granted, it captures in-device credit push alerts offline and syncs with retries.'
    },
    {
      step: 5,
      title: 'Template Configuration (Independent Channels)',
      subtitle: 'Define regex extractors for your bank’s exact SMS and email formats.',
      detail: 'Banks format alerts differently. RGS Ledger uses separate template engines for Email and Android channels to reliably extract amount (in paise), UTR / RRN, account suffix, and timestamp.'
    },
    {
      step: 6,
      title: 'Merchant Template Review & Approval',
      subtitle: 'Merchant verifies and approves extracted sample fields before activation.',
      detail: 'Crucial distinction: Template approval only confirms message structure recognition; it does not independently prove payment authenticity. Templates must be explicitly approved before matching.'
    },
    {
      step: 7,
      title: 'Test Payment & Evidence Matching Verification',
      subtitle: 'Make a small ₹1.00 test payment to verify dual-source capture.',
      detail: 'Scan the test QR from your own personal UPI app. Verify that both Gmail and Android companion alerts arrive, extract the identical UTR, and satisfy the dual-source rule.'
    },
    {
      step: 8,
      title: 'Create Production Payment Requests & Links',
      subtitle: 'Generate dynamic UPI QR codes and hosted checkout sessions.',
      detail: 'Generate payment requests programmatically via our REST API or through the Merchant Dashboard. Share QR codes on billing screens or send hosted checkout links to customers.'
    },
    {
      step: 9,
      title: 'Authoritative State Transitions & Webhooks',
      subtitle: 'Payments transition based strictly on the dual-source evidence policy.',
      detail: 'When BOTH Email and Android sources match the UTR and amount, the payment becomes SUCCESS, and an HMAC-signed webhook is dispatched. If only one arrives, it remains PARTIAL_SUCCESS.'
    },
    {
      step: 10,
      title: 'Audit, Reconciliation & Dispute Resolution',
      subtitle: 'Manage late evidence, mismatched amounts, or disputed UTRs.',
      detail: 'If evidence arrives late after the 15-minute expiry window or if amount discrepancies occur, cases appear in your Reconciliation dashboard with an immutable audit trail for manual review.'
    }
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px 60px' }}>
      {/* Page Title */}
      <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto 60px' }}>
        <div style={{ display: 'inline-block', padding: '4px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#1E40AF', marginBottom: '16px' }}>
          Step-by-Step Platform Lifecycle
        </div>
        <h1 style={{ fontSize: '38px', fontWeight: 800, color: '#111827', margin: '0 0 16px 0', letterSpacing: '-0.5px' }}>
          How Evidence Matching Works
        </h1>
        <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#4B5563', margin: 0 }}>
          RGS Ledger reconciles payments through automated dual-source evidence verification. Here is the complete merchant journey from initial onboarding to automated reconciliation.
        </p>
      </div>

      {/* 10 Step Process Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '60px' }}>
        {steps.map((s) => (
          <div
            key={s.step}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              gap: '20px',
              alignItems: 'flex-start',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#EFF6FF', border: '2px solid #3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D4ED8', fontWeight: 800, fontSize: '16px', flexShrink: 0 }}>
              {s.step}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 4px 0' }}>
                {s.title}
              </h2>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#2563EB', marginBottom: '8px' }}>
                {s.subtitle}
              </div>
              <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#4B5563', margin: 0 }}>
                {s.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Payment Status Lifecycle Guide */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '36px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#111827', margin: '0 0 8px 0' }}>
          Understanding Payment Statuses
        </h2>
        <p style={{ fontSize: '14px', color: '#6B7280', margin: '0 0 24px 0' }}>
          RGS Ledger strictly enforces an evidence-based state machine. Statuses reflect genuine evidence arrival:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FAFAFA' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '4px' }}>
              PENDING
            </span>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '8px 0 4px 0', color: '#111827' }}>Awaiting Payment & Alerts</h3>
            <p style={{ fontSize: '12px', color: '#4B5563', margin: 0, lineHeight: 1.5 }}>
              QR code generated. Awaiting customer scan and incoming credit evidence.
            </p>
          </div>

          <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FAFAFA' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, background: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '4px' }}>
              PARTIAL_SUCCESS
            </span>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '8px 0 4px 0', color: '#111827' }}>Single Evidence Source Matched</h3>
            <p style={{ fontSize: '12px', color: '#4B5563', margin: 0, lineHeight: 1.5 }}>
              Exactly ONE source (Email OR Android) matched. Awaiting second source before SUCCESS.
            </p>
          </div>

          <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FAFAFA' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, background: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: '4px' }}>
              SUCCESS
            </span>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '8px 0 4px 0', color: '#111827' }}>Dual-Source Verified</h3>
            <p style={{ fontSize: '12px', color: '#4B5563', margin: 0, lineHeight: 1.5 }}>
              BOTH Email AND Android companion evidence matched the exact UTR, amount, and account.
            </p>
          </div>

          <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FAFAFA' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, background: '#FEE2E2', color: '#991B1B', padding: '2px 8px', borderRadius: '4px' }}>
              REVIEW_REQUIRED
            </span>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '8px 0 4px 0', color: '#111827' }}>Evidence Conflict</h3>
            <p style={{ fontSize: '12px', color: '#4B5563', margin: 0, lineHeight: 1.5 }}>
              Contradictory UTRs, amount mismatch, or duplicate notification detected. Manual review required.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ marginTop: '50px', textAlign: 'center' }}>
        <a
          href={getMerchantSignupUrl()}
          style={{
            display: 'inline-block',
            textDecoration: 'none',
            padding: '12px 28px',
            background: '#2563EB',
            color: '#FFF',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Configure Your Merchant Account Now →
        </a>
      </div>
    </div>
  );
};
