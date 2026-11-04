import React, { useState } from 'react';
import { FileCheck2, Upload, AlertTriangle, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';

export const ReconciliationPage: React.FC = () => {
  const [reconciling, setReconciling] = useState(false);
  const [imported, setImported] = useState(false);

  const sampleRecords = [
    { id: 'REC_001', rgsRef: 'pay_998811', providerRef: 'UTR_HDFC_1928374', amount: '₹2,999.00', status: 'MATCHED', diff: '₹0.00' },
    { id: 'REC_002', rgsRef: 'pay_998812', providerRef: 'UTR_ICIC_8829102', amount: '₹1,500.00', status: 'MATCHED', diff: '₹0.00' },
    { id: 'REC_003', rgsRef: 'pay_998813', providerRef: 'UTR_SBI_9918231', amount: '₹499.00', status: 'MATCHED', diff: '₹0.00' },
    { id: 'REC_004', rgsRef: 'pay_998814', providerRef: 'PENDING_BANK_FILE', amount: '₹1,200.00', status: 'DISCREPANCY', diff: 'Awaiting Bank UTR' },
  ];

  const handleSimulateImport = () => {
    setReconciling(true);
    setTimeout(() => {
      setReconciling(false);
      setImported(true);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Payment Reconciliation</h2>
          <p className="text-xs text-slate-400 mt-1">
            Reconcile ledger captured payments against bank settlement files and nodal clearing statements.
          </p>
        </div>
        <button
          onClick={handleSimulateImport}
          disabled={reconciling}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center space-x-2"
        >
          <Upload className="h-4 w-4" />
          <span>{reconciling ? 'Processing File...' : 'Import Provider Bank CSV'}</span>
        </button>
      </div>

      {imported && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs flex items-center space-x-3 text-emerald-400 font-semibold">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>Provider statement imported: 3 transactions matched exactly (100% variance match), 1 pending bank settlement clearing.</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-400">Total Matched Volume</p>
          <h3 className="text-2xl font-bold text-emerald-400 mt-2">₹4,998.00</h3>
          <p className="text-[11px] text-slate-500 mt-1">100% matched with acquiring bank nodal account</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-400">Discrepancy / In-Transit</p>
          <h3 className="text-2xl font-bold text-amber-400 mt-2">₹1,200.00</h3>
          <p className="text-[11px] text-slate-500 mt-1">Bank clearing window T+1 in progress</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-400">Reconciliation Rate</p>
          <h3 className="text-2xl font-bold text-white mt-2">98.2%</h3>
          <p className="text-[11px] text-slate-500 mt-1">Automated algorithmic matching</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Reconciliation Feed</h3>
          <span className="text-xs text-slate-400 font-mono">Statement Cycle: Daily T+1</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Reconciliation Ref</th>
                <th className="py-3 px-4">RGS Payment ID</th>
                <th className="py-3 px-4">Bank Provider UTR</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Variance</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sampleRecords.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-400">{r.id}</td>
                  <td className="py-3 px-4 font-mono text-blue-400 font-medium">{r.rgsRef}</td>
                  <td className="py-3 px-4 font-mono text-slate-300">{r.providerRef}</td>
                  <td className="py-3 px-4 font-bold text-white">{r.amount}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono">{r.diff}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
