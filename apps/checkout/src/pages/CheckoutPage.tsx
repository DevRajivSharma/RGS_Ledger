import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  QrCode,
  Smartphone,
  CreditCard,
  Building,
  RefreshCw,
  Clock,
  ArrowRight,
  Lock,
  RotateCcw
} from 'lucide-react';
import { formatCurrency } from '@rgs-ledger/shared';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000/api/v1';

export const CheckoutPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'UPI_QR' | 'UPI_INTENT' | 'CARD' | 'NETBANKING'>('UPI_QR');
  
  // Persistent Payment Attempt State
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'IDLE' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'EXPIRED'>('IDLE');
  const [attemptCount, setAttemptCount] = useState<number>(1);
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

  // Concurrency and idempotency refs to prevent React StrictMode double-mount duplicates
  const isInitiatingRef = useRef<Record<string, boolean>>({});

  // Fetch session and synchronize or initiate payment attempt
  const fetchSession = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/checkout/sessions/${sessionId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSessionData(json.data);
        if (json.data.session.status === 'EXPIRED') {
          setPaymentStatus('EXPIRED');
          return;
        }

        if (json.data.payment) {
          // Retain existing transaction state across page reloads
          setPaymentId(json.data.payment.id);
          setPaymentStatus(json.data.payment.status);
          if (json.data.payment.status === 'SUCCESS') {
            setCompletedPayment(json.data.payment);
          }
          if (json.data.payment.method) {
            setActiveTab(json.data.payment.method);
          }
        }
      } else {
        setPaymentStatus('EXPIRED');
      }
    } catch {
      setPaymentStatus('EXPIRED');
    } finally {
      setLoading(false);
    }
  };

  const initiatePaymentAttempt = async (method: string, currentSessionData?: any, attemptNum?: number) => {
    if (!sessionId) return;
    const currentAttempt = attemptNum ?? attemptCount;
    const lockKey = `${sessionId}_${method}_${currentAttempt}`;
    if (isInitiatingRef.current[lockKey]) {
      return;
    }
    isInitiatingRef.current[lockKey] = true;

    // Stable idempotency key derived from session ID, method, and attempt index (persists across StrictMode remounts)
    const idempotencyKey = `idemp_cs_${sessionId}_${method}_${currentAttempt}`;

    try {
      const res = await fetch(`${API_BASE}/checkout/sessions/${sessionId}/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify({ method })
      });
      const json = await res.json();
      if (json.success && json.data?.payment) {
        setPaymentId(json.data.payment._id);
        setPaymentStatus(json.data.payment.status || 'PENDING');
        const activeData = currentSessionData || sessionData;
        if (activeData) {
          setSessionData({
            ...activeData,
            session: {
              ...activeData.session,
              paymentId: json.data.payment._id,
              upiUri: json.data.upiUri || activeData.session.upiUri
            },
            payment: json.data.payment
          });
        }
      }
    } catch (err) {
      console.error('Failed to initiate payment attempt:', err);
    } finally {
      isInitiatingRef.current[lockKey] = false;
    }
  };

  useEffect(() => {
    fetchSession();
  }, [sessionId]);

  // Generate QR code when canvas is ready
  useEffect(() => {
    const upiUri = sessionData?.session?.upiUri;
    if (upiUri && qrCanvasRef.current && activeTab === 'UPI_QR') {
      QRCode.toCanvas(qrCanvasRef.current, upiUri, {
        width: 180,
        margin: 1,
        color: { dark: '#0F172A', light: '#FFFFFF' }
      });
    }
  }, [sessionData, activeTab]);

  // Handle switching tabs (does not prematurely create payment attempts)
  const handleTabChange = (tab: 'UPI_QR' | 'UPI_INTENT' | 'CARD' | 'NETBANKING') => {
    setActiveTab(tab);
    setErrorMessage('');
  };

  // Phase 3 & 4: Process / Simulate resolution with explicitly selected method
  const handleProcessPayment = async (
    methodOverride?: string,
    upiOverride?: string,
    actionOverride?: 'SUCCESS' | 'FAILED' | 'PENDING'
  ) => {
    setPaymentStatus('PROCESSING');
    setErrorMessage('');

    const method = methodOverride || activeTab;

    let payload: any = {
      paymentId: paymentId || sessionData?.session?.paymentId,
      method: method,
      action: actionOverride,
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

      if (json.success && json.data?.payment) {
        const updatedPayment = json.data.payment;
        setPaymentId(updatedPayment._id);

        if (updatedPayment.status === 'SUCCESS') {
          setCompletedPayment(updatedPayment);
          setPaymentStatus('SUCCESS');

          if (window.parent) {
            window.parent.postMessage({
              type: 'RGS_PAYMENT_SUCCESS',
              payload: { paymentId: updatedPayment._id, orderId: updatedPayment.orderId }
            }, '*');
          }
        } else if (updatedPayment.status === 'PENDING') {
          setPaymentStatus('PENDING');
        } else {
          setPaymentStatus('FAILED');
          setErrorMessage(updatedPayment.errorDescription || 'Payment declined by user in UPI App');
        }
      } else {
        setPaymentStatus('FAILED');
        setErrorMessage(json.error?.message || 'Payment declined by banking gateway');
      }
    } catch (err: any) {
      setPaymentStatus('FAILED');
      setErrorMessage(err.message || 'Network communication error during payment processing');
    }
  };

  // Phase 5: Simulated Provider Webhook Callback (resolves SAME pending payment)
  const handleSimulatedProviderCallback = async (status: 'SUCCESS' | 'FAILED') => {
    if (!paymentId) return;
    setPaymentStatus('PROCESSING');

    try {
      const res = await fetch(`${API_BASE}/payments/${paymentId}/simulate-callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const json = await res.json();

      if (json.success && json.data?.payment) {
        const updated = json.data.payment;
        if (updated.status === 'SUCCESS') {
          setCompletedPayment(updated);
          setPaymentStatus('SUCCESS');
        } else if (updated.status === 'FAILED') {
          setPaymentStatus('FAILED');
          setErrorMessage(updated.errorDescription || 'Transaction declined by provider callback');
        } else {
          setPaymentStatus('PENDING');
        }
      }
    } catch (err: any) {
      setPaymentStatus('FAILED');
      setErrorMessage(err.message || 'Callback execution error');
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
              <span className="font-mono text-blue-400 font-medium">{completedPayment?._id || paymentId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Method:</span>
              <span className="font-semibold text-blue-400">{completedPayment?.method || activeTab}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Order ID:</span>
              <span className="font-mono text-slate-300">{sessionData?.session?.orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Merchant:</span>
              <span className="text-slate-200 font-semibold">{sessionData?.merchant?.businessName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="font-bold text-emerald-400">CAPTURED</span>
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

          <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 text-xs text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Attempt ID:</span>
              <span className="font-mono text-rose-400 font-medium">{paymentId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Order ID:</span>
              <span className="font-mono text-slate-300">{sessionData?.session?.orderId}</span>
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400">
            No funds were deducted. You can retry with a different UPI ID, card, or banking method.
          </div>

          <button
            onClick={() => {
              const nextAttempt = attemptCount + 1;
              setAttemptCount(nextAttempt);
              setPaymentStatus('IDLE');
              initiatePaymentAttempt(activeTab, undefined, nextAttempt);
            }}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try Another Payment Attempt</span>
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
            Transaction: {paymentId} · Verifying UPI / Nodal Gateway...
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

        {/* Real-Time Payment Attempt Tracking Bar */}
        <div className="bg-slate-950/90 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-[11px]">
          <div className="flex items-center space-x-1.5 truncate max-w-[200px]">
            <span className="text-slate-500">Order:</span>
            <span className="font-mono text-slate-300 truncate">{sessionData?.session?.orderId}</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500">Payment:</span>
            <span className="font-mono text-blue-400 font-medium">
              {paymentId || 'Creating...'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {paymentStatus === 'IDLE' ? 'PENDING' : paymentStatus}
            </span>
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

        {/* Dedicated Pending Notification Banner if held in PENDING */}
        {paymentStatus === 'PENDING' && (
          <div className="bg-blue-950/40 border-b border-blue-800/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-amber-400 animate-pulse" />
                <span className="text-xs font-bold text-white">Payment Attempt Pending</span>
              </div>
              <button
                onClick={fetchSession}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center space-x-1"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Check Status</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-300">
              Awaiting authorization from customer UPI app. Transaction ID: <span className="font-mono text-blue-400">{paymentId}</span>
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleSimulatedProviderCallback('SUCCESS')}
                className="py-1.5 px-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1"
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Simulate Callback: Success</span>
              </button>
              <button
                onClick={() => handleSimulatedProviderCallback('FAILED')}
                className="py-1.5 px-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1"
              >
                <XCircle className="h-3 w-3" />
                <span>Simulate Callback: Decline</span>
              </button>
            </div>
          </div>
        )}

        {/* Payment Method Selector Tabs */}
        <div className="grid grid-cols-4 p-2 bg-slate-950/60 border-b border-slate-800 gap-1 text-xs">
          <button
            onClick={() => handleTabChange('UPI_QR')}
            className={`py-2 rounded-lg font-bold flex flex-col items-center space-y-1 transition-all ${
              activeTab === 'UPI_QR' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="h-4 w-4" />
            <span className="text-[10px]">UPI QR</span>
          </button>

          <button
            onClick={() => handleTabChange('UPI_INTENT')}
            className={`py-2 rounded-lg font-bold flex flex-col items-center space-y-1 transition-all ${
              activeTab === 'UPI_INTENT' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="h-4 w-4" />
            <span className="text-[10px]">UPI Apps</span>
          </button>

          <button
            onClick={() => handleTabChange('CARD')}
            className={`py-2 rounded-lg font-bold flex flex-col items-center space-y-1 transition-all ${
              activeTab === 'CARD' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            <span className="text-[10px]">Card</span>
          </button>

          <button
            onClick={() => handleTabChange('NETBANKING')}
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
                <span>QR Reference: <strong className="text-blue-400 font-mono">{paymentId || sessionData?.session?.id}</strong></span>
              </div>

              <div className="w-full pt-2 space-y-2">
                <button
                  onClick={() => handleProcessPayment('UPI_QR', 'success@rgs', 'SUCCESS')}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Simulate "Paid on UPI App" (Success)</span>
                </button>
                <button
                  onClick={() => handleProcessPayment('UPI_QR', 'fail@rgs', 'FAILED')}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-xl text-xs font-semibold border border-slate-700 transition-all"
                >
                  Simulate "Declined on UPI App" (Failure)
                </button>
                <button
                  onClick={() => handleProcessPayment('UPI_QR', 'pending@rgs', 'PENDING')}
                  className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl text-xs font-semibold border border-amber-500/30 transition-all flex items-center justify-center space-x-1.5"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>Simulate "Payment Pending" (Awaiting PSP)</span>
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
                  onClick={() => handleProcessPayment('UPI_INTENT', 'success@rgs', 'SUCCESS')}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500 text-xs font-bold text-white flex items-center space-x-2 transition-all"
                >
                  <span className="h-3 w-3 rounded-full bg-blue-500"></span>
                  <span>Google Pay</span>
                </button>
                <button
                  onClick={() => handleProcessPayment('UPI_INTENT', 'success@rgs', 'SUCCESS')}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500 text-xs font-bold text-white flex items-center space-x-2 transition-all"
                >
                  <span className="h-3 w-3 rounded-full bg-purple-500"></span>
                  <span>PhonePe</span>
                </button>
                <button
                  onClick={() => handleProcessPayment('UPI_INTENT', 'success@rgs', 'SUCCESS')}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-500 text-xs font-bold text-white flex items-center space-x-2 transition-all"
                >
                  <span className="h-3 w-3 rounded-full bg-sky-500"></span>
                  <span>Paytm</span>
                </button>
                <button
                  onClick={() => handleProcessPayment('UPI_INTENT', 'success@rgs', 'SUCCESS')}
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
                    onClick={() => handleProcessPayment('UPI_INTENT', upiId, 'SUCCESS')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-md shadow-blue-500/20"
                  >
                    Verify & Pay
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={() => handleProcessPayment('UPI_INTENT', 'pending@rgs', 'PENDING')}
                  className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl text-xs font-semibold border border-amber-500/30 transition-all flex items-center justify-center space-x-1.5"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>Simulate "Payment Pending" (Awaiting PSP)</span>
                </button>
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
                onClick={() => handleProcessPayment('CARD', undefined, 'SUCCESS')}
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
                onClick={() => handleProcessPayment('NETBANKING', undefined, 'SUCCESS')}
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
