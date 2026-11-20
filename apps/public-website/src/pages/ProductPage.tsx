import React from 'react';
import { APP_URLS } from '../config/urls.js';

export interface ProductPageProps {
  onNavigate: (path: string) => void;
}

export const ProductPage: React.FC<ProductPageProps> = ({ onNavigate }) => {
  const productModules = [
    {
      id: 'upi-qr',
      badge: 'CORE GENERATION',
      title: 'Dynamic UPI QR Payment Requests',
      tagline: 'Standardized NPCI UPI URI Specification 1.6 QR generation.',
      whatItDoes: [
        'Generates standard dynamic UPI QR codes and deep-link intent URIs.',
        'Supports exact fixed-amount requests down to the paise (100 paise = ₹1.00).',
        'Includes unique checkout references, merchant VPA, order ID, and transaction note.',
        'Outputs pixel-perfect QR images rendered locally via offline SVG/PNG encoding.'
      ],
      whatItDoesNot: [
        'Does NOT initiate bank debit requests or pull money from customer accounts.',
        'Does NOT verify payment status upon QR code generation or scanning.',
        'Does NOT connect to bank core banking systems or payment switch rails.'
      ]
    },
    {
      id: 'payment-links',
      badge: 'HOSTED CHECKOUT',
      title: 'Payment Links & Hosted Checkout',
      tagline: 'Shareable payment URLs for e-commerce, invoices, and payment requests.',
      whatItDoes: [
        'Creates shareable links with custom titles, descriptions, and expiration timestamps.',
        'Supports reusable links for open donations or fixed-price catalog items.',
        'Provides a clean, branded customer-facing checkout page (`apps/hosted-checkout`).',
        'Displays real-time countdown timer and responsive UPI intent links for mobile apps.'
      ],
      whatItDoesNot: [
        'Does NOT support credit cards, debit cards, or netbanking credentials.',
        'Does NOT collect customer banking passwords, CVVs, or OTPs.',
        'Does NOT reuse payment evidence across distinct transactions or orders.'
      ]
    },
    {
      id: 'evidence-collection',
      badge: 'INGESTION ENGINE',
      title: 'Dual-Source Credit Evidence Collection',
      tagline: 'Independent parallel capture of banking credit alerts across Email and Android.',
      whatItDoes: [
        'Ingests credit alert emails from merchant-authorized Gmail (via read-only OAuth scope).',
        'Captures native banking push notifications on Android companion devices using NotificationListenerService.',
        'Normalizes raw payloads into structured credit records (amount, UTR, account suffix, timestamp).',
        'Detects and deduplicates replayed or duplicate notifications.'
      ],
      whatItDoesNot: [
        'Does NOT scrape online banking web portals or download PDF statements.',
        'Does NOT support iOS notification capture (Apple iOS sandbox strictly forbids reading third-party notifications).',
        'Does NOT access customer emails or unauthorized non-banking communications.'
      ]
    },
    {
      id: 'matching-engine',
      badge: 'AUTHORITATIVE CORE',
      title: 'Dual-Source Evidence Matching Engine',
      tagline: 'Strict zero-false-positive payment state transitions.',
      whatItDoes: [
        'Requires BOTH Email and Android Companion evidence to match before promoting to SUCCESS.',
        'Enforces exact amount matching (paise-exact) and UTR (Unique Transaction Reference) validation.',
        'Transitions to PARTIAL_SUCCESS when only one evidence source arrives.',
        'Flags conflicting amounts, duplicate UTRs, or mismatched accounts as REVIEW_REQUIRED.'
      ],
      whatItDoesNot: [
        'Does NOT promote payments to SUCCESS based on customer screenshots or QR scans.',
        'Does NOT promote PARTIAL_SUCCESS to SUCCESS on timeout or payment window expiration.',
        'Does NOT count Gmail and Outlook as two separate channels (they count as ONE email channel).'
      ]
    },
    {
      id: 'reconciliation',
      badge: 'EXCEPTION MANAGEMENT',
      title: 'Reconciliation & Dispute Management',
      tagline: 'Audit trails and manual intervention for payment exceptions.',
      whatItDoes: [
        'Tracks late evidence arriving after payment expiration (15-minute window).',
        'Surfaces ambiguous, conflicted, or replayed evidence with detailed investigation notes.',
        'Provides merchant resolution workflows (OPEN, INVESTIGATING, RESOLVED, DISMISSED).',
        'Maintains immutable security audit history for every state modification.'
      ],
      whatItDoesNot: [
        'Does NOT issue automated banking chargebacks or reversals (RGS Ledger does not hold funds).',
        'Does NOT allow a single evidence source to be manually forced to SUCCESS without dual evidence.',
        'Does NOT modify or erase historical bank credit records.'
      ]
    },
    {
      id: 'analytics-exports',
      badge: 'REPORTING',
      title: 'Merchant Analytics & Compliance Exports',
      tagline: 'Real-time financial visibility with OWASP-safe CSV reports.',
      whatItDoes: [
        'Computes payment intent requested vs. dual-source confirmed SUCCESS volume.',
        'Tracks evidence matching rates and verification latency (QR creation to dual match).',
        'Displays daily arrival trends comparing bank credit emails vs. Android push captures.',
        'Exports sanitized CSV reports with OWASP formula injection neutralization and masked account suffixes.'
      ],
      whatItDoesNot: [
        'Does NOT label payment intent volume as settled revenue or collected cash.',
        'Does NOT export sensitive OAuth tokens, raw payloads, or unmasked bank account numbers.',
        'Does NOT count deduplicated evidence as separate transactions.'
      ]
    }
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px 60px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto 60px' }}>
        <div style={{ display: 'inline-block', padding: '4px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#1E40AF', marginBottom: '16px' }}>
          Platform Capabilities & Architecture
        </div>
        <h1 style={{ fontSize: '38px', fontWeight: 800, color: '#111827', margin: '0 0 16px 0', letterSpacing: '-0.5px' }}>
          RGS Ledger Product Architecture
        </h1>
        <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#4B5563', margin: 0 }}>
          An honest, transparent breakdown of how RGS Ledger captures, normalizes, and reconciles UPI payments — and the strict architectural boundaries we uphold.
        </p>
      </div>

      {/* Product Modules List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {productModules.map((mod) => (
          <div
            key={mod.id}
            id={mod.id}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, background: '#DBEAFE', color: '#1E40AF', padding: '3px 8px', borderRadius: '4px' }}>
                {mod.badge}
              </span>
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#111827', margin: '0 0 6px 0' }}>
              {mod.title}
            </h2>
            <p style={{ fontSize: '14px', color: '#6B7280', margin: '0 0 24px 0' }}>
              {mod.tagline}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {/* What It Does */}
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '18px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#166534', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ✓ What It Does
                </h3>
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#14532D', lineHeight: 1.5 }}>
                  {mod.whatItDoes.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* What It Does NOT Do */}
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '18px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#991B1B', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ✗ What It Does NOT Do
                </h3>
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#7F1D1D', lineHeight: 1.5 }}>
                  {mod.whatItDoesNot.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Developer CTA Banner */}
      <div style={{ marginTop: '50px', background: '#1E293B', borderRadius: '16px', padding: '36px', color: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px 0' }}>Need Custom Integration?</h3>
          <p style={{ fontSize: '14px', color: '#94A3B8', margin: 0 }}>
            Read our complete developer documentation and explore our published SDK and OpenAPI spec.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <a
            href={APP_URLS.developerPortal}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', padding: '10px 20px', background: '#2563EB', color: '#FFF', borderRadius: '6px', fontSize: '13px', fontWeight: 600 }}
          >
            Developer Portal ↗
          </a>
          <button
            onClick={() => onNavigate('/register')}
            style={{ padding: '10px 20px', background: '#334155', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Create Account →
          </button>
        </div>
      </div>
    </div>
  );
};
