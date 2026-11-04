import React, { useEffect, useState } from 'react';
import { Landmark, ArrowUpRight, ShieldCheck, Wallet, ReceiptText } from 'lucide-react';
import { apiRequest } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { formatCurrency } from '@rgs-ledger/shared';

export const SettlementsPage: React.FC = () => {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [balancePaise, setBalancePaise] = useState<number>(0);
  const [journal, setJournal] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payoutInProgress, setPayoutInProgress] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [setRes, balRes, jourRes] = await Promise.all([
      apiRequest('/settlements'),
      apiRequest('/settlements/balance'),
      apiRequest('/settlements/journal')
    ]);

    if (setRes.success && setRes.data) setSettlements(setRes.data);
    if (balRes.success && balRes.data) setBalancePaise(balRes.data.availablePaise);
    if (jourRes.success && jourRes.data) setJournal(jourRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTriggerPayout = async () => {
    setPayoutInProgress(true);
    const res = await apiRequest('/settlements', { method: 'POST', body: JSON.stringify({}) });
    setPayoutInProgress(false);
    if (res.success) {
      loadData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Balance Card & Payout Trigger */}
      <div className="bg-gradient-to-r from-blue-900/40 via-slate-900 to-slate-900 border border-blue-500/20 rounded-2xl p-6 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
            Double-Entry Ledger Account (LIABILITY: MERCHANT_PAYABLE)
          </span>
          <h3 className="text-3xl font-extrabold text-white mt-3">
            {formatCurrency(balancePaise, 'INR')}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Available unsettled balance ready for automated bank nodal payout.
          </p>
        </div>

        <div>
          <button
            onClick={handleTriggerPayout}
            disabled={balancePaise <= 0 || payoutInProgress}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/30 disabled:opacity-50 transition-all flex items-center space-x-2"
          >
            <Landmark className="h-4 w-4" />
            <span>{payoutInProgress ? 'Settling Funds...' : 'Trigger Settlement Payout'}</span>
          </button>
        </div>
      </div>

      {/* Settlements Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white">Settlement Payout History</h3>
          <p className="text-xs text-slate-400">Processed transfers to your registered bank account</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Settlement ID</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Gross Amount</th>
                <th className="py-3 px-4">Fees Deducted</th>
                <th className="py-3 px-4">GST (18%)</th>
                <th className="py-3 px-4">Net Payout</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Payout Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {settlements.length > 0 ? (
                settlements.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-blue-400 font-medium">{s._id}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">{s.settlementReference}</td>
                    <td className="py-3 px-4 text-white font-medium">{formatCurrency(s.grossAmount, s.currency)}</td>
                    <td className="py-3 px-4 text-rose-400 font-mono">-{formatCurrency(s.feeAmount, s.currency)}</td>
                    <td className="py-3 px-4 text-rose-400 font-mono">-{formatCurrency(s.taxAmount, s.currency)}</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">{formatCurrency(s.netAmount, s.currency)}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {s.payoutDate ? new Date(s.payoutDate).toLocaleDateString() : 'Pending'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading settlements...' : 'No settlement payouts generated yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Double Entry Financial Journal Inspector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ReceiptText className="h-4 w-4 text-blue-400" />
              <span>Immutable Financial Ledger Journal (Debits / Credits)</span>
            </h3>
            <p className="text-xs text-slate-400">Double-entry audit log guaranteeing mathematical reconciliation</p>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            ∑ Debits === ∑ Credits
          </span>
        </div>

        <div className="divide-y divide-slate-800 text-xs">
          {journal.length > 0 ? (
            journal.slice(0, 5).map((tx) => (
              <div key={tx._id} className="p-4 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center justify-between font-mono text-[11px] text-slate-400 mb-2">
                  <span className="text-blue-400 font-semibold">{tx._id} — {tx.type}</span>
                  <span>Ref: {tx.referenceId}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                  {tx.entries?.map((e: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-2 rounded border flex items-center justify-between ${
                        e.direction === 'DEBIT' ? 'bg-blue-950/20 border-blue-900/40' : 'bg-emerald-950/20 border-emerald-900/40'
                      }`}
                    >
                      <div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          e.direction === 'DEBIT' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                        }`}>
                          {e.direction}
                        </span>
                        <span className="ml-2 font-mono text-slate-300">{e.accountCode}</span>
                      </div>
                      <span className="font-bold text-white">{formatCurrency(e.amountMinor, 'INR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-slate-500">No ledger entries recorded yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
