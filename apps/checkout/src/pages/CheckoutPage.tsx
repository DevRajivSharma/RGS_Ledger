import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ShieldCheck,
  QrCode,
  Smartphone,
  CreditCard,
  Building,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Lock
} from 'lucide-react';
import { formatCurrency } from '@rgs-ledger/shared';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000/api/v1';

export const CheckoutPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'UPI_QR' | 'UPI_INTENT' | 'CARD' | 'NETBANKING'>('UPI_QR');
  
  // Payment Status states
  const [paymentStatus, setPaymentStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'EXPIRED'>('IDLE');
  const [completedPayment, setCompletedPayment] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Form inputs
  const [upiId, setUpiId] = useState('success@rgs');
  const [cardNumber, setCardNumber] = useState('4111 1111 1111 1111');
  const [expDate, setExpDate] = useState('12/28');
  const [cvv, setCvv] = useState('123');
  const [holderName, setHolderName] = useState('Rahul Sharma');
  const [selectedBank, setSelectedBank] = useState('HDFC');

  // QR canvas
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    async function fetchSession() {
      if (!sessionId) return;
      try {
        const res = await fetch(`${API_BASE}/checkout/sessions/${sessionId}`);
        const json = await res.json();
        if (json.success && json.data) {
          setSessionData(json.data);
          if (json.data.session.status === 'EXPIRED') {
            setPaymentStatus('EXPIRED');
          }
        } else {
          setPaymentStatus('EXPIRED');
        }
      } catch {
        setPaymentStatus('EXPIRED');
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [sessionId]);

  // Generate QR code when canvas is ready
  useEffect(() => {
    if (sessionData?.session?.upiUri && qrCanvasRef.current && activeTab === 'UPI_QR') {
      QRCode.toCanvas(qrCanvasRef.current, sessionData.session.upiUri, {
        width: 180,
        margin: 1,
        color: { dark: '#0F172A', light: '#FFFFFF' }
      });
    }
  }, [sessionData, activeTab]);

  const handleProcessPayment = async (methodOverride?: string, upiOverride?: string) => {
    setPaymentStatus('PROCESSING');
    setErrorMessage('');

    const method = methodOverride || activeTab;

    let payload: any = {
      method: method === 'UPI_QR' ? 'UPI_QR' : method,
      upiId: upiOverride || (method.startsWith('UPI') ? upiId : undefined)
    };

    if (method === 'CARD') {
      const [expMonthStr, expYearStr] = expDate.split('/');
      payload.cardDetails = {
        cardNumber: cardNumber.replace(/\s/g, ''),
        expMonth: parseInt(expMonthStr || '12', 10),
        expYear: 2000 + parseInt(expYearStr || '28', 10),
        cvv,
        holderName
      };
    } else if (method === 'NETBANKING') {
      payload.bankCode = selectedBank;
    }

    try {
      const res = await fetch(`${API_BASE}/checkout/sessions/${sessionId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();

      if (json.success && json.data?.payment?.status === 'SUCCESS') {
        setCompletedPayment(json.data.payment);
        setPaymentStatus('SUCCESS');

        // PostMessage to parent if embedded in iframe
        if (window.parent) {
          window.parent.postMessage({
            type: 'RGS_PAYMENT_SUCCESS',
            payload: { paymentId: json.data.payment._id, orderId: json.data.payment.orderId }
          }, '*');
        }
      } else {
        setPaymentStatus('FAILED');
        setErrorMessage(json.error?.message || json.data?.payment?.errorDescription || 'Payment declined by banking gateway');
      }
    } catch (err: any) {
      setPaymentStatus('FAILED');
      setErrorMessage(err.message || 'Network communication error during payment processing');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 text-xs font-semibold space-y-3">
        <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Loading secure payment gateway session...</span>
      </div>
    );
  }

  // 1. SUCCESS SCREEN
  if (paymentStatus === 'SUCCESS') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-8 shadow-2xl text-center space-y-5">
          <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="h-9 w-9" />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Payment Successful!</h2>
            <p className="text-xs text-slate-400 mt-1">Verified and captured in financial ledger</p>
          </div>

          <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 text-xs text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Amount Paid:</span>
              <span className="font-bold text-white text-sm">
                {formatCurrency(completedPayment?.amount || sessionData?.session?.amount, 'INR')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment ID:</span>
              <span className="font-mono text-blue-400 font-medium">{completedPayment?._id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Merchant:</span>
              <span className="text-slate-200 font-semibold">{sessionData?.merchant?.businessName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Method:</span>
              <span className="text-slate-200">{completedPayment?.method || 'UPI'}</span>
            </div>
          </div>

          <button
            onClick={() => {
              if (sessionData?.session?.successUrl) {
                window.location.href = sessionData.session.successUrl;
              } else {
                window.close();
              }
            }}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 transition-all"
          >
            Return to Merchant Store ↗
          </button>
        </div>
      </div>
    );
  }

  // 2. FAILED SCREEN
  if (paymentStatus === 'FAILED') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-8 shadow-2xl text-center space-y-5">
          <div className="h-16 w-16 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-rose-500/20">
            <XCircle className="h-9 w-9" />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Payment Declined</h2>
            <p className="text-xs text-rose-400 font-medium mt-1">{errorMessage}</p>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400">
            No funds were deducted. You can retry with a different UPI ID, card, or banking method.
          </div>

          <button
            onClick={() => setPaymentStatus('IDLE')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try Another Payment Method</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. PROCESSING SPINNER
  if (paymentStatus === 'PROCESSING') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-8 shadow-2xl text-center space-y-5">
          <div className="h-16 w-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div>
            <h3 className="text-lg font-bold text-white">Communicating with Bank Network...</h3>
            <p className="text-xs text-slate-400 mt-1">Please do not refresh or close this window.</p>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 font-mono">
            Verifying 2FA and nodal gateway authorization...
          </div>
        </div>
      </div>
    );
  }

  // 4. MAIN CHECKOUT UI
  const amountPaise = sessionData?.session?.amount || 0;
  const businessName = sessionData?.merchant?.businessName || 'Merchant Store';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 py-8">
      {/* Checkout Card Container */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Merchant Header */}
        <div className="p-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center font-extrabold text-white text-base shadow-lg shadow-blue-500/20">
              {businessName.charAt(0)}
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-white">{businessName}</h2>
              <p className="text-[11px] text-slate-400 flex items-center space-x-1">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                <span>RGS 256-Bit TLS Encrypted</span>
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Amount to Pay</span>
            <span className="text-xl font-black text-white">{formatCurrency(amountPaise, 'INR')}</span>
          </div>
        </div>

        {/* Sandbox Simulation Notice */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-[11px] text-amber-300 font-semibold">
          <span className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>RGS Ledger Sandbox Environment</span>
          </span>
          <span className="font-mono text-[10px] opacity-75">Simulated Gateway</span>
        </div>

        {/* Payment Method Selector Tabs */}
        <div className="grid grid-cols-4 p-2 bg-slate-950/60 border-b border-slate-800 gap-1 text-xs">
          <button
            onClick={() => setActiveTab('UPI_QR')}
            className={`py-2 rounded-lg font-bold flex flex-col items-center space-y-1 transition-all ${
              activeTab === 'UPI_QR' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="h-4 w-4" />
            <span className="text-[10px]">UPI QR</span>
          </button>

          <button
            onClick={() => setActiveTab('UPI_INTENT')}
            className={`py-2 rounded-lg font-bold flex flex-col items-center space-y-1 transition-all ${
              activeTab === 'UPI_INTENT' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="h-4 w-4" />
            <span className="text-[10px]">UPI Apps</span>
          </button>

          <button
            onClick={() => setActiveTab('CARD')}
            className={`py-2 rounded-lg font-bold flex flex-col items-center space-y-1 transition-all ${
              activeTab === 'CARD' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            <span className="text-[10px]">Card</span>
          </button>

          <button
            onClick={() => setActiveTab('NETBANKING')}
            className={`py-2 rounded-lg font-bold flex flex-col items-center space-y-1 transition-all ${
              activeTab === 'NETBANKING' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building className="h-4 w-4" />
            <span className="text-[10px]">NetBanking</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 flex-1 flex flex-col justify-between">
          {/* 1. UPI QR Code */}
          {activeTab === 'UPI_QR' && (
            <div className="flex flex-col items-center text-center space-y-4">
              <p className="text-xs text-slate-300">
                Scan with any UPI App (<strong className="text-white">GPay, PhonePe, Paytm, BHIM</strong>)
              </p>

              <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-blue-500/20">
                <canvas ref={qrCanvasRef} className="rounded-lg"></canvas>
              </div>

              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>QR valid for next 14:59 minutes</span>
              </div>

              <div className="w-full pt-2">
                <button
                  onClick={() => handleProcessPayment('UPI_QR', 'success@rgs')}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Simulate "Paid on UPI App" (Success)</span>
                </button>
                <button
                  onClick={() => handleProcessPayment('UPI_QR', 'fail@rgs')}
                  className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-xl text-xs font-semibold border border-slate-700 transition-all"
                >
                  Simulate "Declined on UPI App" (Failure)
                </button>
              </div>
            </div>
          )}

          {/* 2. UPI Intent (Apps) */}
          {activeTab === 'UPI_INTENT' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">Select your preferred UPI application or enter UPI ID:</p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleProcessPayment('UPI_INTENT', 'success@rgs')}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500 text-xs font-bold text-white flex items-center space-x-2 transition-all"
                >
                  <span className="h-3 w-3 rounded-full bg-blue-500"></span>
                  <span>Google Pay</span>
                </button>
                <button
                  onClick={() => handleProcessPayment('UPI_INTENT', 'success@rgs')}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500 text-xs font-bold text-white flex items-center space-x-2 transition-all"
                >
                  <span className="h-3 w-3 rounded-full bg-purple-500"></span>
                  <span>PhonePe</span>
                </button>
                <button
                  onClick={() => handleProcessPayment('UPI_INTENT', 'success@rgs')}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-500 text-xs font-bold text-white flex items-center space-x-2 transition-all"
                >
                  <span className="h-3 w-3 rounded-full bg-sky-500"></span>
                  <span>Paytm</span>
                </button>
                <button
                  onClick={() => handleProcessPayment('UPI_INTENT', 'success@rgs')}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500 text-xs font-bold text-white flex items-center space-x-2 transition-all"
                >
                  <span className="h-3 w-3 rounded-full bg-emerald-500"></span>
                  <span>BHIM UPI</span>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="text-xs font-semibold text-slate-300">Or Enter UPI ID (VPA)</label>
                <div className="mt-1 flex space-x-2">
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="username@bank"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    onClick={() => handleProcessPayment('UPI_INTENT', upiId)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-md shadow-blue-500/20"
                  >
                    Verify & Pay
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Card Simulation */}
          {activeTab === 'CARD' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Card Number</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Expiry (MM/YY)</label>
                  <input
                    type="text"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">CVV</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Cardholder Name</label>
                <input
                  type="text"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={() => handleProcessPayment('CARD')}
                className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center space-x-1.5"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Pay {formatCurrency(amountPaise, 'INR')}</span>
              </button>
            </div>
          )}

          {/* 4. NetBanking */}
          {activeTab === 'NETBANKING' && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300">Select Banking Institution</label>
              <div className="grid grid-cols-2 gap-2">
                {['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK'].map((bank) => (
                  <button
                    key={bank}
                    onClick={() => setSelectedBank(bank)}
                    className={`p-3 rounded-xl border text-xs font-bold text-left transition-all ${
                      selectedBank === bank
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {bank} Bank
                  </button>
                ))}
              </div>

              <button
                onClick={() => handleProcessPayment('NETBANKING')}
                className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 transition-all"
              >
                Proceed to NetBanking ({selectedBank})
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-medium">
            Powered by <strong className="text-slate-400">RGS Ledger</strong> · PCI-DSS SAQ-A Certified Architecture
          </p>
        </div>
      </div>
    </div>
  );
};
