import React from 'react';
import { getMerchantSignupUrl } from '../config/urls.js';

export interface FeaturesPageProps {
  onNavigate: (path: string) => void;
}

export const FeaturesPage: React.FC<FeaturesPageProps> = ({ onNavigate: _onNavigate }) => {
  const featureGroups = [
    {
      title: '1. Payment Request Management',
      icon: '📋',
      features: [
        'Dynamic fixed-amount payment creation with exact integer paise amounts.',
        'Automatic 15-minute expiration enforcement with background lease cleanup.',
        'Idempotency key protection preventing duplicate payment intent creation.',
        'Multi-bank receiving account routing scoped to merchant VPA configuration.'
      ]
    },
    {
      title: '2. UPI QR Generation',
      icon: '📱',
      features: [
        'Full compliance with NPCI UPI URI Specification 1.6.',
        'High-density QR code image generation with error correction.',
        'Deep-link UPI intent URLs (`upi://pay?...`) optimized for mobile apps.',
        'Direct settlement to merchant receiving VPA without intermediary escrow.'
      ]
    },
    {
      title: '3. Payment Links & Hosted Checkout',
      icon: '🔗',
      features: [
        'Fixed and open-amount payment links with customizable expiration times.',
        'Dedicated customer checkout interface (`apps/hosted-checkout`).',
        'Reusable payment links for catalog sales or open invoices.',
        'Link revocation, search, status toggling, and payment attempt history.'
      ]
    },
    {
      title: '4. Evidence Integrations',
      icon: '✉️',
      features: [
        'Official Google OAuth Gmail integration with read-only credit alert scope.',
        'Offline raw payload capture with SHA-256 deduplication hashing.',
        'Automated token refresh handling and connection health monitoring.',
        'Replay protection ensuring one email transaction cannot satisfy multiple payments.'
      ]
    },
    {
      title: '5. Android Companion Application',
      icon: '📲',
      features: [
        'Native Kotlin NotificationListenerService running on Android devices.',
        'Secure device pairing using rotating 8-character codes and device fingerprinting.',
        'Offline SQLite queueing for notifications with exponential backoff sync retries.',
        'Package filtering allowing merchants to enable/disable specific banking apps.'
      ]
    },
    {
      title: '6. Matching & Reconciliation Engine',
      icon: '🎯',
      features: [
        'Dual-source requirement: Both Email and Android evidence required for SUCCESS.',
        'Single-source partial matching resulting in PARTIAL_SUCCESS state.',
        'Exception case management for late evidence, amount conflicts, and missing UTRs.',
        'Four-stage investigation workflow: OPEN, INVESTIGATING, RESOLVED, DISMISSED.'
      ]
    },
    {
      title: '7. Developer APIs & Node.js SDK',
      icon: '💻',
      features: [
        'Clean REST API modular monolith with OpenAPI 3.1 specification.',
        'Published Node.js SDK client (`@rgs-ledger/sdk`) with TypeScript types.',
        'API key management supporting PRODUCTION and SANDBOX environments.',
        'Interactive Developer Portal (`apps/developer-portal`) with real-time API Explorer.'
      ]
    },
    {
      title: '8. Merchant Webhooks',
      icon: '🔔',
      features: [
        'Real-time event dispatch for PAYMENT_SUCCESS and PAYMENT_PARTIAL_SUCCESS.',
        'HMAC-SHA256 signature verification with replay timestamp validation.',
        'Durable MongoDB outbox pattern preventing event loss during crashes.',
        'Automatic retry schedule with exponential backoff and delivery audit log.'
      ]
    },
    {
      title: '9. Financial Analytics & Reports',
      icon: '📊',
      features: [
        'Real-time KPI metrics: Intent volume requested vs. Dual-source confirmed SUCCESS.',
        'Evidence matching rate calculation and average verification latency tracking.',
        'Timeseries arrival trends comparing bank credit emails vs. Android push alerts.',
        'OWASP formula injection-safe CSV downloads for payments, evidence, and reconciliations.'
      ]
    },
    {
      title: '10. Security & Access Control',
      icon: '🔒',
      features: [
        'Strict tenant isolation ensuring merchants can never access cross-merchant data.',
        'JWT session tokens with HttpOnly refresh cookies and cryptographic rotation.',
        'AES-256 data-at-rest encryption for sensitive OAuth tokens and credentials.',
        'Immutable audit logs recording all security-sensitive administrative operations.'
      ]
    }
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px 60px' }}>
      <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto 60px' }}>
        <div style={{ display: 'inline-block', padding: '4px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#1E40AF', marginBottom: '16px' }}>
          Production Feature Directory
        </div>
        <h1 style={{ fontSize: '38px', fontWeight: 800, color: '#111827', margin: '0 0 16px 0', letterSpacing: '-0.5px' }}>
          Complete Feature Capabilities
        </h1>
        <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#4B5563', margin: 0 }}>
          Every feature listed below represents active, tested functionality implemented within the RGS Ledger platform.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
        {featureGroups.map((g) => (
          <div
            key={g.title}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '24px' }}>{g.icon}</span>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#111827', margin: 0 }}>
                {g.title}
              </h2>
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#4B5563', lineHeight: 1.5 }}>
              {g.features.map((f, idx) => (
                <li key={idx}>{f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

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
          Start Using RGS Ledger →
        </a>
      </div>
    </div>
  );
};
