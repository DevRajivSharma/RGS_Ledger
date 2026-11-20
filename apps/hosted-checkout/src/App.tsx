import { useEffect, useState } from 'react';
import { StatusBadge, NonCustodialDisclosureBanner } from '@rgs-ledger/ui';
import { PaymentStatus } from '@rgs-ledger/shared-types';
import { PublicCheckoutDetails, PublicPaymentLinkDetails, ApiResponse } from '@rgs-ledger/api-contracts';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

export default function App() {
  const [sessionRef, setSessionRef] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('reference');
    if (ref) return ref.trim();
    const path = window.location.pathname.replace(/^\/checkout\/?/, '').replace(/^\//, '').trim();
    if (path.startsWith('chk_')) return path;
    return '';
  });

  const [linkRef, setLinkRef] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const link = params.get('link') || params.get('plink');
    if (link) return link.trim();
    const path = window.location.pathname.replace(/^\/checkout\/?/, '').replace(/^\//, '').trim();
    if (path.startsWith('plink_')) return path;
    return '';
  });

  const [manualInput, setManualInput] = useState<string>('');
  const [details, setDetails] = useState<PublicCheckoutDetails | null>(null);
  const [linkDetails, setLinkDetails] = useState<PublicPaymentLinkDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [initiating, setInitiating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Form inputs for payment link checkout
  const [customAmountRupees, setCustomAmountRupees] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');

  // Fetch Checkout Session
  const fetchCheckout = async (ref: string) => {
    if (!ref) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/checkout/${encodeURIComponent(ref)}`);
      const json: ApiResponse<PublicCheckoutDetails> = await res.json();
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message || 'Failed to load checkout session');
        setDetails(null);
        return;
      }
      setDetails(json.data);
      setError(null);
    } catch {
      setError('Unable to connect to payment server. Please ensure the API is running.');
    }
  };

  // Fetch Payment Link details
  const fetchPaymentLink = async (lRef: string) => {
    if (!lRef) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/checkout/link/${encodeURIComponent(lRef)}`);
      const json: ApiResponse<PublicPaymentLinkDetails> = await res.json();
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message || 'Failed to load payment link');
        setLinkDetails(null);
        return;
      }
      setLinkDetails(json.data);
      setError(null);
    } catch {
      setError('Unable to load payment link details. Please ensure the API is running.');
    }
  };

  useEffect(() => {
    if (sessionRef) {
      setLoading(true);
      fetchCheckout(sessionRef).finally(() => setLoading(false));
    } else if (linkRef) {
      setLoading(true);
      fetchPaymentLink(linkRef).finally(() => setLoading(false));
    }
  }, [sessionRef, linkRef]);

  // Polling status every 3.5 seconds while PENDING or PARTIAL_SUCCESS
  useEffect(() => {
    if (!sessionRef || !details) return;
    if (details.status !== PaymentStatus.PENDING && details.status !== PaymentStatus.PARTIAL_SUCCESS) {
      return;
    }

    const interval = setInterval(() => {
      fetchCheckout(sessionRef);
    }, 3500);

    return () => clearInterval(interval);
  }, [sessionRef, details?.status]);

  // Expiration countdown for checkout session
  useEffect(() => {
    if (!details?.expiresAt) return;

    const updateRemaining = () => {
      const diffMs = new Date(details.expiresAt).getTime() - Date.now();
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));
      setSecondsRemaining(diffSec);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [details?.expiresAt]);

  const handleCopyUri = () => {
    if (!details?.upiUri) return;
    navigator.clipboard.writeText(details.upiUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInitiateFromLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkRef || !linkDetails) return;

    let amountPaise: number | undefined;
    if (linkDetails.isOpenAmount) {
      const num = parseFloat(customAmountRupees);
      if (isNaN(num) || num < 1) {
        setError('Please enter a valid amount of at least ₹1.00');
        return;
      }
      amountPaise = Math.round(num * 100);
    }

    setInitiating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/checkout/link/${encodeURIComponent(linkRef)}/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPaise,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error?.message || 'Failed to initiate payment session');
      }

      // Transition straight into active checkout session
      const newRef = json.data.checkoutReference;
      setSessionRef(newRef);
      setDetails({
        checkoutReference: json.data.checkoutReference,
        merchantName: json.data.merchantName,
        orderId: json.data.orderId,
        amountPaise: json.data.amountPaise,
        amountRupees: json.data.amountRupees,
        qrDataUrl: json.data.qrDataUrl,
        upiUri: json.data.upiUri,
        intentLinks: json.data.intentLinks,
        status: json.data.status,
        description: json.data.description,
        expiresAt: json.data.expiresAt,
        isExpired: false,
        disclosure: 'Non-custodial UPI'
      });
      // Update browser URL query param without full page reload
      window.history.pushState({}, '', `?ref=${newRef}`);
    } catch (err: any) {
      setError(err.message || 'Payment initiation failed');
    } finally {
      setInitiating(false);
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: '480px', margin: '32px auto', padding: '0 16px' }}>
      {/* Manual lookup if neither sessionRef nor linkRef is present */}
      {!sessionRef && !linkRef && (
        <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#111827' }}>RGS Ledger Checkout</h2>
          <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '16px' }}>Enter your checkout session reference or payment link ID:</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const val = manualInput.trim();
              if (val.startsWith('plink_')) {
                setLinkRef(val);
              } else if (val) {
                setSessionRef(val);
              }
            }}
            style={{ display: 'flex', gap: '8px' }}
          >
            <input
              type="text"
              placeholder="chk_... or plink_..."
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              style={{ flex: 1, padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px' }}
            />
            <button
              type="submit"
              style={{ padding: '10px 18px', background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
            >
              Open
            </button>
          </form>
        </div>
      )}

      {loading && (
        <div style={{ background: '#FFFFFF', padding: '40px', textAlign: 'center', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid #E5E7EB', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#4B5563', fontSize: '15px', marginTop: '12px' }}>Loading payment details...</p>
        </div>
      )}

      {error && !loading && (
        <div style={{ background: '#FEF2F2', border: '1px solid #F87171', borderRadius: '12px', padding: '20px', marginBottom: '20px', color: '#991B1B' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '6px' }}>Checkout Notice</h3>
          <p style={{ fontSize: '14px' }}>{error}</p>
          <button
            onClick={() => { setSessionRef(''); setLinkRef(''); setError(null); }}
            style={{ marginTop: '12px', padding: '6px 12px', background: '#EF4444', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            Try Another Reference
          </button>
        </div>
      )}

      {/* VIEW A: Payment Link Initiation Form (when linkRef is provided and not yet initiated) */}
      {!sessionRef && linkDetails && !loading && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '24px 24px 16px 24px', borderBottom: '1px solid #F3F4F6', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', fontWeight: 600 }}>Payment Link</span>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginTop: '2px' }}>{linkDetails.merchantName}</h1>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#374151', marginTop: '4px' }}>{linkDetails.title}</p>
            {linkDetails.description && (
              <p style={{ color: '#6B7280', fontSize: '13px', marginTop: '4px' }}>{linkDetails.description}</p>
            )}

            {linkDetails.amountRupees !== null ? (
              <div style={{ marginTop: '14px', fontSize: '32px', fontWeight: '800', color: '#111827' }}>
                ₹{linkDetails.amountRupees.toFixed(2)}
              </div>
            ) : (
              <div style={{ marginTop: '12px', display: 'inline-block', background: '#EFF6FF', color: '#1D4ED8', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600 }}>
                Customer-Defined Amount
              </div>
            )}
          </div>

          <form onSubmit={handleInitiateFromLink} style={{ padding: '24px' }}>
            {linkDetails.isOpenAmount && (
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Enter Amount to Pay (₹)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '10px', fontSize: '18px', fontWeight: 700, color: '#6B7280' }}>₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="100.00"
                    value={customAmountRupees}
                    onChange={(e) => setCustomAmountRupees(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 30px', fontSize: '18px', fontWeight: 600, border: '1px solid #D1D5DB', borderRadius: '8px' }}
                  />
                </div>
                {/* Quick amount chips */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {[100, 250, 500, 1000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCustomAmountRupees(amt.toString())}
                      style={{ padding: '4px 10px', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: '16px', fontSize: '12px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}
                    >
                      +₹{amt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>
                Your Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>
                Mobile Number (Optional)
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>

            <button
              type="submit"
              disabled={initiating || (linkDetails.isOpenAmount && !customAmountRupees)}
              style={{
                width: '100%',
                padding: '12px',
                background: initiating ? '#93C5FD' : '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: initiating ? 'not-allowed' : 'pointer'
              }}
            >
              {initiating ? 'Generating UPI QR...' : 'Proceed to Pay with UPI'}
            </button>
          </form>

          <div style={{ padding: '16px 24px', background: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
            <NonCustodialDisclosureBanner />
          </div>
        </div>
      )}

      {/* VIEW B: Active Checkout Session View (QR code, intent links, status banners) */}
      {details && !loading && (
        <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '24px 24px 16px 24px', borderBottom: '1px solid #F3F4F6', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', fontWeight: 600 }}>Payment Request</span>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', marginTop: '2px' }}>{details.merchantName}</h1>
            <p style={{ color: '#6B7280', fontSize: '13px', marginTop: '2px' }}>Order: #{details.orderId}</p>

            <div style={{ marginTop: '14px', fontSize: '32px', fontWeight: '800', color: '#111827' }}>
              ₹{details.amountRupees.toFixed(2)}
            </div>

            <div style={{ marginTop: '10px' }}>
              <StatusBadge status={details.status} />
            </div>

            {details.description && (
              <p style={{ color: '#4B5563', fontSize: '13px', marginTop: '10px' }}>{details.description}</p>
            )}
          </div>

          {/* DUAL-SOURCE VERIFICATION STATUS BANNERS */}
          {details.status === PaymentStatus.PARTIAL_SUCCESS && (
            <div style={{ padding: '14px 20px', background: '#FEF3C7', borderBottom: '1px solid #FDE68A', color: '#92400E', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>⏳</span>
              <div>
                <strong>Payment Detected — Verifying:</strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px' }}>
                  Received first credit confirmation (Bank SMS / Notification). Awaiting dual-source evidence verification before final confirmation...
                </p>
              </div>
            </div>
          )}

          {details.status === PaymentStatus.SUCCESS && (
            <div style={{ padding: '16px 20px', background: '#ECFDF5', borderBottom: '1px solid #A7F3D0', color: '#065F46', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>✓</div>
              <strong style={{ fontSize: '16px' }}>Payment Successfully Verified!</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#047857' }}>
                Both independent evidence sources confirmed the transaction credit to the merchant bank account.
              </p>
            </div>
          )}

          {details.status === PaymentStatus.REVIEW_REQUIRED && (
            <div style={{ padding: '14px 20px', background: '#FFFBEB', borderBottom: '1px solid #FCD34D', color: '#B45309', fontSize: '13px' }}>
              <strong>Under Merchant Review:</strong> Evidence detected conflicting data or amount discrepancy. The merchant has been alerted.
            </div>
          )}

          {details.status === PaymentStatus.RECONCILIATION_REQUIRED && (
            <div style={{ padding: '14px 20px', background: '#FEE2E2', borderBottom: '1px solid #FCA5A5', color: '#991B1B', fontSize: '13px' }}>
              <strong>Reconciliation Required:</strong> Late or disputed evidence detected. Please contact the merchant with order #{details.orderId}.
            </div>
          )}

          {/* QR Code Container */}
          <div style={{ padding: '24px', textAlign: 'center', background: '#FAFAFA' }}>
            {details.status === PaymentStatus.PENDING && !details.isExpired ? (
              <>
                <div style={{ display: 'inline-block', padding: '16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
                  <img
                    src={details.qrDataUrl}
                    alt="UPI Payment QR Code"
                    style={{ width: '220px', height: '220px', display: 'block' }}
                  />
                </div>

                {secondsRemaining !== null && (
                  <div style={{ marginTop: '14px', fontSize: '13px', color: secondsRemaining < 120 ? '#DC2626' : '#4B5563', fontWeight: 500 }}>
                    Expires in: <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{formatTimer(secondsRemaining)}</span>
                  </div>
                )}
                <p style={{ color: '#6B7280', fontSize: '12px', marginTop: '4px' }}>Scan with any UPI app to pay</p>
              </>
            ) : details.status === PaymentStatus.PARTIAL_SUCCESS ? (
              <div style={{ padding: '20px 10px', textAlign: 'center' }}>
                <div style={{ display: 'inline-block', width: '36px', height: '36px', border: '4px solid #FDE68A', borderTopColor: '#D97706', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                <p style={{ color: '#92400E', fontWeight: 600, fontSize: '15px' }}>Dual-Source Matching in Progress</p>
                <p style={{ color: '#6B7280', fontSize: '12px', marginTop: '4px' }}>Please do not close this window. Confirmation will update momentarily.</p>
              </div>
            ) : details.status === PaymentStatus.SUCCESS ? (
              <div style={{ padding: '24px 10px', textAlign: 'center' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#D1FAE5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto', fontSize: '28px', fontWeight: 'bold' }}>
                  ✓
                </div>
                <p style={{ color: '#065F46', fontWeight: 700, fontSize: '17px' }}>Paid ₹{details.amountRupees.toFixed(2)}</p>
                <p style={{ color: '#6B7280', fontSize: '13px', marginTop: '4px' }}>Thank you for your payment.</p>
              </div>
            ) : details.status === PaymentStatus.CANCELLED ? (
              <div style={{ padding: '30px 10px' }}>
                <p style={{ color: '#DC2626', fontWeight: 600, fontSize: '16px' }}>This payment was cancelled.</p>
                <p style={{ color: '#6B7280', fontSize: '13px', marginTop: '4px' }}>Please contact the merchant for a new checkout session.</p>
              </div>
            ) : (
              <div style={{ padding: '30px 10px' }}>
                <p style={{ color: '#DC2626', fontWeight: 600, fontSize: '16px' }}>This payment session has expired.</p>
                <p style={{ color: '#6B7280', fontSize: '13px', marginTop: '4px' }}>Please initiate a fresh checkout to complete your transaction.</p>
              </div>
            )}
          </div>

          {/* Mobile UPI Intent Buttons (Active only when PENDING) */}
          {details.status === PaymentStatus.PENDING && !details.isExpired && (
            <div style={{ padding: '20px 24px', borderTop: '1px solid #F3F4F6' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px', textAlign: 'center' }}>
                Or Pay Directly On Mobile
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <a
                  href={details.intentLinks.phonepe}
                  style={{ textDecoration: 'none', padding: '10px 12px', background: '#5F259F', color: '#FFF', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textAlign: 'center', display: 'block' }}
                >
                  PhonePe
                </a>
                <a
                  href={details.intentLinks.gpay}
                  style={{ textDecoration: 'none', padding: '10px 12px', background: '#1A73E8', color: '#FFF', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textAlign: 'center', display: 'block' }}
                >
                  Google Pay
                </a>
                <a
                  href={details.intentLinks.paytm}
                  style={{ textDecoration: 'none', padding: '10px 12px', background: '#00BAF2', color: '#FFF', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textAlign: 'center', display: 'block' }}
                >
                  Paytm
                </a>
                <a
                  href={details.intentLinks.bhim}
                  style={{ textDecoration: 'none', padding: '10px 12px', background: '#00833F', color: '#FFF', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textAlign: 'center', display: 'block' }}
                >
                  BHIM UPI
                </a>
              </div>

              <div style={{ marginTop: '12px' }}>
                <a
                  href={details.intentLinks.generic}
                  style={{ textDecoration: 'none', padding: '11px', background: '#111827', color: '#FFF', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textAlign: 'center', display: 'block' }}
                >
                  Pay with Default UPI App
                </a>
              </div>

              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={handleCopyUri}
                  style={{ background: 'none', border: '1px solid #D1D5DB', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', color: '#4B5563', cursor: 'pointer' }}
                >
                  {copied ? '✓ Copied UPI Intent' : 'Copy UPI Link'}
                </button>
              </div>
            </div>
          )}

          {/* Footer disclosure */}
          <div style={{ padding: '16px 24px', background: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
            <NonCustodialDisclosureBanner />
          </div>
        </div>
      )}
    </div>
  );
}
