import React, { useEffect, useState } from 'react';
import { Users, Mail, Phone, ShoppingCart } from 'lucide-react';
import { apiRequest } from '../services/api';
import { formatCurrency } from '@rgs-ledger/shared';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCustomers() {
      setLoading(true);
      const res = await apiRequest('/customers');
      if (res.success && res.data) {
        setCustomers(res.data);
      }
      setLoading(false);
    }
    loadCustomers();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Customers</h2>
        <p className="text-xs text-slate-400 mt-1">
          Customer profiles, contact metadata, and lifetime transaction value.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Customer ID</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Total Captured</th>
                <th className="py-3 px-4">Payments Count</th>
                <th className="py-3 px-4">Joined Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {customers.length > 0 ? (
                customers.map((c) => (
                  <tr key={c._id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-blue-400 font-medium">{c._id}</td>
                    <td className="py-3 px-4 font-bold text-white">{c.name}</td>
                    <td className="py-3 px-4 text-slate-300">{c.email || '—'}</td>
                    <td className="py-3 px-4 text-slate-300 font-mono">{c.phone || '—'}</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">
                      {formatCurrency(c.totalPaymentsPaise || 0, 'INR')}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-medium">{c.paymentsCount || 0}</td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading customers...' : 'No customers recorded yet.'}
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
