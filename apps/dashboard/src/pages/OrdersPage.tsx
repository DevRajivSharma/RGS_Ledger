import React, { useEffect, useState } from 'react';
import { ShoppingBag, Plus, ExternalLink, Copy, Check } from 'lucide-react';
import { apiRequest } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { formatCurrency } from '@rgs-ledger/shared';

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // New order form state
  const [amountRupees, setAmountRupees] = useState('499.00');
  const [receipt, setReceipt] = useState('');
  const [customerName, setCustomerName] = useState('Rahul Sharma');
  const [customerEmail, setCustomerEmail] = useState('rahul@example.com');
  const [creating, setCreating] = useState(false);
  const [createdCheckoutUrl, setCreatedCheckoutUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    const res = await apiRequest('/orders');
    if (res.success && res.data) {
      setOrders(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    const amountPaise = Math.round(parseFloat(amountRupees) * 100);

    // 1. Create Order
    const orderRes = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: receipt || `REC-${Date.now().toString().slice(-6)}`,
        customer: {
          name: customerName,
          email: customerEmail
        }
      })
    });

    if (orderRes.success && orderRes.data) {
      // 2. Generate Hosted Checkout Session
      const sessionRes = await apiRequest('/checkout/sessions', {
        method: 'POST',
        body: JSON.stringify({
          orderId: orderRes.data._id,
          successUrl: 'http://localhost:5174/status/success',
          cancelUrl: 'http://localhost:5174/status/cancel'
        })
      });

      if (sessionRes.success && sessionRes.data?.checkoutUrl) {
        setCreatedCheckoutUrl(sessionRes.data.checkoutUrl);
      }

      loadOrders();
    }
    setCreating(false);
  };

  const handleLaunchCheckout = async (orderId: string) => {
    const sessionRes = await apiRequest('/checkout/sessions', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        successUrl: 'http://localhost:5174/status/success',
        cancelUrl: 'http://localhost:5174/status/cancel'
      })
    });

    if (sessionRes.success && sessionRes.data?.checkoutUrl) {
      window.open(sessionRes.data.checkoutUrl, '_blank');
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Title & Action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Orders</h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage checkout intents, order lifecycles, and customer payment attempts.
          </p>
        </div>
        <button
          onClick={() => {
            setCreatedCheckoutUrl(null);
            setReceipt(`REC-${Date.now().toString().slice(-6)}`);
            setModalOpen(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Create Test Order</span>
        </button>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Receipt</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Attempts</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Hosted Checkout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orders.length > 0 ? (
                orders.map((o) => (
                  <tr key={o._id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-blue-400 font-medium">{o._id}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">{o.receipt || '—'}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-white">{o.customer?.name || 'Guest'}</div>
                      <div className="text-[10px] text-slate-400">{o.customer?.email}</div>
                    </td>
                    <td className="py-3 px-4 font-bold text-white">{formatCurrency(o.amount, o.currency)}</td>
                    <td className="py-3 px-4 text-slate-300 font-medium">{o.attemptsCount}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(o.createdAt).toLocaleDateString()} {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleLaunchCheckout(o._id)}
                        className="px-2.5 py-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>Pay via Checkout</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading orders...' : 'No orders found. Click "Create Test Order" to initiate one.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white">Create Test Order</h3>
            <p className="text-xs text-slate-400 mt-1">
              Creates a new order and generates a hosted checkout payment URL.
            </p>

            {createdCheckoutUrl ? (
              <div className="mt-5 space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs space-y-2">
                  <p className="font-semibold text-emerald-400">Order & Checkout Session Ready!</p>
                  <p className="text-slate-300">Open the link below to test the UPI Intent and QR payment flow:</p>
                  <div className="flex items-center justify-between p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] text-blue-400">
                    <span className="truncate mr-2">{createdCheckoutUrl}</span>
                    <button
                      onClick={() => copyUrl(createdCheckoutUrl)}
                      className="p-1 hover:text-white"
                      title="Copy link"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <a
                    href={createdCheckoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold text-center shadow-md shadow-blue-500/20"
                  >
                    Open Hosted Checkout ↗
                  </a>
                  <button
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateOrder} className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300">Amount (INR ₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1.00"
                    required
                    value={amountRupees}
                    onChange={(e) => setAmountRupees(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-bold"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Tip: Amounts ending in .00 succeed, .01 fails in sandbox.</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300">Receipt / Invoice Ref</label>
                  <input
                    type="text"
                    value={receipt}
                    onChange={(e) => setReceipt(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300">Customer Email</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="mt-6 flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Generate Order'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
