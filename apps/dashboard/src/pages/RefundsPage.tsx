import React, { useEffect, useState } from 'react';
import { RotateCcw, AlertCircle } from 'lucide-react';
import { apiRequest } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { formatCurrency } from '@rgs-ledger/shared';

export const RefundsPage: React.FC = () => {
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRefunds() {
      setLoading(true);
      const res = await apiRequest('/refunds');
      if (res.success && res.data) {
        setRefunds(res.data);
      }
      setLoading(false);
    }
    loadRefunds();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Refunds</h2>
        <p className="text-xs text-slate-400 mt-1">
          Track customer returns, charge reversions, and double-entry refund ledger entries.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Refund ID</th>
                <th className="py-3 px-4">Payment ID</th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Provider Ref</th>
                <th className="py-3 px-4">Created Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {refunds.length > 0 ? (
                refunds.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-indigo-400 font-medium">{r._id}</td>
                    <td className="py-3 px-4 font-mono text-blue-400">{r.paymentId}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">{r.orderId}</td>
                    <td className="py-3 px-4 font-bold text-white">{formatCurrency(r.amount, r.currency)}</td>
                    <td className="py-3 px-4 text-slate-300">{r.reason}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{r.providerRefundId || '—'}</td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString()} {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading refunds...' : 'No refunds issued yet. You can issue refunds from the Transactions page.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
