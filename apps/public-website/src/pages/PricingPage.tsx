import React from 'react';

export interface PricingPageProps {
  onNavigate: (path: string) => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onNavigate }) => {
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px 60px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto 50px' }}>
        <div style={{ display: 'inline-block', padding: '4px 12px', background: '#DBEAFE', border: '1px solid #BFDBFE', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#1E40AF', marginBottom: '16px' }}>
          Public Beta & Early Access
        </div>
        <h1 style={{ fontSize: '38px', fontWeight: 800, color: '#111827', margin: '0 0 16px 0', letterSpacing: '-0.5px' }}>
          Transparent Platform Access
        </h1>
        <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#4B5563', margin: 0 }}>
          RGS Ledger is currently in active Public Beta. We believe in clear, honest commercial terms without hidden surprises.
        </p>
      </div>

      {/* Pricing Card */}
      <div style={{ maxWidth: '640px', margin: '0 auto', background: '#FFFFFF', border: '2px solid #2563EB', borderRadius: '16px', padding: '40px', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#111827', margin: 0 }}>
              Early Access Beta Tier
            </h2>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>For merchants, developers, and pilot partners</span>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 800, background: '#D1FAE5', color: '#065F46', padding: '4px 10px', borderRadius: '20px', border: '1px solid #A7F3D0' }}>
            ACTIVE BETA
          </span>
        </div>

        <div style={{ margin: '24px 0', padding: '20px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#111827' }}>
            ₹0 <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748B' }}>/ during beta period</span>
          </div>
          <p style={{ fontSize: '13px', color: '#475569', margin: '8px 0 0 0', lineHeight: 1.5 }}>
            No transaction percentage fees. No setup charges. Customer payments settle directly into your bank account.
          </p>
        </div>

        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 14px 0' }}>
          Included In Public Beta:
        </h3>
        <ul style={{ margin: '0 0 28px 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
          <li>Unlimited dynamic UPI QR generation (NPCI 1.6 compliant).</li>
          <li>Full access to Merchant Dashboard and Payment Links.</li>
          <li>Hosted checkout sessions (`apps/hosted-checkout`).</li>
          <li>Gmail credit alert OAuth integration.</li>
          <li>Android Companion push notification capture.</li>
          <li>Dual-Source matching engine & dispute reconciliation.</li>
          <li>REST API keys, sandbox credentials, and Node.js SDK access.</li>
          <li>Financial analytics and OWASP formula-safe CSV reporting.</li>
        </ul>

        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '14px 16px', marginBottom: '24px', fontSize: '12px', color: '#92400E', lineHeight: 1.5 }}>
          <strong>Notice Regarding Commercial Terms: </strong>
          Commercial pricing and production subscription tiers have not yet been finalized. We do not claim permanent free tier guarantees. Any future billing updates will be announced with advance notice before transition from beta.
        </div>

        <button
          onClick={() => onNavigate('/register')}
          style={{
            width: '100%',
            padding: '14px',
            background: '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Create Beta Account →
        </button>
      </div>
    </div>
  );
};
