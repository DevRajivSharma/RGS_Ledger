import React from 'react';
import { APP_URLS, getMerchantSignupUrl } from '../config/urls.js';

export interface HomePageProps {
  onNavigate: (path: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '80px', paddingBottom: '40px' }}>
      {/* 1. Hero Section */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 20px 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '48px', alignItems: 'center' }}>
          {/* Left Column: Value Proposition */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '20px', marginBottom: '20px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E40AF' }}>Zero-Custody UPI Infrastructure</span>
              <span style={{ fontSize: '11px', color: '#6B7280' }}>&bull; Direct Bank Settlement</span>
            </div>
            <h1 style={{ fontSize: '42px', fontWeight: 800, lineHeight: 1.15, color: '#111827', margin: '0 0 20px 0', letterSpacing: '-1px' }}>
              UPI Payments. Clear Evidence. Better Reconciliation.
            </h1>
            <p style={{ fontSize: '17px', lineHeight: 1.6, color: '#4B5563', margin: '0 0 32px 0' }}>
              Generate UPI payment requests using your own receiving account and reconcile incoming credit alerts through merchant-authorized email and Android notification evidence.
            </p>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <a
                href={getMerchantSignupUrl()}
                style={{
                  display: 'inline-block',
                  textDecoration: 'none',
                  padding: '12px 26px',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                }}
              >
                Start for Free →
              </a>
              <button
                onClick={() => onNavigate('/how-it-works')}
                style={{
                  padding: '12px 24px',
                  background: '#FFFFFF',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Explore How It Works
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '32px', fontSize: '12px', color: '#6B7280' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>✓ No Aggregator Cut</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>✓ Direct VPA Credit</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>✓ Dual-Source Proof</span>
            </div>
          </div>

          {/* Right Column: Realistic Product UI Preview */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F3F4F6', paddingBottom: '14px', marginBottom: '18px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>Live Matching Engine</span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#111827' }}>Payment Request #ORD-849201</div>
              </div>
              <span style={{ fontSize: '11px', background: '#D1FAE5', color: '#065F46', padding: '4px 10px', borderRadius: '20px', fontWeight: 800, border: '1px solid #A7F3D0' }}>
                SUCCESS
              </span>
            </div>

            {/* Request Summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px', background: '#F9FAFB', padding: '12px 16px', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Amount Requested</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#111827' }}>₹1,500.00</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>Receiving UPI VPA</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#2563EB' }}>merchant@yespop</div>
              </div>
            </div>

            {/* Evidence Verification Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '10px 14px', background: '#FAFAFA' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✉️</span> Source 1: Gmail Bank Credit Alert
                  </span>
                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>MATCHED ✓</span>
                </div>
                <div style={{ fontSize: '11px', color: '#4B5563' }}>
                  UTR: <strong>432109876543</strong> &bull; Suffix: ***0562 &bull; Amount: ₹1,500.00
                </div>
              </div>

              <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '10px 14px', background: '#FAFAFA' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📱</span> Source 2: Android Companion Push
                  </span>
                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>MATCHED ✓</span>
                </div>
                <div style={{ fontSize: '11px', color: '#4B5563' }}>
                  Device: OnePlus Nord CE 2 &bull; UTR: <strong>432109876543</strong> &bull; Amount: ₹1,500.00
                </div>
              </div>
            </div>

            {/* Dual-Source Satisfaction Footnote */}
            <div style={{ fontSize: '11px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '6px', borderTop: '1px solid #F3F4F6', paddingTop: '10px' }}>
              <span style={{ color: '#10B981', fontWeight: 700 }}>●</span> Dual-Source policy verified: Webhook event dispatched.
            </div>
          </div>
        </div>
      </section>

      {/* 2. Product Explanation: 6-Step Direct Cycle */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', maxWidth: '760px', margin: '0 auto 48px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#111827', margin: '0 0 12px 0' }}>
            How RGS Ledger Works For Businesses
          </h2>
          <p style={{ fontSize: '16px', color: '#6B7280', margin: 0, lineHeight: 1.6 }}>
            Eliminate aggregator middleman custody. You configure your existing merchant UPI ID, generate payment requests, and let our dual-source engine confirm incoming credit evidence.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {[
            { step: '01', title: 'Create Payment Request', desc: 'Create dynamic fixed-amount or open-amount payment requests via Dashboard, REST API, or Payment Links.' },
            { step: '02', title: 'Customer Pays via UPI', desc: 'Customer scans the dynamic QR with GPay, PhonePe, Paytm, or BHIM. Funds transfer directly to your bank account.' },
            { step: '03', title: 'Email Evidence Capture', desc: 'Bank credit alert emails received on merchant-authorized Gmail or Outlook are captured and normalized.' },
            { step: '04', title: 'Android Companion Capture', desc: 'Your Android device captures native banking notification credit alerts via NotificationListenerService.' },
            { step: '05', title: 'Dual-Source Matching', desc: 'The engine matches both evidence sources against UTR, amount, account suffix, and timestamp before marking SUCCESS.' },
            { step: '06', title: 'Instant Webhooks & Reports', desc: 'Real-time webhook events notify your backend, and financial CSV reports provide instant audit readiness.' }
          ].map((s) => (
            <div key={s.step} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px', position: 'relative' }}>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#E0E7FF', marginBottom: '10px' }}>{s.step}</div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>{s.title}</h3>
              <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#4B5563', margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Non-Custodial Architecture Disclosure */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ background: '#FFFBEB', border: '2px solid #FCD34D', borderRadius: '16px', padding: '36px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🛡️</span>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#92400E', margin: 0 }}>
              Your Money Goes Directly to Your Bank Account
            </h2>
          </div>
          <p style={{ fontSize: '15px', lineHeight: 1.6, color: '#78350F', margin: 0 }}>
            RGS Ledger is strictly a software intelligence and evidence reconciliation layer. Unlike conventional payment gateways, <strong>we never sit in the flow of your money</strong>:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginTop: '10px' }}>
            <div style={{ background: '#FFFFFF', padding: '14px 18px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
              <strong style={{ color: '#92400E', fontSize: '13px' }}>🚫 No Custody or Wallets:</strong>
              <p style={{ fontSize: '12px', color: '#78350F', margin: '4px 0 0 0' }}>We do not hold customer funds or merchant balances.</p>
            </div>
            <div style={{ background: '#FFFFFF', padding: '14px 18px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
              <strong style={{ color: '#92400E', fontSize: '13px' }}>⚡ Direct UPI Settlement:</strong>
              <p style={{ fontSize: '12px', color: '#78350F', margin: '4px 0 0 0' }}>Payments settle immediately into your existing bank account via UPI rails.</p>
            </div>
            <div style={{ background: '#FFFFFF', padding: '14px 18px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
              <strong style={{ color: '#92400E', fontSize: '13px' }}>🔍 Evidence-Based SUCCESS:</strong>
              <p style={{ fontSize: '12px', color: '#78350F', margin: '4px 0 0 0' }}>SUCCESS signifies dual-source credit alert matching, not direct bank scraping.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Core Features Overview */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ textAlign: 'center', maxWidth: '760px', margin: '0 auto 48px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#111827', margin: '0 0 12px 0' }}>
            Built for Robust Merchant Operations
          </h2>
          <p style={{ fontSize: '16px', color: '#6B7280', margin: 0, lineHeight: 1.6 }}>
            Everything you need to accept direct UPI payments and eliminate manual reconciliation headaches.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          {[
            { icon: '📱', title: 'Dynamic UPI QR Codes', desc: 'Standard NPCI UPI URI Specification 1.6 compliant. Generates high-resolution QR images and intent links.' },
            { icon: '🔗', title: 'Payment Links & Checkout', desc: 'Shareable fixed or open-amount payment links with expiration dates, description, and hosted checkout.' },
            { icon: '✉️', title: 'Gmail Evidence Ingestion', desc: 'OAuth-based read-only Gmail integration parsing bank credit emails with merchant-approved templates.' },
            { icon: '📲', title: 'Android Companion Service', desc: 'Native Kotlin notification listener running on your merchant device, encrypting and syncing push notifications.' },
            { icon: '🎯', title: 'Dual-Source Matching', desc: 'Authoritative matching engine requiring independent confirmation from both channels before marking SUCCESS.' },
            { icon: '⚖️', title: 'Dispute Reconciliation', desc: 'Manage late arrivals, amount mismatches, duplicate UTRs, and partial payments with audit history.' },
            { icon: '📊', title: 'Analytics & Sanitized CSV', desc: 'Daily intent vs. confirmed volume metrics, matching latency tracking, and OWASP formula-safe CSV exports.' },
            { icon: '🔔', title: 'Durable Merchant Webhooks', desc: 'HMAC SHA-256 signed webhooks with exponential backoff delivery for PAYMENT_SUCCESS and PARTIAL_SUCCESS.' }
          ].map((f) => (
            <div key={f.title} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px' }}>
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>{f.icon}</div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>{f.title}</h3>
              <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#4B5563', margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Developer Section */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ background: '#111827', borderRadius: '16px', padding: '48px 36px', color: '#FFFFFF', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '40px', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Developer-First APIs
            </span>
            <h2 style={{ fontSize: '28px', fontWeight: 800, margin: '8px 0 16px 0', letterSpacing: '-0.5px' }}>
              Integrate in Minutes With Our REST API & SDK
            </h2>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#9CA3AF', margin: '0 0 24px 0' }}>
              Full API key management, sandbox testing credentials, HMAC-SHA256 signed webhooks, and our published Node.js client (`@rgs-ledger/sdk`).
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <a
                href={APP_URLS.developerPortal}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  textDecoration: 'none',
                  padding: '10px 20px',
                  background: '#2563EB',
                  color: '#FFF',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                Developer Portal ↗
              </a>
              <a
                href={`${APP_URLS.api}/openapi.json`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  textDecoration: 'none',
                  padding: '10px 20px',
                  background: '#1F2937',
                  color: '#D1D5DB',
                  border: '1px solid #374151',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                OpenAPI Spec ↗
              </a>
            </div>
          </div>

          {/* Code Snippet Box */}
          <div style={{ background: '#0F172A', border: '1px solid #334155', borderRadius: '10px', padding: '20px', fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto', lineHeight: 1.5, color: '#E2E8F0' }}>
            <div style={{ color: '#64748B', marginBottom: '8px' }}>// Create UPI payment with @rgs-ledger/sdk</div>
            <div><span style={{ color: '#F472B6' }}>import</span> &#123; RgsLedgerClient &#125; <span style={{ color: '#F472B6' }}>from</span> <span style={{ color: '#A5B4FC' }}>&apos;@rgs-ledger/sdk&apos;</span>;</div>
            <br />
            <div><span style={{ color: '#38BDF8' }}>const</span> client = <span style={{ color: '#F472B6' }}>new</span> <span style={{ color: '#38BDF8' }}>RgsLedgerClient</span>(&#123;</div>
            <div style={{ paddingLeft: '16px' }}>keyId: <span style={{ color: '#A5B4FC' }}>&apos;rgs_live_abc123&apos;</span>,</div>
            <div style={{ paddingLeft: '16px' }}>secret: <span style={{ color: '#A5B4FC' }}>&apos;rgs_sec_xyz789&apos;</span></div>
            <div>&#125;);</div>
            <br />
            <div><span style={{ color: '#38BDF8' }}>const</span> payment = <span style={{ color: '#F472B6' }}>await</span> client.payments.<span style={{ color: '#34D399' }}>create</span>(&#123;</div>
            <div style={{ paddingLeft: '16px' }}>amountPaise: <span style={{ color: '#FBBF24' }}>150000</span>, <span style={{ color: '#64748B' }}>// ₹1,500.00</span></div>
            <div style={{ paddingLeft: '16px' }}>orderId: <span style={{ color: '#A5B4FC' }}>&apos;ORD-849201&apos;</span>,</div>
            <div style={{ paddingLeft: '16px' }}>description: <span style={{ color: '#A5B4FC' }}>&apos;Pro Subscription&apos;</span></div>
            <div>&#125;);</div>
            <br />
            <div style={{ color: '#34D399' }}>console.log(payment.qrDataUrl, payment.upiUri);</div>
          </div>
        </div>
      </section>

      {/* 6. Final Call to Action */}
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '16px', padding: '48px 32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '30px', fontWeight: 800, color: '#1E3A8A', margin: '0 0 12px 0' }}>
            Ready to Take Control of Your UPI Collections?
          </h2>
          <p style={{ fontSize: '15px', color: '#1E40AF', maxWidth: '600px', margin: '0 auto 28px', lineHeight: 1.6 }}>
            Join our Early Access Beta. Set up your receiving UPI ID, pair your companion device, and start receiving payments directly without custody middlemen.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <a
              href={getMerchantSignupUrl()}
              style={{
                display: 'inline-block',
                textDecoration: 'none',
                padding: '12px 30px',
                background: '#2563EB',
                color: '#FFF',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Get Started for Free →
            </a>
            <button
              onClick={() => onNavigate('/contact')}
              style={{
                padding: '12px 24px',
                background: '#FFFFFF',
                color: '#1E40AF',
                border: '1px solid #BFDBFE',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Contact Support
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
