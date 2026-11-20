import React, { useState } from 'react';
import { APP_URLS } from '../config/urls.js';

export interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isAuthenticated?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, onNavigate, isAuthenticated }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Product', path: '/product' },
    { label: 'How It Works', path: '/how-it-works' },
    { label: 'Features', path: '/features' },
    { label: 'Android App', path: '/downloads/android' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'FAQ', path: '/faq' },
    { label: 'Contact', path: '/contact' }
  ];

  return (
    <nav style={{ background: '#FFFFFF', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => onNavigate('/')}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 800, fontSize: '18px' }}>
            RL
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}>RGS Ledger</span>
            <span style={{ fontSize: '10px', background: '#DBEAFE', color: '#1E40AF', padding: '2px 6px', borderRadius: '10px', fontWeight: 700 }}>
              PUBLIC BETA
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <div style={{ display: 'none', alignItems: 'center', gap: '22px' }} className="desktop-nav">
          {navLinks.map((item) => (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '14px',
                fontWeight: currentPath === item.path ? 700 : 500,
                color: currentPath === item.path ? '#2563EB' : '#4B5563',
                cursor: 'pointer',
                padding: '6px 0',
                borderBottom: currentPath === item.path ? '2px solid #2563EB' : '2px solid transparent'
              }}
            >
              {item.label}
            </button>
          ))}
          {/* External Developer Portal Link */}
          <a
            href={APP_URLS.developerPortal}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', fontSize: '14px', fontWeight: 500, color: '#4B5563' }}
          >
            Developers ↗
          </a>
        </div>

        {/* Desktop Action Buttons */}
        <div style={{ display: 'none', alignItems: 'center', gap: '10px' }} className="desktop-actions">
          {isAuthenticated ? (
            <a
              href={APP_URLS.merchantDashboard}
              style={{
                textDecoration: 'none',
                padding: '8px 16px',
                background: '#2563EB',
                color: '#FFF',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              Go to Dashboard →
            </a>
          ) : (
            <>
              <button
                onClick={() => onNavigate('/login')}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#374151',
                  cursor: 'pointer',
                  padding: '8px 12px'
                }}
              >
                Sign In
              </button>
              <button
                onClick={() => onNavigate('/register')}
                style={{
                  padding: '8px 16px',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Get Started
              </button>
            </>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            display: 'block',
            background: 'none',
            border: 'none',
            fontSize: '22px',
            color: '#374151',
            cursor: 'pointer',
            padding: '4px'
          }}
          className="mobile-toggle"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div style={{ background: '#FFFFFF', borderTop: '1px solid #E5E7EB', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {navLinks.map((item) => (
            <button
              key={item.path}
              onClick={() => {
                onNavigate(item.path);
                setMobileMenuOpen(false);
              }}
              style={{
                textAlign: 'left',
                background: 'none',
                border: 'none',
                fontSize: '15px',
                fontWeight: currentPath === item.path ? 700 : 500,
                color: currentPath === item.path ? '#2563EB' : '#374151',
                padding: '8px 0',
                cursor: 'pointer'
              }}
            >
              {item.label}
            </button>
          ))}
          <a
            href={APP_URLS.developerPortal}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', fontSize: '15px', fontWeight: 500, color: '#374151', padding: '8px 0' }}
          >
            Developers Documentation ↗
          </a>
          <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', borderTop: '1px solid #F3F4F6' }}>
            <button
              onClick={() => {
                onNavigate('/login');
                setMobileMenuOpen(false);
              }}
              style={{ flex: 1, padding: '9px', background: '#F3F4F6', color: '#111827', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                onNavigate('/register');
                setMobileMenuOpen(false);
              }}
              style={{ flex: 1, padding: '9px', background: '#2563EB', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* Basic media query styling */}
      <style>{`
        @media (min-width: 840px) {
          .desktop-nav { display: flex !important; }
          .desktop-actions { display: flex !important; }
          .mobile-toggle { display: none !important; }
        }
      `}</style>
    </nav>
  );
};
