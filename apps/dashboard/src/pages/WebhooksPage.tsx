import React, { useEffect, useState } from 'react';
import { Webhook, Plus, RotateCw, CheckCircle2, XCircle, ShieldCheck, Key } from 'lucide-react';
import { apiRequest } from '../services/api';

const AVAILABLE_EVENTS = [
  'order.created',
  'payment.created',
  'payment.succeeded',
  'payment.failed',
  'refund.processed',
  'settlement.processed'
];

export const WebhooksPage: React.FC = () => {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Form
  const [url, setUrl] = useState('https://webhook.site/test-endpoint');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    'payment.succeeded',
    'payment.failed',
    'refund.processed'
  ]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [epRes, delRes] = await Promise.all([
      apiRequest('/webhooks'),
      apiRequest('/webhooks/deliveries')
    ]);

    if (epRes.success && epRes.data) setEndpoints(epRes.data);
    if (delRes.success && delRes.data) setDeliveries(delRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreateEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/webhooks', {
      method: 'POST',
      body: JSON.stringify({ url, events: selectedEvents })
    });

    if (res.success) {
      setModalOpen(false);
      loadData();
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this webhook endpoint?')) {
      const res = await apiRequest(`/webhooks/${id}`, { method: 'DELETE' });
      if (res.success) loadData();
    }
  };

  const handleRetry = async (deliveryId: string) => {
    setRetryingId(deliveryId);
    await apiRequest(`/webhooks/deliveries/${deliveryId}/retry`, { method: 'POST' });
    setTimeout(() => {
      setRetryingId(null);
      loadData();
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Webhooks</h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure HTTP callbacks signed with HMAC-SHA256 for real-time payment notifications.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Add Webhook Endpoint</span>
        </button>
      </div>

      {/* Endpoints List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white">Registered Endpoints</h3>
        </div>

        <div className="divide-y divide-slate-800 text-xs">
          {endpoints.length > 0 ? (
            endpoints.map((ep) => (
              <div key={ep._id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-sm font-bold text-white">{ep.url}</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-semibold">
                      Active
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 mt-2">
                    <Key className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    <span className="font-mono text-[11px] text-slate-400">Signing Secret:</span>
                    <span className="font-mono text-[11px] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {ep.secretKey}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ep.events?.map((ev: string) => (
                      <span key={ev} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(ep._id)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-rose-500/20 text-rose-400 rounded border border-slate-700 text-xs font-semibold transition-all"
                >
                  Delete
                </button>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-slate-500">
              No webhook endpoints configured. Click "Add Webhook Endpoint" to receive payment events.
            </div>
          )}
        </div>
      </div>

      {/* Deliveries Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Webhook Delivery Log (BullMQ Outbox)</h3>
          <button onClick={loadData} className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1">
            <RotateCw className="h-3 w-3" />
            <span>Refresh Logs</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Delivery ID</th>
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">Status Code</th>
                <th className="py-3 px-4">Result</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4 text-right">Retry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {deliveries.length > 0 ? (
                deliveries.map((del) => (
                  <tr key={del._id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-400">{del._id}</td>
                    <td className="py-3 px-4 font-mono text-blue-400 font-semibold">{del.event}</td>
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {del.statusCode ? del.statusCode : '—'}
                    </td>
                    <td className="py-3 px-4">
                      {del.isSuccessful ? (
                        <span className="inline-flex items-center text-emerald-400 space-x-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Delivered</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-rose-400 space-x-1">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(del.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleRetry(del._id)}
                        disabled={retryingId === del._id}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[11px] font-semibold transition-all"
                      >
                        {retryingId === del._id ? 'Sending...' : 'Retry'}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No webhook deliveries yet. Deliveries trigger automatically when payments or refunds complete.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white">Register Webhook Endpoint</h3>
            <p className="text-xs text-slate-400 mt-1">
              Events will be dispatched with HMAC-SHA256 signature in `x-rgs-signature`.
            </p>

            <form onSubmit={handleCreateEndpoint} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Endpoint Destination URL</label>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://yourdomain.com/api/webhooks/rgs"
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-2">Subscribe to Events</label>
                <div className="grid grid-cols-1 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-48 overflow-y-auto">
                  {AVAILABLE_EVENTS.map((ev) => (
                    <label key={ev} className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(ev)}
                        onChange={() => handleToggleEvent(ev)}
                        className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      <span className="font-mono text-[11px]">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={selectedEvents.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  Save Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
