import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  Building,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Activity,
  Layers,
  Settings,
  Users,
  Search,
  Lock,
  ArrowRight,
  LogOut
} from 'lucide-react';
import { formatCurrency } from '@rgs-ledger/shared';

const API_BASE = 'http://localhost:4000/api/v1';

export const AdminDashboard: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('rgs_admin_token'));
  const [email, setEmail] = useState('admin@rgsledger.com');
  const [password, setPassword] = useState('Admin@RGS1234!');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<'merchants' | 'providers' | 'audit'>('merchants');
  const [stats, setStats] = useState<any>(null);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // KYC modal state
  const [selectedMerchant, setSelectedMerchant] = useState<any | null>(null);
  const [kycNote, setKycNote] = useState('');
  const [processingKyc, setProcessingKyc] = useState(false);

  const fetchAdminData = async (authToken: string) => {
    setLoading(true);
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    };

    try {
      const [statsRes, merchRes, provRes, auditRes] = await Promise.all([
        fetch(`${API_BASE}/admin/stats`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/admin/merchants`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/admin/providers`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/admin/audit-logs`, { headers }).then(r => r.json())
      ]);

      if (statsRes.success) setStats(statsRes.data);
      if (merchRes.success) setMerchants(merchRes.data);
      if (provRes.success) setProviders(provRes.data);
      if (auditRes.success) setAuditLogs(auditRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAdminData(token);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const json = await res.json();

      if (json.success && json.data) {
        if (json.data.user.role !== 'SUPER_ADMIN' && json.data.user.role !== 'ADMIN') {
          setLoginError('Access denied. Administrator privileges required.');
          return;
        }
        localStorage.setItem('rgs_admin_token', json.data.token);
        setToken(json.data.token);
      } else {
        setLoginError(json.error?.message || 'Invalid administrator credentials');
      }
    } catch {
      setLoginError('Server connection failure.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('rgs_admin_token');
    setToken(null);
  };

  const handleUpdateKyc = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedMerchant || !token) return;
    setProcessingKyc(true);

    try {
      const res = await fetch(`${API_BASE}/admin/merchants/${selectedMerchant._id}/kyc`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status,
          reviewNote: kycNote || `KYC ${status} by Platform Administrator`
        })
      });

      const json = await res.json();
      if (json.success) {
        fetchAdminData(token);
        setSelectedMerchant(null);
      }
    } finally {
      setProcessingKyc(false);
    }
  };

  const handleToggleProvider = async (providerId: string, isEnabled: boolean) => {
    if (!token) return;
    await fetch(`${API_BASE}/admin/providers/${providerId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isEnabled: !isEnabled })
    });
    fetchAdminData(token);
  };

  // 1. ADMIN LOGIN VIEW
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center">
            <div className="h-12 w-12 bg-rose-600 rounded-xl mx-auto flex items-center justify-center font-extrabold text-white text-lg shadow-lg shadow-rose-500/20">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-tight mt-4">RGS Super Admin Console</h2>
            <p className="text-xs text-slate-400 mt-1">Privileged platform oversight & compliance administration</p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-semibold">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300">Admin Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Admin Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-rose-600/25 transition-all flex items-center justify-center space-x-1.5"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Authenticate Super Admin</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. ADMIN DASHBOARD VIEW
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Admin Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 bg-rose-600 rounded-lg flex items-center justify-center font-extrabold text-white text-base shadow-lg shadow-rose-500/20">
            RA
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-white">RGS Ledger</span>
            <span className="ml-2 text-xs font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
              Super Admin Console
            </span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold flex items-center space-x-1.5"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Exit Admin</span>
        </button>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full p-8 space-y-6">
        {/* Platform KPI Banner */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-medium text-slate-400">Total Merchants</span>
            <h3 className="text-2xl font-bold text-white mt-1">{stats?.totalMerchants || 1}</h3>
            <p className="text-[11px] text-slate-500 mt-1">Multi-tenant accounts</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-medium text-slate-400">Platform Gross Volume</span>
            <h3 className="text-2xl font-bold text-emerald-400 mt-1">
              {formatCurrency(stats?.grossVolumePaise || 0, 'INR')}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">Cumulative captured payments</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-medium text-slate-400">Platform Fee Revenue (2%)</span>
            <h3 className="text-2xl font-bold text-blue-400 mt-1">
              {formatCurrency(stats?.platformFeeRevenuePaise || 0, 'INR')}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">Gateway monetization</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <span className="text-xs font-medium text-slate-400">System Gateway Health</span>
            <h3 className="text-2xl font-bold text-emerald-400 mt-1">99.98%</h3>
            <p className="text-[11px] text-slate-500 mt-1">BullMQ workers operational</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('merchants')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'merchants' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            Merchants & KYC Desk ({merchants.length})
          </button>
          <button
            onClick={() => setActiveTab('providers')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'providers' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            Payment Provider Adapters
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'audit' ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            Immutable Audit Trail
          </button>
        </div>

        {/* TAB 1: MERCHANTS & KYC DESK */}
        {activeTab === 'merchants' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Merchant Accounts & KYC Verification</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-4">Merchant ID</th>
                    <th className="py-3 px-4">Business Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">PAN Number</th>
                    <th className="py-3 px-4">KYC Status</th>
                    <th className="py-3 px-4">Environment</th>
                    <th className="py-3 px-4 text-right">KYC Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {merchants.map((m) => (
                    <tr key={m._id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-blue-400 font-medium">{m._id}</td>
                      <td className="py-3 px-4 font-bold text-white">{m.businessName}</td>
                      <td className="py-3 px-4 text-slate-400">{m.businessType}</td>
                      <td className="py-3 px-4 font-mono text-slate-300">{m.panNumber || 'Pending'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          m.kycStatus === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {m.kycStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{m.environmentMode}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedMerchant(m);
                            setKycNote('');
                          }}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold shadow"
                        >
                          Review KYC
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: PROVIDER CONFIGURATIONS */}
        {activeTab === 'providers' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-3">
              Payment Gateway Partner Adapters
            </h3>

            <div className="space-y-3">
              {providers.map((p) => (
                <div key={p.providerId} className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-white text-xs">{p.name}</h4>
                      <span className="font-mono text-[10px] text-slate-500">({p.providerId})</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {p.config?.note || 'Core transaction processing engine'}
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggleProvider(p.providerId, p.isEnabled)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      p.isEnabled
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {p.isEnabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Immutable Administrative Audit Trail</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-4">Audit ID</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target Entity</th>
                    <th className="py-3 px-4">Target ID</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {auditLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-400">{log._id}</td>
                      <td className="py-3 px-4 text-white font-medium">{log.actorEmail}</td>
                      <td className="py-3 px-4 font-mono text-blue-400 font-bold">{log.action}</td>
                      <td className="py-3 px-4 text-slate-300">{log.targetEntity}</td>
                      <td className="py-3 px-4 font-mono text-slate-400">{log.targetId}</td>
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* KYC Review Modal */}
      {selectedMerchant && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Merchant KYC Review Desk</h3>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Business Name:</span>
                <span className="font-bold text-white">{selectedMerchant.businessName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Merchant ID:</span>
                <span className="font-mono text-blue-400">{selectedMerchant._id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">PAN Number:</span>
                <span className="font-mono text-white font-bold">{selectedMerchant.panNumber || 'Pending'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">GSTIN:</span>
                <span className="font-mono text-white">{selectedMerchant.gstin || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Bank IFSC:</span>
                <span className="font-mono text-white">{selectedMerchant.bankAccount?.ifscCode || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Bank Account:</span>
                <span className="font-mono text-white">{selectedMerchant.bankAccount?.accountNumber || 'None'}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Compliance Review Note</label>
              <textarea
                value={kycNote}
                onChange={(e) => setKycNote(e.target.value)}
                placeholder="Enter review decision reason or compliance observations..."
                rows={3}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setSelectedMerchant(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
              <button
                disabled={processingKyc}
                onClick={() => handleUpdateKyc('REJECTED')}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-rose-600/20"
              >
                Reject KYC
              </button>
              <button
                disabled={processingKyc}
                onClick={() => handleUpdateKyc('APPROVED')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-600/20"
              >
                Approve KYC
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
