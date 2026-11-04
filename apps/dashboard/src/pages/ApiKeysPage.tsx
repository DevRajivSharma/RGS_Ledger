import React, { useEffect, useState } from 'react';
import { KeyRound, Plus, Copy, Check, RotateCw, Trash2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../services/api';

export const ApiKeysPage: React.FC = () => {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyModal, setNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('Production Test Key');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const loadKeys = async () => {
    setLoading(true);
    const res = await apiRequest('/api-keys');
    if (res.success && res.data) {
      setKeys(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiRequest('/api-keys', {
      method: 'POST',
      body: JSON.stringify({
        name: newKeyName,
        environment: 'SANDBOX'
      })
    });

    if (res.success && res.data) {
      setCreatedSecret(res.data.secretKey);
      loadKeys();
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (confirm(`Are you sure you want to revoke API Key ${keyId}? Any active integrations using this key will immediately fail.`)) {
      const res = await apiRequest(`/api-keys/${keyId}`, { method: 'DELETE' });
      if (res.success) {
        loadKeys();
      }
    }
  };

  const handleRotate = async (keyId: string) => {
    if (confirm(`Rotate API key ${keyId}? A new secret key will be generated.`)) {
      const res = await apiRequest(`/api-keys/${keyId}/rotate`, { method: 'POST' });
      if (res.success && res.data) {
        setCreatedSecret(res.data.secretKey);
        setNewKeyModal(true);
        loadKeys();
      }
    }
  };

  const copySecret = () => {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">API Key Management</h2>
          <p className="text-xs text-slate-400 mt-1">
            Generate and manage secret keys for REST API and SDK backend integrations.
          </p>
        </div>
        <button
          onClick={() => {
            setCreatedSecret(null);
            setNewKeyModal(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Generate New Key</span>
        </button>
      </div>

      {/* Security Banner */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs flex items-start space-x-3 text-slate-300">
        <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-white">Fintech Security Best Practice</p>
          <p className="text-slate-400 mt-0.5">
            Never expose secret API keys (`rl_test_sk_...` / `rl_live_sk_...`) in client-side JavaScript, mobile apps, or public GitHub repositories. Use them exclusively on your backend server.
          </p>
        </div>
      </div>

      {/* Keys Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Key Name</th>
                <th className="py-3 px-4">Public Key ID</th>
                <th className="py-3 px-4">Secret Prefix</th>
                <th className="py-3 px-4">Environment</th>
                <th className="py-3 px-4">Last Used</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {keys.length > 0 ? (
                keys.map((k) => (
                  <tr key={k._id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">{k.name}</td>
                    <td className="py-3 px-4 font-mono text-blue-400">{k.keyId}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{k.prefix}••••••••</td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {k.environment}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleRotate(k.keyId)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                        title="Rotate key"
                      >
                        <RotateCw className="h-3 w-3 text-blue-400" />
                        <span>Rotate</span>
                      </button>
                      <button
                        onClick={() => handleRevoke(k.keyId)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded border border-slate-700 text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                        title="Revoke key"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Revoke</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    {loading ? 'Loading API keys...' : 'No active API keys found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {newKeyModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white">Generate API Key</h3>

            {createdSecret ? (
              <div className="mt-4 space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs space-y-2">
                  <div className="flex items-center space-x-2 font-bold text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Save your Secret Key now!</span>
                  </div>
                  <p className="text-slate-300">
                    This is the only time this secret key will ever be displayed. Store it in a secure password manager or environment variable.
                  </p>
                  <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] text-white">
                    <span className="truncate mr-2 font-bold select-all">{createdSecret}</span>
                    <button
                      onClick={copySecret}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white flex items-center space-x-1 shrink-0 font-sans"
                    >
                      {copiedSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setNewKeyModal(false)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
                >
                  I Have Stored It Securely
                </button>
              </div>
            ) : (
              <form onSubmit={handleGenerateKey} className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300">Key Name</label>
                  <input
                    type="text"
                    required
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="mt-6 flex items-center justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setNewKeyModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20"
                  >
                    Create Key
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
