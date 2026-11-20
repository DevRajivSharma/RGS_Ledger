import React from 'react';
import { APP_URLS } from '../config/urls.js';

export interface FooterProps {
  onNavigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer style={{ background: '#111827', color: '#9CA3AF', padding: '60px 20px 30px', marginTop: '60px', borderTop: '1px solid #374151' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '40px', marginBottom: '40px' }}>
          {/* Column 1: Brand & Philosophy */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 800 }}>
                RL
              </div>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF' }}>RGS Ledger</span>
            </div>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#9CA3AF', margin: '0 0 16px 0' }}>
              UPI payment collection and dual-source credit-alert evidence matching platform for businesses.
            </p>
            <div style={{ display: 'inline-block', padding: '4px 8px', background: '#1F2937', border: '1px solid #374151', borderRadius: '4px', fontSize: '11px', color: '#60A5FA', fontWeight: 600 }}>
              Zero-Custody Architecture
            </div>
          </div>

          {/* Column 2: Platform */}
          <div>
            <h4 style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 700, margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Platform
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <li>
                <button onClick={() => onNavigate('/product')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Product Overview
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/how-it-works')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  How It Works
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/features')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Feature Directory
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/downloads/android')} style={{ background: 'none', border: 'none', color: '#60A5FA', fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  📱 Download Android App
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/pricing')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Beta Access & Pricing
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/faq')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Frequently Asked Questions
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Developers */}
          <div>
            <h4 style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 700, margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Developers
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <li>
                <a href={APP_URLS.developerPortal} target="_blank" rel="noopener noreferrer" style={{ color: '#9CA3AF', textDecoration: 'none' }}>
                  Developer Portal ↗
                </a>
              </li>
              <li>
                <a href={`${APP_URLS.api}/openapi.json`} target="_blank" rel="noopener noreferrer" style={{ color: '#9CA3AF', textDecoration: 'none' }}>
                  OpenAPI 3.1 Specification ↗
                </a>
              </li>
              <li>
                <span style={{ color: '#6B7280' }}>Node.js SDK (`@rgs-ledger/sdk`)</span>
              </li>
              <li>
                <span style={{ color: '#6B7280' }}>Merchant Webhooks</span>
              </li>
            </ul>
          </div>

          {/* Column 4: Legal & Trust */}
          <div>
            <h4 style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 700, margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Trust & Legal
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <li>
                <button onClick={() => onNavigate('/terms')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Terms of Service (Draft)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/privacy')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Privacy Policy
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/security')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Security & Encryption
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/data-retention')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Data Retention Policy
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/acceptable-use')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Acceptable Use Policy
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('/contact')} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Contact Support
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Regulatory & Non-Custodial Architecture Disclosure */}
        <div style={{ background: '#1F2937', border: '1px solid #374151', borderRadius: '8px', padding: '16px 20px', marginBottom: '28px', fontSize: '12px', lineHeight: 1.6, color: '#D1D5DB' }}>
          <strong style={{ color: '#F3F4F6' }}>Critical Fintech Disclosure: </strong>
          RGS Ledger is an independent software platform providing UPI QR generation and automated credit-alert evidence matching. Money moves directly from customer bank accounts to merchant UPI receiving accounts via standard UPI banking rails. RGS Ledger is not a payment aggregator, does not hold customer or merchant balances, does not maintain wallets, and does not perform fund transfers or settlement. Payment &apos;SUCCESS&apos; denotes that both merchant-authorized Email and Android companion credit evidence were matched against the payment request, not direct bank rail authorization.
        </div>

        {/* Bottom Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: '12px', borderTop: '1px solid #1F2937', paddingTop: '20px' }}>
          <div>
            &copy; {new Date().getFullYear()} RGS Ledger. All rights reserved. Early Access Beta.
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span style={{ color: '#6B7280' }}>NPCI UPI URI Spec 1.6</span>
            <span style={{ color: '#6B7280' }}>Dual-Source Evidence Policy</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
