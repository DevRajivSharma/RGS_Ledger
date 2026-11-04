import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Download,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  BookOpen,
  X
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { formatCurrency } from '@rgs-ledger/shared';

export const TransactionsPage: React.FC = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  // Refund modal state
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAmountPaise, setRefundAmountPaise] = useState<number>(0);
  const [refundReason, setRefundReason] = useState('Customer Return');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundMsg, setRefundMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    let query = '';
    if (statusFilter) query += `?status=${statusFilter}`;
    const res = await apiRequest(`/payments${query}`);
    if (res.success && res.data) {
      setPayments(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPayments();
  }, [statusFilter]);

  const filteredPayments = payments.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p._id.toLowerCase().includes(s) || p.orderId.toLowerCase().includes(s);
  });

  const handleOpenRefund = (tx: any) => {
    setSelectedTx(tx);
    setRefundAmountPaise(tx.amount); // default to full refund
    setRefundReason('Customer Return');
    setRefundMsg(null);
    setRefundModalOpen(true);
  };

  const handleExecuteRefund = async () => {
    if (!selectedTx) return;
    setRefundSubmitting(true);
    setRefundMsg(null);

    const res = await apiRequest(`/refunds`, {
      method: 'POST',
      body: JSON.stringify({
        paymentId: selectedTx._id,
        amount: refundAmountPaise,
        reason: refundReason
      })
    });

    setRefundSubmitting(false);

    if (res.success) {
      setRefundMsg({ type: 'success', text: `Refund of ${formatCurrency(refundAmountPaise, 'INR')} processed successfully!` });
      loadPayments();
      setTimeout(() => {
        setRefundModalOpen(false);
      }, 1500);
    } else {
      setRefundMsg({ type: 'error', text: res.error?.message || 'Refund processing failed' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Transactions</h2>
          <p className="text-xs text-slate-400 mt-1">
            Track, filter, and inspect payment attempts and ledger captures.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-3 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Payment ID or Order ID..."
              className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Transaction ID</th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Provider ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredPayments.length > 0 ? (
                filteredPayments.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-blue-400 font-medium">{p._id}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">{p.orderId}</td>
                    <td className="py-3 px-4 font-bold text-white">{formatCurrency(p.amount, p.currency)}</td>
                    <td className="py-3 px-4 text-slate-300 font-medium">{p.method}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 truncate max-w-[120px]">
                      {p.providerPaymentId || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(p.createdAt).toLocaleDateString()} {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {p.status === 'SUCCESS' && (
                        <button
                          onClick={() => handleOpenRefund(p)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                        >
                          <RotateCcw className="h-3 w-3 text-amber-400" />
                          <span>Refund</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading transactions...' : 'No transactions matching query.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Refund Modal */}
      {refundModalOpen && selectedTx && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setRefundModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-white">Initiate Payment Refund</h3>
            <p className="text-xs text-slate-400 mt-1">
              Refund funds directly to original customer payment source via double-entry ledger.
            </p>

            <div className="mt-4 p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Payment ID:</span>
                <span className="font-mono text-blue-400">{selectedTx._id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Original Amount:</span>
                <span className="font-bold text-white">{formatCurrency(selectedTx.amount, selectedTx.currency)}</span>
              </div>
            </div>

            {refundMsg && (
              <div className={`mt-3 p-3 rounded-lg text-xs font-semibold ${
                refundMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {refundMsg.text}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300">Refund Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedTx.amount / 100}
                  value={refundAmountPaise / 100}
                  onChange={(e) => setRefundAmountPaise(Math.round(parseFloat(e.target.value || '0') * 100))}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300">Reason for Refund</label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Customer Return">Customer Return</option>
                  <option value="Duplicate Charge">Duplicate Charge</option>
                  <option value="Fraudulent Transaction">Fraudulent Transaction</option>
                  <option value="Order Cancelled">Order Cancelled</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setRefundModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={refundSubmitting || refundAmountPaise <= 0}
                onClick={handleExecuteRefund}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-rose-600/20 disabled:opacity-50"
              >
                {refundSubmitting ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
