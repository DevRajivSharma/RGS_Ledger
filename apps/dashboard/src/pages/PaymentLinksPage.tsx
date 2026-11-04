import React, { useEffect, useState } from 'react';
import { Link2, Plus, Copy, Check, ExternalLink, Ban } from 'lucide-react';
import { apiRequest } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { formatCurrency } from '@rgs-ledger/shared';

export const PaymentLinksPage: React.FC = () => {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('Payment for Web Design Services');
  const [amountRupees, setAmountRupees] = useState('1500.00');
  const [description, setDescription] = useState('Invoice payment for milestone #1');
  const [customerEmail, setCustomerEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadLinks = async () => {
    setLoading(true);
    const res = await apiRequest('/payment-links');
    if (res.success && res.data) {
      setLinks(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadLinks();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    const amountPaise = Math.round(parseFloat(amountRupees) * 100);

    const res = await apiRequest('/payment-links', {
      method: 'POST',
      body: JSON.stringify({
        title,
        amount: amountPaise,
        currency: 'INR',
        description,
        customer: customerEmail ? { email: customerEmail } : undefined
      })
    });

    setCreating(false);
    if (res.success) {
      setModalOpen(false);
      loadLinks();
    }
  };

  const copyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeactivate = async (id: string) => {
    const res = await apiRequest(`/payment-links/${id}/deactivate`, { method: 'POST' });
    if (res.success) {
      loadLinks();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Payment Links</h2>
          <p className="text-xs text-slate-400 mt-1">
            Create instant shareable payment URLs for invoices, social commerce, and customers.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Create Payment Link</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Link ID</th>
                <th className="py-3 px-4">Title / Purpose</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Checkout URL</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {links.length > 0 ? (
                links.map((link) => {
                  const url = `http://localhost:5174/pay/cs_sample_${link._id.slice(-6)}`;
                  return (
                    <tr key={link._id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-blue-400 font-medium">{link._id}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{link.title}</div>
                        {link.description && <div className="text-[10px] text-slate-400 truncate max-w-xs">{link.description}</div>}
                      </td>
                      <td className="py-3 px-4 font-bold text-white">{formatCurrency(link.amount, link.currency)}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={link.status} />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-800 rounded px-2 py-1 max-w-[200px]">
                          <span className="font-mono text-[11px] text-slate-300 truncate">{url}</span>
                          <button
                            onClick={() => copyUrl(link._id, url)}
                            className="text-slate-400 hover:text-white shrink-0"
                            title="Copy link"
                          >
                            {copiedId === link._id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(link.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {link.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleDeactivate(link._id)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded text-[11px] font-semibold border border-slate-700 inline-flex items-center space-x-1"
                          >
                            <Ban className="h-3 w-3" />
                            <span>Deactivate</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading payment links...' : 'No payment links created yet.'}
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
            <h3 className="text-lg font-bold text-white">Create Payment Link</h3>
            <p className="text-xs text-slate-400 mt-1">
              Generate a reusable hosted checkout URL for customers to pay via UPI or Cards.
            </p>

            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300">Link Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

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
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300">Customer Email (Optional)</label>
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
                  {creating ? 'Creating...' : 'Create Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
