import { useState } from 'react';
import { NonCustodialDisclosureBanner } from '@rgs-ledger/ui';
import { openApiSpec } from './openapi.js';

type Tab =
  | 'overview'
  | 'getting-started'
  | 'authentication'
  | 'payments'
  | 'payment-links'
  | 'webhooks'
  | 'sdk'
  | 'errors'
  | 'troubleshooting'
  | 'explorer';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Interactive API Explorer States
  const [explorerEndpoint, setExplorerEndpoint] = useState<string>('create-payment');
  const [explorerBaseUrl, setExplorerBaseUrl] = useState<string>('http://localhost:4000');
  const [explorerKeyId, setExplorerKeyId] = useState<string>('rgs_test_demo1234567890');
  const [explorerSecret, setExplorerSecret] = useState<string>('rgs_sec_test_demo1234567890abcdef');
  const [explorerCustomRef, setExplorerCustomRef] = useState<string>('plink_sample123');
  const [explorerRequestBody, setExplorerRequestBody] = useState<string>(
    JSON.stringify(
      {
        amountPaise: 50000,
        orderId: `ORD-${Date.now().toString().slice(-6)}`,
        description: 'Test UPI payment in sandbox'
      },
      null,
      2
    )
  );
  const [explorerResponse, setExplorerResponse] = useState<{
    status: number;
    statusText: string;
    latencyMs: number;
    headers: Record<string, string>;
    body: any;
  } | null>(null);
  const [explorerLoading, setExplorerLoading] = useState<boolean>(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2500);
  };

  const handleEndpointSelect = (endpointKey: string) => {
    setExplorerEndpoint(endpointKey);
    setExplorerResponse(null);
    setExplorerError(null);

    if (endpointKey === 'create-payment') {
      setExplorerRequestBody(
        JSON.stringify(
          {
            amountPaise: 50000,
            orderId: `ORD-${Date.now().toString().slice(-6)}`,
            description: 'Test UPI payment in sandbox'
          },
          null,
          2
        )
      );
    } else if (endpointKey === 'create-payment-link') {
      setExplorerRequestBody(
        JSON.stringify(
          {
            title: 'Sample E-commerce Checkout Link',
            description: 'Digital goods purchase',
            amountPaise: 100000,
            isReusable: true
          },
          null,
          2
        )
      );
    } else if (endpointKey === 'register-webhook') {
      setExplorerRequestBody(
        JSON.stringify(
          {
            url: 'https://webhook.site/sample-endpoint',
            events: ['payment.success', 'payment.partial_success'],
            description: 'Staging notifications listener'
          },
          null,
          2
        )
      );
    } else if (endpointKey === 'initiate-link-checkout') {
      setExplorerRequestBody(
        JSON.stringify(
          {
            amountPaise: 75000,
            customerName: 'Aarav Sharma',
            customerPhone: '9876543210'
          },
          null,
          2
        )
      );
    } else {
      setExplorerRequestBody('');
    }
  };

  const handleExecuteSandboxRequest = async () => {
    setExplorerLoading(true);
    setExplorerError(null);
    setExplorerResponse(null);

    const startTime = Date.now();
    try {
      let path = '/api/v1/payments';
      let method = 'POST';
      let isPublic = false;

      if (explorerEndpoint === 'create-payment') {
        path = '/api/v1/payments';
        method = 'POST';
      } else if (explorerEndpoint === 'list-payments') {
        path = '/api/v1/payments?limit=10';
        method = 'GET';
      } else if (explorerEndpoint === 'create-payment-link') {
        path = '/api/v1/payment-links';
        method = 'POST';
      } else if (explorerEndpoint === 'list-payment-links') {
        path = '/api/v1/payment-links';
        method = 'GET';
      } else if (explorerEndpoint === 'get-public-link') {
        path = `/api/v1/checkout/link/${encodeURIComponent(explorerCustomRef.trim())}`;
        method = 'GET';
        isPublic = true;
      } else if (explorerEndpoint === 'initiate-link-checkout') {
        path = `/api/v1/checkout/link/${encodeURIComponent(explorerCustomRef.trim())}/initiate`;
        method = 'POST';
        isPublic = true;
      } else if (explorerEndpoint === 'register-webhook') {
        path = '/api/v1/webhooks/endpoints';
        method = 'POST';
      } else if (explorerEndpoint === 'list-webhook-deliveries') {
        path = '/api/v1/webhooks/deliveries?limit=10';
        method = 'GET';
      } else if (explorerEndpoint === 'health-check') {
        path = '/health';
        method = 'GET';
        isPublic = true;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'rgs-ledger-developer-portal/1.0'
      };

      if (!isPublic) {
        if (!explorerKeyId.trim() || !explorerSecret.trim()) {
          throw new Error('Sandbox Key ID and Secret are required for authenticated endpoints');
        }
        headers['X-API-Key'] = explorerKeyId.trim();
        headers['X-API-Secret'] = explorerSecret.trim();
      }

      const targetUrl = `${explorerBaseUrl.replace(/\/+$/, '')}${path}`;
      const options: RequestInit = {
        method,
        headers
      };

      if (method === 'POST' && explorerRequestBody.trim()) {
        try {
          JSON.parse(explorerRequestBody);
        } catch {
          throw new Error('Request body contains invalid JSON');
        }
        options.body = explorerRequestBody;
      }

      const res = await fetch(targetUrl, options);
      const latencyMs = Date.now() - startTime;

      const respHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        respHeaders[key] = val;
      });

      let jsonBody: any;
      const text = await res.text();
      try {
        jsonBody = JSON.parse(text);
      } catch {
        jsonBody = text;
      }

      setExplorerResponse({
        status: res.status,
        statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
        latencyMs,
        headers: respHeaders,
        body: jsonBody
      });
    } catch (err: any) {
      setExplorerError(err.message || 'Network request failed. Ensure your API server is running on the target port.');
    } finally {
      setExplorerLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#111827', backgroundColor: '#F9FAFB', minHeight: '100vh' }}>
      {/* Top Header */}
      <header style={{ background: '#111827', color: '#FFFFFF', borderBottom: '1px solid #374151', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em' }}>RGS Ledger</span>
              <span style={{ fontSize: '11px', background: '#3B82F6', color: '#FFFFFF', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                DEVELOPER PLATFORM
              </span>
              <span style={{ fontSize: '11px', background: '#374151', color: '#9CA3AF', padding: '2px 8px', borderRadius: '12px', fontFamily: 'monospace' }}>
                OpenAPI {openApiSpec.openapi} ({Object.keys(openApiSpec.paths).length} endpoints)
              </span>
            </div>
            <p style={{ color: '#9CA3AF', fontSize: '13px', margin: '4px 0 0 0' }}>
              Non-Custodial UPI QR Payment Collection & Dual-Source Evidence Matching API
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <a
              href="/openapi.json"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#93C5FD', fontSize: '12px', textDecoration: 'none', fontWeight: 600, border: '1px solid #1E40AF', padding: '6px 12px', borderRadius: '6px' }}
            >
              OpenAPI Spec (JSON)
            </a>
            <span style={{ color: '#10B981', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', backgroundColor: '#10B981', borderRadius: '50%', display: 'inline-block' }}></span>
              API Online
            </span>
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar Navigation */}
      <div style={{ maxWidth: '1200px', margin: '24px auto', padding: '0 20px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: '24px' }}>
        {/* Navigation Sidebar */}
        <aside style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '16px', height: 'fit-content', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', fontWeight: 700, marginBottom: '8px', paddingLeft: '8px' }}>
            Documentation
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[
              { id: 'overview', label: '📖 Overview & Architecture' },
              { id: 'getting-started', label: '🚀 Getting Started' },
              { id: 'authentication', label: '🔑 Authentication & Keys' },
              { id: 'payments', label: '💳 Payments API' },
              { id: 'payment-links', label: '🔗 Payment Links' },
              { id: 'webhooks', label: '🔔 Webhooks & HMAC' },
              { id: 'sdk', label: '📦 Node.js SDK' },
              { id: 'errors', label: '⚠️ Errors & Rate Limits' },
              { id: 'troubleshooting', label: '🛠 Troubleshooting & FAQ' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                style={{
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: activeTab === item.id ? 700 : 500,
                  cursor: 'pointer',
                  backgroundColor: activeTab === item.id ? '#EFF6FF' : 'transparent',
                  color: activeTab === item.id ? '#1D4ED8' : '#374151'
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', fontWeight: 700, margin: '20px 0 8px 0', paddingLeft: '8px' }}>
            Interactive Console
          </div>
          <button
            onClick={() => setActiveTab('explorer')}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '9px 12px',
              borderRadius: '6px',
              border: activeTab === 'explorer' ? '1px solid #93C5FD' : '1px solid #E5E7EB',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: activeTab === 'explorer' ? '#2563EB' : '#F3F4F6',
              color: activeTab === 'explorer' ? '#FFFFFF' : '#1F2937'
            }}
          >
            ⚡ API Sandbox Explorer
          </button>
        </aside>

        {/* Content Body */}
        <main style={{ minWidth: 0 }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 10px 0' }}>RGS Ledger Developer Overview</h1>
                <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: '22px', margin: 0 }}>
                  RGS Ledger is a developer-first, non-custodial UPI QR payment evidence and verification platform. It enables businesses to collect payments directly into their own current or savings bank accounts via standard NPCI UPI rails while cryptographically and structurally validating settlement evidence through a dual-channel evidence matching engine.
                </p>

                <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ padding: '16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
                      🚫 Zero Custody & Direct Settlement
                    </div>
                    <p style={{ fontSize: '13px', color: '#4B5563', lineHeight: '19px', margin: 0 }}>
                      Money moves directly from the customer&apos;s UPI application (GPay, PhonePe, Paytm, BHIM) to the merchant bank account. RGS Ledger never touches, holds, pools, or delays funds.
                    </p>
                  </div>

                  <div style={{ padding: '16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>
                      🛡️ Dual-Source Evidence Matching
                    </div>
                    <p style={{ fontSize: '13px', color: '#166534', lineHeight: '19px', margin: 0 }}>
                      Payments transition to <code>SUCCESS</code> only when confirmed independently by both bank credit notification email and Android Companion push notification for the same UTR.
                    </p>
                  </div>
                </div>
              </div>

              {/* Architecture Workflow Card */}
              <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>How Payment Verification Operates</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', lineHeight: '20px', color: '#374151' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#2563EB', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>1</span>
                    <div><strong>Create Payment:</strong> Your server calls <code>POST /api/v1/payments</code> or generates a Payment Link. RGS Ledger produces an NPCI UPI URI and dynamic QR code.</div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#2563EB', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>2</span>
                    <div><strong>Customer Scans & Pays:</strong> Customer scans the QR code or taps a mobile deep-link intent. Money reaches the merchant&apos;s bank immediately via IMPS/UPI.</div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#2563EB', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>3</span>
                    <div><strong>Independent Evidence Capture:</strong> Credit alerts arrive via Bank Email and Android Companion Push Notification.</div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#059669', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>4</span>
                    <div><strong>Dual-Source Verification & Webhook:</strong> Matching engine verifies UTR, amount, and account suffix from both sources. When both match, webhook <code>payment.success</code> is dispatched.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GETTING STARTED */}
          {activeTab === 'getting-started' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 10px 0' }}>Quickstart Integration Guide</h1>
                <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: '22px', margin: '0 0 20px 0' }}>
                  Integrate RGS Ledger into your Node.js, Next.js, or backend stack in under 10 minutes.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ padding: '16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px 0' }}>Step 1: Install Official Node.js SDK</h3>
                    <div style={{ background: '#111827', color: '#F3F4F6', padding: '12px 16px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>npm install @rgs-ledger/sdk</span>
                      <button
                        onClick={() => copyToClipboard('npm install @rgs-ledger/sdk', 'step1')}
                        style={{ background: '#374151', color: '#FFF', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        {copiedSnippet === 'step1' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: '16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px 0' }}>Step 2: Obtain API Credentials</h3>
                    <p style={{ fontSize: '13px', color: '#4B5563', margin: '0 0 10px 0' }}>
                      Log in to the Merchant Dashboard &rarr; <strong>🔑 API Keys</strong> tab. Generate a <strong>Sandbox</strong> API key. Note your public Key ID (<code>rgs_test_...</code>) and copy your secret (<code>rgs_sec_test_...</code>).
                    </p>
                  </div>

                  <div style={{ padding: '16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px 0' }}>Step 3: Create Your First UPI Payment</h3>
                    <pre style={{ background: '#111827', color: '#F3F4F6', padding: '16px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto', margin: 0 }}>
{`import { RgsLedgerClient } from '@rgs-ledger/sdk';

const client = new RgsLedgerClient({
  keyId: process.env.RGS_KEY_ID!,
  secret: process.env.RGS_API_SECRET!,
  baseUrl: 'http://localhost:4000' // or https://api.rgsledger.com
});

// Create payment request (50000 paise = ₹500.00)
const { payment, upiUri, qrDataUrl, checkoutUrl } = await client.payments.create({
  amountPaise: 50000,
  orderId: 'ORD-984712',
  description: 'Digital service purchase'
});

console.log('Payment Checkout URL:', checkoutUrl);
console.log('UPI Intent URI:', upiUri);`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUTHENTICATION */}
          {activeTab === 'authentication' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 10px 0' }}>API Authentication & Credentials</h1>
                <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: '22px', margin: '0 0 16px 0' }}>
                  The RGS Ledger API requires dual header authentication for all machine-to-machine integrations.
                </p>

                <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>Header Name</th>
                        <th style={{ padding: '10px 12px' }}>Format</th>
                        <th style={{ padding: '10px 12px' }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700 }}>X-API-Key</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>rgs_live_... / rgs_test_...</td>
                        <td style={{ padding: '10px 12px', color: '#4B5563' }}>Your public key identifier</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700 }}>X-API-Secret</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>rgs_sec_live_... / rgs_sec_test_...</td>
                        <td style={{ padding: '10px 12px', color: '#4B5563' }}>Your private secret (never share or commit)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ padding: '14px 18px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '12px', color: '#92400E', lineHeight: '18px' }}>
                  🔒 <strong>Cryptographic Hash Guarantee:</strong> Only the SHA-256 hash of your API secret is persisted in RGS Ledger databases. Raw secrets are shown only once upon generation. Incoming secrets are compared using constant-time <code>crypto.timingSafeEqual</code> to prevent timing attacks.
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PAYMENTS API */}
          {activeTab === 'payments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ background: '#059669', color: '#FFF', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px' }}>POST</span>
                  <code style={{ fontSize: '16px', fontWeight: 700 }}>/api/v1/payments</code>
                </div>
                <p style={{ color: '#4B5563', fontSize: '14px', margin: '0 0 16px 0' }}>
                  Generates an isolated payment request, complete with NPCI UPI intent URI and base64 QR code.
                </p>

                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '16px 0 8px 0' }}>Request Body</h3>
                <pre style={{ background: '#111827', color: '#F3F4F6', padding: '14px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto' }}>
{`{
  "amountPaise": 50000,           // Required: Amount in paise (50000 = ₹500.00, min 100)
  "orderId": "INV-2026-001",       // Required: Merchant unique order reference
  "description": "Annual Hosting", // Optional: Transaction note on customer screen
  "bankAccountId": "...",          // Optional: Target collection account ObjectId
  "expiresAt": "2026-11-20T...",   // Optional: Custom ISO expiration timestamp
  "metadata": { "user": "u123" }   // Optional: Arbitrary key-value metadata
}`}
                </pre>

                <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '16px 0 8px 0' }}>Payment Status Lifecycle</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '10px' }}>
                  <div style={{ padding: '10px', background: '#F3F4F6', borderRadius: '6px', fontSize: '12px' }}>
                    <strong style={{ color: '#4B5563' }}>PENDING</strong>
                    <div style={{ color: '#6B7280', fontSize: '11px', marginTop: '2px' }}>QR generated, awaiting customer payment</div>
                  </div>
                  <div style={{ padding: '10px', background: '#FEF3C7', borderRadius: '6px', fontSize: '12px' }}>
                    <strong style={{ color: '#B45309' }}>PARTIAL_SUCCESS</strong>
                    <div style={{ color: '#92400E', fontSize: '11px', marginTop: '2px' }}>Exactly one evidence source matched</div>
                  </div>
                  <div style={{ padding: '10px', background: '#DEF7EC', borderRadius: '6px', fontSize: '12px' }}>
                    <strong style={{ color: '#03543F' }}>SUCCESS</strong>
                    <div style={{ color: '#047857', fontSize: '11px', marginTop: '2px' }}>Both Email AND Android evidence matched</div>
                  </div>
                  <div style={{ padding: '10px', background: '#FEE2E2', borderRadius: '6px', fontSize: '12px' }}>
                    <strong style={{ color: '#991B1B' }}>REVIEW_REQUIRED</strong>
                    <div style={{ color: '#B91C1C', fontSize: '11px', marginTop: '2px' }}>Conflicting data or amount mismatch</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PAYMENT LINKS */}
          {activeTab === 'payment-links' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 10px 0' }}>Payment Links API</h1>
                <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: '22px', margin: '0 0 16px 0' }}>
                  Create shareable payment links that support fixed pricing or open customer-defined donations/invoices.
                </p>

                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '14px', borderRadius: '8px', fontSize: '13px', color: '#1E40AF', lineHeight: '19px', marginBottom: '16px' }}>
                  💡 <strong>Isolation Guarantee:</strong> When multiple customers pay using a reusable payment link (<code>plink_...</code>), each checkout initiation creates an isolated <code>PaymentRequest</code> with a unique <code>orderId</code>, distinct <code>checkoutReference</code>, and independent dual-source verification lifecycle. Evidence is never shared or reused across payments.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ background: '#059669', color: '#FFF', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px' }}>POST</span>
                  <code style={{ fontSize: '16px', fontWeight: 700 }}>/api/v1/payment-links</code>
                </div>
                <pre style={{ background: '#111827', color: '#F3F4F6', padding: '14px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto' }}>
{`// Create an open-amount (customer-defined) payment link
{
  "title": "Open Invoice Payment",
  "amountPaise": null,           // null allows customer to input amount on checkout
  "isReusable": true,             // allows multiple independent customer checkouts
  "expiresAt": null               // null = no expiration
}`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 6: WEBHOOKS */}
          {activeTab === 'webhooks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 10px 0' }}>Webhook Notifications & HMAC Verification</h1>
                <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: '22px', margin: '0 0 16px 0' }}>
                  RGS Ledger delivers real-time HTTP POST notifications signed with HMAC-SHA256 to your configured endpoints.
                </p>

                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '16px 0 8px 0' }}>Signature Header Specification</h3>
                <p style={{ fontSize: '13px', color: '#4B5563', margin: '0 0 8px 0' }}>
                  Every delivery includes the header <code>X-RGS-Signature</code> formatted as:
                </p>
                <div style={{ background: '#111827', color: '#38BDF8', padding: '12px 16px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '13px' }}>
                  X-RGS-Signature: t=1731849200,v1=5d41402abc4b2a76b9719d911017c592...
                </div>

                <div style={{ marginTop: '16px', padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', fontSize: '12px', color: '#166534', lineHeight: '18px' }}>
                  🛡️ <strong>Replay Protection:</strong> Signatures are bound to the timestamp <code>t</code>. The SDK automatically verifies that <code>Math.abs(currentTime - t) &le; 300 seconds</code> (5 minutes). Old or manipulated timestamps are rejected immediately.
                </div>

                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '20px 0 8px 0' }}>Node.js Express Receiver Example</h3>
                <pre style={{ background: '#111827', color: '#F3F4F6', padding: '16px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto', margin: 0 }}>
{`import express from 'express';
import { RgsLedgerClient } from '@rgs-ledger/sdk';

const app = express();
const WEBHOOK_SECRET = process.env.RGS_WEBHOOK_SECRET!;

// Note: Use express.raw() or keep raw payload string for HMAC validation
app.post('/webhooks/rgs', express.raw({ type: 'application/json' }), (req, res) => {
  const rawBody = req.body.toString('utf8');
  const signatureHeader = req.headers['x-rgs-signature'] as string;

  // Cryptographic HMAC & 300s replay window verification
  const verification = RgsLedgerClient.verifyWebhookSignature(rawBody, signatureHeader, WEBHOOK_SECRET);
  if (!verification.valid) {
    console.error('Invalid webhook signature:', verification.reason);
    return res.status(401).send('Unauthorized webhook signature');
  }

  const event = JSON.parse(rawBody);
  console.log('Received verified event:', event.event, event.data);

  if (event.event === 'payment.success') {
    // Both Email and Android evidence matched: fulfill order
    console.log('Fulfilling order:', event.data.orderId);
  }

  res.status(200).json({ received: true });
});

app.listen(3000);`}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 7: SDK */}
          {activeTab === 'sdk' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 10px 0' }}>Official Node.js SDK Reference</h1>
                <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: '22px', margin: '0 0 16px 0' }}>
                  The <code>@rgs-ledger/sdk</code> library provides fully typed client bindings, automated error handling, and cryptographic helpers.
                </p>

                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '16px 0 8px 0' }}>Typed Methods Overview</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ padding: '12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                    <code style={{ fontWeight: 700, color: '#1D4ED8' }}>client.payments.create(params)</code>
                    <p style={{ fontSize: '12px', color: '#4B5563', margin: '4px 0 0 0' }}>Creates payment request with orderId, amountPaise, and returns upiUri & qrDataUrl.</p>
                  </div>
                  <div style={{ padding: '12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                    <code style={{ fontWeight: 700, color: '#1D4ED8' }}>client.payments.get(id)</code>
                    <p style={{ fontSize: '12px', color: '#4B5563', margin: '4px 0 0 0' }}>Fetches payment status and dual-source evidence verification progress.</p>
                  </div>
                  <div style={{ padding: '12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                    <code style={{ fontWeight: 700, color: '#1D4ED8' }}>client.paymentLinks.create(params)</code>
                    <p style={{ fontSize: '12px', color: '#4B5563', margin: '4px 0 0 0' }}>Creates fixed or open-amount payment links with public checkout URLs.</p>
                  </div>
                  <div style={{ padding: '12px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                    <code style={{ fontWeight: 700, color: '#1D4ED8' }}>client.webhooks.verifySignature(rawBody, signature, secret)</code>
                    <p style={{ fontSize: '12px', color: '#4B5563', margin: '4px 0 0 0' }}>Validates incoming webhook authenticity with timing-safe comparison and replay protection.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: ERRORS & RATE LIMITS */}
          {activeTab === 'errors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 10px 0' }}>Error Codes & Rate Limits</h1>
                <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: '22px', margin: '0 0 16px 0' }}>
                  All errors return structured JSON envelopes conforming to <code>ErrorEnvelope</code>.
                </p>

                <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>Code</th>
                        <th style={{ padding: '10px 12px' }}>HTTP Status</th>
                        <th style={{ padding: '10px 12px' }}>Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#DC2626' }}>INVALID_API_KEY</td>
                        <td style={{ padding: '10px 12px' }}>401 Unauthorized</td>
                        <td style={{ padding: '10px 12px', color: '#4B5563' }}>API key not found, inactive, or revoked</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#DC2626' }}>INVALID_API_SECRET</td>
                        <td style={{ padding: '10px 12px' }}>401 Unauthorized</td>
                        <td style={{ padding: '10px 12px', color: '#4B5563' }}>Secret does not match the hashed record</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#DC2626' }}>FORBIDDEN</td>
                        <td style={{ padding: '10px 12px' }}>403 Forbidden</td>
                        <td style={{ padding: '10px 12px', color: '#4B5563' }}>API key lacks required scope (e.g. <code>payments:write</code>)</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#DC2626' }}>VALIDATION_ERROR</td>
                        <td style={{ padding: '10px 12px' }}>400 Bad Request</td>
                        <td style={{ padding: '10px 12px', color: '#4B5563' }}>Schema validation failure (e.g. amount &lt; 100 paise)</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#DC2626' }}>SSRF_PROTECTION_ERROR</td>
                        <td style={{ padding: '10px 12px' }}>400 Bad Request</td>
                        <td style={{ padding: '10px 12px', color: '#4B5563' }}>Webhook URL resolves to forbidden/private IP</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#DC2626' }}>RATE_LIMIT_EXCEEDED</td>
                        <td style={{ padding: '10px 12px' }}>429 Too Many Requests</td>
                        <td style={{ padding: '10px 12px', color: '#4B5563' }}>Exceeded 100 req/min threshold</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: TROUBLESHOOTING */}
          {activeTab === 'troubleshooting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 10px 0' }}>Integration Troubleshooting & FAQ</h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                  <div style={{ padding: '16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                    <strong style={{ fontSize: '14px', color: '#111827' }}>Why does a payment stay on PARTIAL_SUCCESS?</strong>
                    <p style={{ fontSize: '13px', color: '#4B5563', margin: '6px 0 0 0', lineHeight: '19px' }}>
                      RGS Ledger requires <strong>both Email and Android evidence</strong> before marking a transaction <code>SUCCESS</code>. If your companion phone is disconnected, offline, or lacks notification listener permissions, only email evidence was ingested. Ensure your companion phone is online with active notification access.
                    </p>
                  </div>

                  <div style={{ padding: '16px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                    <strong style={{ fontSize: '14px', color: '#111827' }}>Why did my webhook registration fail with SSRF_PROTECTION_ERROR?</strong>
                    <p style={{ fontSize: '13px', color: '#4B5563', margin: '6px 0 0 0', lineHeight: '19px' }}>
                      In production environments, endpoints resolving to localhost (<code>127.0.0.1</code>), cloud metadata (<code>169.254.169.254</code>), or private RFC 1918 subnets (<code>10.x</code>, <code>192.168.x</code>) are strictly blocked to protect infrastructure. Use a valid public HTTPS domain or tunneling service (e.g. ngrok / webhook.site) for testing.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: API SANDBOX EXPLORER */}
          {activeTab === 'explorer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>⚡ API Sandbox Explorer</h2>
                    <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>
                      Execute real HTTP sandbox requests directly against your local or test environment.
                    </p>
                  </div>
                  <span style={{ fontSize: '11px', background: '#FEF3C7', color: '#92400E', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    SANDBOX MODE ONLY
                  </span>
                </div>

                {/* Explorer Configuration Bar */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#F9FAFB', padding: '14px', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4B5563', marginBottom: '4px' }}>
                      API Server Base URL
                    </label>
                    <input
                      type="text"
                      value={explorerBaseUrl}
                      onChange={(e) => setExplorerBaseUrl(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4B5563', marginBottom: '4px' }}>
                      Select Endpoint
                    </label>
                    <select
                      value={explorerEndpoint}
                      onChange={(e) => handleEndpointSelect(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                    >
                      <option value="create-payment">POST /api/v1/payments (Create Payment)</option>
                      <option value="list-payments">GET /api/v1/payments (List Payments)</option>
                      <option value="create-payment-link">POST /api/v1/payment-links (Create Payment Link)</option>
                      <option value="list-payment-links">GET /api/v1/payment-links (List Payment Links)</option>
                      <option value="get-public-link">GET /api/v1/checkout/link/:linkRef (Public Link)</option>
                      <option value="initiate-link-checkout">POST /api/v1/checkout/link/:linkRef/initiate (Initiate Checkout)</option>
                      <option value="register-webhook">POST /api/v1/webhooks/endpoints (Register Webhook)</option>
                      <option value="list-webhook-deliveries">GET /api/v1/webhooks/deliveries (Deliveries)</option>
                      <option value="health-check">GET /health (Health Check)</option>
                    </select>
                  </div>
                </div>

                {/* Sandbox Credentials Bar */}
                {!['get-public-link', 'initiate-link-checkout', 'health-check'].includes(explorerEndpoint) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#F9FAFB', padding: '14px', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4B5563', marginBottom: '4px' }}>
                        Sandbox Key ID (X-API-Key)
                      </label>
                      <input
                        type="text"
                        placeholder="rgs_test_..."
                        value={explorerKeyId}
                        onChange={(e) => setExplorerKeyId(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4B5563', marginBottom: '4px' }}>
                        Sandbox Secret (X-API-Secret)
                      </label>
                      <input
                        type="password"
                        placeholder="rgs_sec_test_..."
                        value={explorerSecret}
                        onChange={(e) => setExplorerSecret(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                      />
                    </div>
                  </div>
                )}

                {/* Link Reference input if testing link checkout */}
                {['get-public-link', 'initiate-link-checkout'].includes(explorerEndpoint) && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4B5563', marginBottom: '4px' }}>
                      Payment Link Reference (plink_...)
                    </label>
                    <input
                      type="text"
                      value={explorerCustomRef}
                      onChange={(e) => setExplorerCustomRef(e.target.value)}
                      placeholder="plink_..."
                      style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: '13px', fontFamily: 'monospace', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                    />
                  </div>
                )}

                {/* Request Body Area (if POST) */}
                {explorerRequestBody && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#4B5563', marginBottom: '4px' }}>
                      JSON Request Payload
                    </label>
                    <textarea
                      rows={6}
                      value={explorerRequestBody}
                      onChange={(e) => setExplorerRequestBody(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#111827', color: '#F3F4F6' }}
                    />
                  </div>
                )}

                {/* Action Button */}
                <button
                  onClick={handleExecuteSandboxRequest}
                  disabled={explorerLoading}
                  style={{
                    padding: '10px 20px',
                    background: explorerLoading ? '#93C5FD' : '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: explorerLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {explorerLoading ? 'Executing Request...' : '▶ Send Sandbox Request'}
                </button>

                {/* Error Banner */}
                {explorerError && (
                  <div style={{ marginTop: '16px', padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', color: '#991B1B', fontSize: '13px' }}>
                    <strong>Execution Error:</strong> {explorerError}
                  </div>
                )}

                {/* Response Viewer */}
                {explorerResponse && (
                  <div style={{ marginTop: '20px', borderTop: '1px solid #E5E7EB', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: explorerResponse.status < 300 ? '#DEF7EC' : '#FEE2E2',
                            color: explorerResponse.status < 300 ? '#03543F' : '#991B1B'
                          }}
                        >
                          HTTP {explorerResponse.status} {explorerResponse.statusText}
                        </span>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>
                          Latency: <strong>{explorerResponse.latencyMs}ms</strong>
                        </span>
                      </div>
                    </div>

                    <pre style={{ background: '#111827', color: '#F3F4F6', padding: '16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto', maxHeight: '400px' }}>
                      {JSON.stringify(explorerResponse.body, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer style={{ marginTop: '40px', paddingBottom: '30px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <NonCustodialDisclosureBanner />
        </div>
      </footer>
    </div>
  );
}
