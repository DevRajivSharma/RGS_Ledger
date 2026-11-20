import React, { useState } from 'react';
import { APP_URLS } from '../config/urls.js';

export interface AuthPageProps {
  mode: 'login' | 'register';
  onNavigate: (path: string) => void;
  onAuthSuccess: (token: string, user: any, merchant: any) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode, onNavigate, onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [consentTerms, setConsentTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (mode === 'register' && !consentTerms) {
      setError('You must accept the Terms of Service and Privacy Policy to register.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const payload = mode === 'login'
        ? { email: email.trim().toLowerCase(), password }
        : {
            email: email.trim().toLowerCase(),
            password,
            merchantName: merchantName.trim(),
            upiVpa: upiVpa.trim()
          };

      const res = await fetch(`${APP_URLS.api}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        const msg = json.error?.message
          || (res.status === 401 ? 'Invalid email or password.' : undefined)
          || (res.status === 409 ? 'An account with this email address already exists.' : undefined)
          || 'Authentication failed. Please check your credentials.';
        setError(msg);
        return;
      }

      const token = json.data?.tokens?.accessToken || json.data?.accessToken;
      const user = json.data?.user;
      const merchant = json.data?.merchant;

      if (token && user) {
        localStorage.setItem('rgs_access_token', token);
        localStorage.setItem('rgs_user', JSON.stringify(user));
        onAuthSuccess(token, user, merchant);
      } else {
        setError('Authentication succeeded but tokens were missing.');
      }
    } catch {
      setError('Unable to reach the API server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '440px', margin: '40px auto 80px', padding: '0 20px' }}>
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '36px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#2563EB', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 800, fontSize: '20px', marginBottom: '12px' }}>
            RL
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#111827', margin: '0 0 6px 0' }}>
            {mode === 'login' ? 'Sign In to Merchant Portal' : 'Create Merchant Account'}
          </h1>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            {mode === 'login'
              ? 'Access payment requests, devices, and analytics.'
              : 'Join the public beta and start reconciling UPI payments.'}
          </p>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', fontSize: '13px', color: '#991B1B', lineHeight: 1.4 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {mode === 'register' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Business / Merchant Name *
                </label>
                <input
                  type="text"
                  required
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="e.g. Acme Stores"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Receiving UPI VPA (ID) *
                </label>
                <input
                  type="text"
                  required
                  value={upiVpa}
                  onChange={(e) => setUpiVpa(e.target.value)}
                  placeholder="e.g. merchant@yespop or 9876543210@upi"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: '11px', color: '#6B7280', display: 'block', marginTop: '3px' }}>
                  Customer payments settle directly into this account.
                </span>
              </div>
            </>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Business Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          {mode === 'register' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '4px' }}>
              <input
                type="checkbox"
                id="consentTerms"
                checked={consentTerms}
                onChange={(e) => setConsentTerms(e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <label htmlFor="consentTerms" style={{ fontSize: '12px', color: '#4B5563', lineHeight: 1.4 }}>
                I agree to the{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('/terms')}
                  style={{ background: 'none', border: 'none', color: '#2563EB', padding: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' }}
                >
                  Terms of Service
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('/privacy')}
                  style={{ background: 'none', border: 'none', color: '#2563EB', padding: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' }}
                >
                  Privacy Policy
                </button>
                .
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '11px',
              background: loading ? '#93C5FD' : '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '8px'
            }}
          >
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In →' : 'Register & Start Onboarding →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #F3F4F6', fontSize: '13px', color: '#6B7280' }}>
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={() => onNavigate('/register')}
                style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Register now
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button
                onClick={() => onNavigate('/login')}
                style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
