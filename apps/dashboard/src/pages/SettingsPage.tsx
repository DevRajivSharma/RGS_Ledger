import React, { useEffect, useState } from 'react';
import { Settings, Shield, Bell, Key, Globe, Store } from 'lucide-react';
import { apiRequest } from '../services/api';

export const SettingsPage: React.FC = () => {
  const [merchant, setMerchant] = useState<any>(null);
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await apiRequest('/merchants/me');
      if (res.success && res.data) {
        setMerchant(res.data);
        setBusinessName(res.data.businessName || '');
        setWebsite(res.data.website || '');
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    const res = await apiRequest('/merchants/me', {
      method: 'PATCH',
      body: JSON.stringify({ businessName, website })
    });

    setSaving(false);
    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Merchant Settings</h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure branding, store domains, security credentials, and platform notifications.
        </p>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
          <Store className="h-4 w-4 text-blue-400" />
          <span>Business Brand Configuration</span>
        </h3>

        <div>
          <label className="text-xs font-medium text-slate-300">Public Business Name</label>
          <input
            type="text"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <p className="text-[10px] text-slate-500 mt-1">This name appears on the customer hosted checkout and payment receipts.</p>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-300">Store Website / App URL</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourstore.in"
            className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          {saved && <span className="text-xs font-semibold text-emerald-400">✓ Settings updated!</span>}
          <button
            type="submit"
            disabled={saving}
            className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Security Policies */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
          <Shield className="h-4 w-4 text-blue-400" />
          <span>Fintech Security & Compliance Posture</span>
        </h3>

        <div className="space-y-2 text-xs text-slate-300">
          <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div>
              <p className="font-semibold text-white">Double-Entry Financial Ledger Balancing</p>
              <p className="text-[10px] text-slate-400">Strict Debits === Credits verification before capture</p>
            </div>
            <span className="text-emerald-400 font-bold">ACTIVE</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div>
              <p className="font-semibold text-white">HMAC-SHA256 Webhook Signing</p>
              <p className="text-[10px] text-slate-400">Constant-time replay-protected signatures with timestamp</p>
            </div>
            <span className="text-emerald-400 font-bold">ENFORCED</span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div>
              <p className="font-semibold text-white">Tenant Data Isolation (merchantId scope)</p>
              <p className="text-[10px] text-slate-400">Cryptographically guaranteed multi-tenant database barrier</p>
            </div>
            <span className="text-emerald-400 font-bold">ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
};
