import React, { useState } from 'react';
import {
  Code2,
  Terminal,
  BookOpen,
  Key,
  Webhook,
  ShieldCheck,
  CreditCard,
  Copy,
  Check,
  ChevronRight,
  ExternalLink,
  Layers
} from 'lucide-react';

export const DeveloperPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'quickstart' | 'orders' | 'checkout' | 'refunds' | 'webhooks' | 'sandbox'>('quickstart');
  const [activeLang, setActiveLang] = useState<'node' | 'curl' | 'react' | 'python'>('node');
  const [copied, setCopied] = useState<string | null>(null);

  const copyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const snippets: Record<string, Record<string, string>> = {
    orders: {
      node: `import { RgsLedger } from '@rgs-ledger/sdk-node';

const rgs = new RgsLedger({
  keySecret: process.env.RGS_SECRET_KEY, // e.g. rl_test_sk_...
  baseUrl: 'http://localhost:4000/api/v1'
});

// Create Order (Amount in Paise: ₹499.00 = 49900 paise)
const order = await rgs.orders.create({
  amount: 49900,
  currency: 'INR',
  receipt: 'order_rcptid_11',
  customer: {
    name: 'Rahul Sharma',
    email: 'rahul@example.com',
    phone: '+919876543210'
  }
});

console.log('Order created:', order.id);`,
      curl: `curl -X POST http://localhost:4000/api/v1/orders \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer rl_test_sk_YOUR_SECRET_KEY" \\
  -H "Idempotency-Key: idemp_${Date.now()}" \\
  -d '{
    "amount": 49900,
    "currency": "INR",
    "receipt": "order_rcptid_11",
    "customer": {
      "name": "Rahul Sharma",
      "email": "rahul@example.com"
    }
  }'`,
      react: `// Using RGS React SDK Checkout Modal
import { RgsCheckoutModal, useRgsCheckout } from '@rgs-ledger/sdk-react';

function PaymentButton({ sessionId }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Pay Now</button>
      <RgsCheckoutModal
        isOpen={isOpen}
        sessionId={sessionId}
        onClose={() => setIsOpen(false)}
        onSuccess={(data) => console.log('Payment Captured:', data.paymentId)}
      />
    </>
  );
}`,
      python: `import requests

url = "http://localhost:4000/api/v1/orders"
headers = {
    "Authorization": "Bearer rl_test_sk_YOUR_SECRET_KEY",
    "Content-Type": "application/json"
}
payload = {
    "amount": 49900,
    "currency": "INR",
    "receipt": "order_rcptid_11"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`
    },
    webhooks: {
      node: `import crypto from 'crypto';
import express from 'express';

const app = express();

app.post('/api/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  const signatureHeader = req.headers['x-rgs-signature']; // format: t=timestamp,v1=signature
  const secret = process.env.RGS_WEBHOOK_SECRET;

  const parts = signatureHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).replace('t=', '');
  const signature = parts.find(p => p.startsWith('v1=')).replace('v1=', '');

  // Verify HMAC-SHA256 signature
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(\`\${timestamp}.\${req.body.toString()}\`)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSig, 'hex')
  );

  if (!isValid) return res.status(400).send('Invalid signature');

  const event = JSON.parse(req.body.toString());
  if (event.event === 'payment.succeeded') {
    console.log('Payment Succeeded:', event.data.paymentId);
  }

  res.status(200).json({ received: true });
});`,
      curl: `curl -X POST https://yourdomain.com/api/webhooks \\
  -H "Content-Type: application/json" \\
  -H "x-rgs-signature: t=1612345678,v1=9b8...hash" \\
  -H "x-rgs-event: payment.succeeded" \\
  -d '{"event":"payment.succeeded","data":{"paymentId":"pay_123"}}'`,
      react: `// Webhooks are processed server-side to preserve private signing secrets.`,
      python: `import hmac
import hashlib
import time

def verify_rgs_webhook(payload: bytes, sig_header: str, secret: str) -> bool:
    parts = dict(p.split('=') for p in sig_header.split(','))
    t, v1 = parts.get('t'), parts.get('v1')
    if not t or not v1:
        return False
    # Check timestamp replay tolerance
    if abs(time.time() - int(t)) > 300:
        return False
    computed = hmac.new(secret.encode(), f"{t}.{payload.decode()}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(v1, computed)`
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 bg-blue-600 rounded-lg flex items-center justify-center font-extrabold text-white text-base shadow-lg shadow-blue-500/20">
            RL
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-white">RGS Ledger</span>
            <span className="ml-2 text-xs font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
              Developer Portal
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <a
            href="http://localhost:5173"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-300 hover:text-white font-semibold flex items-center space-x-1"
          >
            <span>Merchant Dashboard ↗</span>
          </a>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Navigation Sidebar */}
        <aside className="w-64 border-r border-slate-800 p-6 space-y-6 shrink-0 hidden md:block">
          <div>
            <h4 className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Getting Started</h4>
            <div className="mt-2 space-y-1">
              <button
                onClick={() => setActiveTab('quickstart')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'quickstart' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Architecture & Quickstart
              </button>
              <button
                onClick={() => setActiveTab('sandbox')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'sandbox' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Sandbox Deterministic Testing
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">REST API Reference</h4>
            <div className="mt-2 space-y-1">
              <button
                onClick={() => setActiveTab('orders')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'orders' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Orders API
              </button>
              <button
                onClick={() => setActiveTab('checkout')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'checkout' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Hosted Checkout Sessions
              </button>
              <button
                onClick={() => setActiveTab('refunds')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'refunds' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Refunds API
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Events & Security</h4>
            <div className="mt-2 space-y-1">
              <button
                onClick={() => setActiveTab('webhooks')}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'webhooks' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                Webhooks & HMAC Verification
              </button>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-8 space-y-8 overflow-y-auto">
          {/* Quickstart Tab */}
          {activeTab === 'quickstart' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">RGS Ledger Developer Quickstart</h1>
                <p className="text-sm text-slate-400 mt-2">
                  Integrate UPI intent, dynamic QR, cards, and netbanking payments into your application in under 5 minutes.
                </p>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Key className="h-4 w-4 text-blue-400" />
                  <span>1. Authentication via API Key</span>
                </h3>
                <p className="text-xs text-slate-300">
                  Authenticate your server API requests by providing your merchant secret key in the Authorization header:
                </p>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-blue-400">
                  Authorization: Bearer rl_test_sk_your_key_here
                </div>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-emerald-400" />
                  <span>2. Payment Lifecycle & Flow</span>
                </h3>
                <ol className="list-decimal list-inside text-xs text-slate-300 space-y-2">
                  <li><strong>Create Order:</strong> Call <code>POST /api/v1/orders</code> with the amount in integer minor units (e.g. 50000 paise for ₹500.00).</li>
                  <li><strong>Create Checkout Session:</strong> Call <code>POST /api/v1/checkout/sessions</code> with the order ID to get a hosted checkout URL.</li>
                  <li><strong>Customer Pays:</strong> Customer scans the UPI QR code or selects card on the checkout screen.</li>
                  <li><strong>Webhook Notification:</strong> RGS Ledger delivers a signed <code>payment.succeeded</code> webhook to your backend with the transaction details.</li>
                </ol>
              </div>
            </div>
          )}

          {/* Orders API Tab */}
          {activeTab === 'orders' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <div className="flex items-center space-x-2 text-xs font-mono font-bold">
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded">POST</span>
                  <span className="text-slate-300">/api/v1/orders</span>
                </div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight mt-2">Create an Order</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Creates an authoritative payment intent. Amounts must strictly be provided in integer minor currency units (paise).
                </p>
              </div>

              {/* Language Selector */}
              <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
                {(['node', 'curl', 'react', 'python'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setActiveLang(lang)}
                    className={`px-3 py-1 rounded text-xs font-bold uppercase transition-all ${
                      activeLang === lang ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {lang === 'node' ? 'Node.js' : lang}
                  </button>
                ))}
              </div>

              {/* Code Snippet Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Example Request</span>
                  <button
                    onClick={() => copyCode('orders', snippets.orders[activeLang])}
                    className="flex items-center space-x-1 hover:text-white"
                  >
                    {copied === 'orders' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied === 'orders' ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                </div>
                <pre className="p-5 text-xs text-slate-200 overflow-x-auto leading-relaxed">
                  <code>{snippets.orders[activeLang]}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Webhooks Tab */}
          {activeTab === 'webhooks' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Webhooks & HMAC Verification</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Verify cryptographic signatures to guarantee payment events originated from RGS Ledger without tampering.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs text-slate-300">
                <h3 className="font-bold text-white text-sm">Signature Header Format:</h3>
                <p>Webhooks include the <code>x-rgs-signature</code> header containing a timestamp and HMAC-SHA256 hash:</p>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-blue-400">
                  x-rgs-signature: t=1730739900,v1=9b82f6e91029384756abcdef...
                </div>
              </div>

              {/* Code Snippet Box */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Node.js / Express Signature Verification</span>
                  <button
                    onClick={() => copyCode('webhooks', snippets.webhooks.node)}
                    className="flex items-center space-x-1 hover:text-white"
                  >
                    {copied === 'webhooks' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied === 'webhooks' ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                </div>
                <pre className="p-5 text-xs text-slate-200 overflow-x-auto leading-relaxed">
                  <code>{snippets.webhooks.node}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Sandbox Testing Guide Tab */}
          {activeTab === 'sandbox' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Deterministic Sandbox Testing</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Test every success, failure, and edge case scenario deterministically in the local sandbox engine.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
                <h3 className="font-bold text-white text-sm">Deterministic Order Amount Rules</h3>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                      <th className="py-2">Ending Paise</th>
                      <th className="py-2">Example Amount</th>
                      <th className="py-2">Simulated Gateway Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    <tr>
                      <td className="py-2 font-mono text-emerald-400 font-bold">.00</td>
                      <td className="py-2 font-mono">₹500.00 (50000 paise)</td>
                      <td className="py-2 text-emerald-400 font-semibold">Instant SUCCESS</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-mono text-rose-400 font-bold">.01</td>
                      <td className="py-2 font-mono">₹500.01 (50001 paise)</td>
                      <td className="py-2 text-rose-400 font-semibold">Declined by User / Bank Failure</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-mono text-amber-400 font-bold">.02</td>
                      <td className="py-2 font-mono">₹500.02 (50002 paise)</td>
                      <td className="py-2 text-amber-400 font-semibold">Asynchronous PENDING in UPI App</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
                <h3 className="font-bold text-white text-sm">Test Cards & UPI IDs</h3>
                <div className="space-y-2 font-mono text-slate-300">
                  <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800">
                    <span>Success UPI VPA:</span>
                    <span className="text-emerald-400 font-bold">success@rgs</span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800">
                    <span>Declined UPI VPA:</span>
                    <span className="text-rose-400 font-bold">fail@rgs</span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800">
                    <span>Success Visa Card:</span>
                    <span className="text-emerald-400 font-bold">4111 1111 1111 1111</span>
                  </div>
                  <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800">
                    <span>Insufficient Funds Card:</span>
                    <span className="text-rose-400 font-bold">4000 0000 0000 0002</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
