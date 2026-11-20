import React, { useState, useEffect, useCallback } from 'react';
import { NonCustodialDisclosureBanner, StatusBadge } from '@rgs-ledger/ui';
import { PaymentStatus } from '@rgs-ledger/shared-types';
import {
  PlatformOverviewMetricsDto,
  AdminMerchantSummaryDto,
  AdminMerchantDetailDto,
  AdminTransactionDto,
  AdminReconciliationCaseDto,
  PlatformConfigDto
} from '@rgs-ledger/api-contracts';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface AdminSession {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export default function App() {
  // Session State
  const [session, setSession] = useState<AdminSession | null>(() => {
    const saved = localStorage.getItem('rgs_admin_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  // Auth Forms State
  const [authMode, setAuthMode] = useState<'login' | 'bootstrap'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [bootstrapName, setBootstrapName] = useState('System Administrator');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Navigation State
  const [activeTab, setActiveTab] = useState<'overview' | 'merchants' | 'transactions' | 'reconciliation' | 'monitoring' | 'config' | 'audit'>('overview');

  // Overview Data
  const [metrics, setMetrics] = useState<PlatformOverviewMetricsDto | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Merchants Data
  const [merchants, setMerchants] = useState<AdminMerchantSummaryDto[]>([]);
  const [merchantSearch, setMerchantSearch] = useState('');
  const [merchantStatusFilter, setMerchantStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [selectedMerchantDetail, setSelectedMerchantDetail] = useState<AdminMerchantDetailDto | null>(null);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [suspendModalMerchant, setSuspendModalMerchant] = useState<AdminMerchantSummaryDto | null>(null);
  const [suspensionReason, setSuspensionReason] = useState('');

  // Transactions Data
  const [transactions, setTransactions] = useState<AdminTransactionDto[]>([]);
  const [txSearch, setTxSearch] = useState('');
  const [txStatusFilter, setTxStatusFilter] = useState<string>('ALL');
  const [loadingTx, setLoadingTx] = useState(false);
  const [selectedTxDetail, setSelectedTxDetail] = useState<AdminTransactionDto | null>(null);

  // Reconciliation Data
  const [reconciliationCases, setReconciliationCases] = useState<AdminReconciliationCaseDto[]>([]);
  const [reconciliationStatusFilter, setReconciliationStatusFilter] = useState<string>('ALL');
  const [loadingReconciliation, setLoadingReconciliation] = useState(false);
  const [resolvingCase, setResolvingCase] = useState<AdminReconciliationCaseDto | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<'RESOLVED' | 'DISMISSED'>('RESOLVED');
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Monitoring Data
  const [monitoringTab, setMonitoringTab] = useState<'devices' | 'integrations' | 'webhooks' | 'worker'>('devices');
  const [monitoredDevices, setMonitoredDevices] = useState<any[]>([]);
  const [monitoredIntegrations, setMonitoredIntegrations] = useState<any[]>([]);
  const [monitoredWebhooks, setMonitoredWebhooks] = useState<any[]>([]);
  const [monitoredWorker, setMonitoredWorker] = useState<any | null>(null);
  const [loadingMonitoring, setLoadingMonitoring] = useState(false);

  // Platform Config
  const [platformConfig, setPlatformConfig] = useState<PlatformConfigDto | null>(null);
  const [configForm, setConfigForm] = useState<Partial<PlatformConfigDto>>({});
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);
  const [configErrorMsg, setConfigErrorMsg] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Audit Logs Data
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Feedback Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Helper for authenticated API calls
  const apiFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      if (!session) throw new Error('Unauthenticated');
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
        ...options.headers
      };
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      if (res.status === 401) {
        localStorage.removeItem('rgs_admin_session');
        setSession(null);
        throw new Error('Session expired. Please sign in again.');
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Request failed with code ${res.status}`);
      }
      return data;
    },
    [session]
  );

  // Authentication Handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Login failed');
      const newSession: AdminSession = {
        token: data.data.tokens.accessToken,
        user: data.data.user
      };
      localStorage.setItem('rgs_admin_session', JSON.stringify(newSession));
      setSession(newSession);
      showToast('Welcome, Administrator');
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/auth/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bootstrapName,
          email: loginEmail,
          password: loginPassword,
          bootstrapSecret: bootstrapSecret
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Bootstrap failed');
      const newSession: AdminSession = {
        token: data.data.tokens.accessToken,
        user: data.data.user
      };
      localStorage.setItem('rgs_admin_session', JSON.stringify(newSession));
      setSession(newSession);
      showToast('System Administrator initialized successfully.');
    } catch (err: any) {
      setAuthError(err.message || 'Bootstrap initialization failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (session) {
        await apiFetch('/api/v1/admin/auth/logout', { method: 'POST' }).catch(() => {});
      }
    } finally {
      localStorage.removeItem('rgs_admin_session');
      setSession(null);
    }
  };

  // Data Fetchers
  const fetchMetrics = useCallback(async () => {
    if (!session) return;
    setLoadingMetrics(true);
    try {
      const res = await apiFetch('/api/v1/admin/metrics');
      setMetrics(res.data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingMetrics(false);
    }
  }, [session, apiFetch]);

  const fetchMerchants = useCallback(async () => {
    if (!session) return;
    setLoadingMerchants(true);
    try {
      const params = new URLSearchParams();
      if (merchantSearch) params.set('search', merchantSearch);
      if (merchantStatusFilter !== 'ALL') params.set('status', merchantStatusFilter);
      const res = await apiFetch(`/api/v1/admin/merchants?${params.toString()}`);
      setMerchants(res.data.items || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingMerchants(false);
    }
  }, [session, apiFetch, merchantSearch, merchantStatusFilter]);

  const fetchMerchantDetail = async (id: string) => {
    try {
      const res = await apiFetch(`/api/v1/admin/merchants/${id}`);
      setSelectedMerchantDetail(res.data);
    } catch (err: any) {
      alert(`Error loading merchant details: ${err.message}`);
    }
  };

  const handleSuspendMerchant = async () => {
    if (!suspendModalMerchant || !suspensionReason.trim()) return;
    try {
      await apiFetch(`/api/v1/admin/merchants/${suspendModalMerchant.id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason: suspensionReason.trim() })
      });
      showToast(`Merchant ${suspendModalMerchant.name} suspended. Records preserved.`);
      setSuspendModalMerchant(null);
      setSuspensionReason('');
      fetchMerchants();
      fetchMetrics();
    } catch (err: any) {
      alert(`Suspension failed: ${err.message}`);
    }
  };

  const handleReactivateMerchant = async (merchant: AdminMerchantSummaryDto) => {
    if (!confirm(`Reactivate payment processing for merchant ${merchant.name}?`)) return;
    try {
      await apiFetch(`/api/v1/admin/merchants/${merchant.id}/reactivate`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Reactivated by administrator' })
      });
      showToast(`Merchant ${merchant.name} reactivated successfully.`);
      fetchMerchants();
      fetchMetrics();
    } catch (err: any) {
      alert(`Reactivation failed: ${err.message}`);
    }
  };

  const fetchTransactions = useCallback(async () => {
    if (!session) return;
    setLoadingTx(true);
    try {
      const params = new URLSearchParams();
      if (txSearch) params.set('search', txSearch);
      if (txStatusFilter !== 'ALL') params.set('status', txStatusFilter);
      const res = await apiFetch(`/api/v1/admin/transactions?${params.toString()}`);
      setTransactions(res.data.items || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingTx(false);
    }
  }, [session, apiFetch, txSearch, txStatusFilter]);

  const fetchReconciliation = useCallback(async () => {
    if (!session) return;
    setLoadingReconciliation(true);
    try {
      const params = new URLSearchParams();
      if (reconciliationStatusFilter !== 'ALL') params.set('status', reconciliationStatusFilter);
      const res = await apiFetch(`/api/v1/admin/reconciliation/cases?${params.toString()}`);
      setReconciliationCases(res.data.items || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingReconciliation(false);
    }
  }, [session, apiFetch, reconciliationStatusFilter]);

  const handleResolveCase = async () => {
    if (!resolvingCase || !resolutionNotes.trim()) return;
    try {
      await apiFetch(`/api/v1/admin/reconciliation/cases/${resolvingCase.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolutionStatus,
          resolutionNotes: resolutionNotes.trim()
        })
      });
      showToast(`Case ${resolvingCase.id.slice(-6)} marked as ${resolutionStatus}. Dual-source invariants intact.`);
      setResolvingCase(null);
      setResolutionNotes('');
      fetchReconciliation();
      fetchMetrics();
    } catch (err: any) {
      alert(`Resolution failed: ${err.message}`);
    }
  };

  const fetchMonitoring = useCallback(async () => {
    if (!session) return;
    setLoadingMonitoring(true);
    try {
      if (monitoringTab === 'devices') {
        const res = await apiFetch('/api/v1/admin/monitoring/devices');
        setMonitoredDevices(res.data.items || []);
      } else if (monitoringTab === 'integrations') {
        const res = await apiFetch('/api/v1/admin/monitoring/integrations');
        setMonitoredIntegrations(res.data.items || []);
      } else if (monitoringTab === 'webhooks') {
        const res = await apiFetch('/api/v1/admin/monitoring/webhooks');
        setMonitoredWebhooks(res.data.items || []);
      } else if (monitoringTab === 'worker') {
        const res = await apiFetch('/api/v1/admin/monitoring/worker');
        setMonitoredWorker(res.data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingMonitoring(false);
    }
  }, [session, apiFetch, monitoringTab]);

  const fetchConfig = useCallback(async () => {
    if (!session) return;
    setLoadingConfig(true);
    try {
      const res = await apiFetch('/api/v1/admin/config');
      setPlatformConfig(res.data);
      setConfigForm(res.data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingConfig(false);
    }
  }, [session, apiFetch]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSuccessMsg(null);
    setConfigErrorMsg(null);
    try {
      const payload = {
        paymentExpirySeconds: Number(configForm.paymentExpirySeconds),
        evidenceMatchingWindowSeconds: Number(configForm.evidenceMatchingWindowSeconds),
        reconciliationScheduleIntervalSeconds: Number(configForm.reconciliationScheduleIntervalSeconds),
        webhookMaxRetries: Number(configForm.webhookMaxRetries),
        webhookBackoffFactor: Number(configForm.webhookBackoffFactor),
        evidenceRetentionDays: Number(configForm.evidenceRetentionDays),
        rateLimitPerMinute: Number(configForm.rateLimitPerMinute)
      };
      const res = await apiFetch('/api/v1/admin/config', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      setPlatformConfig(res.data);
      setConfigSuccessMsg(res.data.message || 'Platform settings updated successfully.');
      showToast('Platform operational settings saved.');
    } catch (err: any) {
      setConfigErrorMsg(err.message || 'Failed to update configuration.');
    }
  };

  const fetchAudit = useCallback(async () => {
    if (!session) return;
    setLoadingAudit(true);
    try {
      const params = new URLSearchParams();
      if (auditActionFilter) params.set('action', auditActionFilter);
      const res = await apiFetch(`/api/v1/admin/audit-logs?${params.toString()}`);
      setAuditLogs(res.data.items || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingAudit(false);
    }
  }, [session, apiFetch, auditActionFilter]);

  // Load active tab data on navigation
  useEffect(() => {
    if (!session) return;
    if (activeTab === 'overview') fetchMetrics();
    else if (activeTab === 'merchants') fetchMerchants();
    else if (activeTab === 'transactions') fetchTransactions();
    else if (activeTab === 'reconciliation') fetchReconciliation();
    else if (activeTab === 'monitoring') fetchMonitoring();
    else if (activeTab === 'config') fetchConfig();
    else if (activeTab === 'audit') fetchAudit();
  }, [session, activeTab, fetchMetrics, fetchMerchants, fetchTransactions, fetchReconciliation, fetchMonitoring, fetchConfig, fetchAudit]);

  // --------------------------------------------------------------------------
  // AUTHENTICATION SCREEN (LOGIN / BOOTSTRAP)
  // --------------------------------------------------------------------------
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '420px', width: '100%', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: '#4F46E5', textTransform: 'uppercase', background: '#EEF2FF', padding: '4px 10px', borderRadius: '999px' }}>
              Platform Operations
            </span>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#111827', marginTop: '12px', letterSpacing: '-0.02em' }}>
              RGS Ledger Admin Console
            </h1>
            <p style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
              Restricted to platform systems administrators
            </p>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', marginBottom: '20px' }}>
            <button
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              style={{ flex: 1, padding: '8px', border: 'none', background: 'none', fontWeight: 600, fontSize: '13px', color: authMode === 'login' ? '#4F46E5' : '#6B7280', borderBottom: authMode === 'login' ? '2px solid #4F46E5' : 'none', cursor: 'pointer' }}
            >
              Administrator Sign In
            </button>
            <button
              onClick={() => { setAuthMode('bootstrap'); setAuthError(null); }}
              style={{ flex: 1, padding: '8px', border: 'none', background: 'none', fontWeight: 600, fontSize: '13px', color: authMode === 'bootstrap' ? '#4F46E5' : '#6B7280', borderBottom: authMode === 'bootstrap' ? '2px solid #4F46E5' : 'none', cursor: 'pointer' }}
            >
              Bootstrap First Admin
            </button>
          </div>

          {authError && (
            <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #F87171', borderRadius: '6px', color: '#B91C1C', fontSize: '13px', marginBottom: '16px' }}>
              {authError}
            </div>
          )}

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@rgsledger.internal"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                style={{ marginTop: '8px', padding: '10px', background: '#4F46E5', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '14px', cursor: authLoading ? 'not-allowed' : 'pointer' }}
              >
                {authLoading ? 'Verifying Credentials...' : 'Authenticate to Admin Console'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleBootstrap} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Administrator Full Name
                </label>
                <input
                  type="text"
                  required
                  value={bootstrapName}
                  onChange={(e) => setBootstrapName(e.target.value)}
                  placeholder="System Administrator"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Master Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@rgsledger.internal"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Master Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Server Bootstrap Secret (ADMIN_BOOTSTRAP_SECRET)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={bootstrapSecret}
                  onChange={(e) => setBootstrapSecret(e.target.value)}
                  placeholder="Entered from server environment"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                />
              </div>

              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', padding: '10px', borderRadius: '6px', fontSize: '11px', color: '#92400E' }}>
                Note: Server bootstrap secret is validated server-side. Bootstrap is permanently locked once the first administrator account is created.
              </div>

              <button
                type="submit"
                disabled={authLoading}
                style={{ marginTop: '8px', padding: '10px', background: '#059669', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '14px', cursor: authLoading ? 'not-allowed' : 'pointer' }}
              >
                {authLoading ? 'Initializing Platform...' : 'Initialize Primary System Admin'}
              </button>
            </form>
          )}

          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #F3F4F6', fontSize: '11px', color: '#9CA3AF', textAlign: 'center' }}>
            Merchant accounts cannot access this console. Merchant accounts sign in via the Merchant Dashboard.
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MAIN ADMIN CONSOLE LAYOUT
  // --------------------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#111827', color: '#FFFFFF', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '13px', zIndex: 9999, fontWeight: 500 }}>
          {toastMessage}
        </div>
      )}

      {/* Top Platform Bar */}
      <header style={{ background: '#0F172A', color: '#FFFFFF', borderBottom: '1px solid #1E293B', padding: '0 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#6366F1' }}>RGS Ledger</span>
              <span style={{ fontSize: '12px', fontWeight: 600, background: '#312E81', color: '#C7D2FE', padding: '2px 8px', borderRadius: '4px' }}>
                SYSTEM ADMIN
              </span>
            </div>
            <span style={{ color: '#475569', fontSize: '14px' }}>|</span>
            <span style={{ color: '#94A3B8', fontSize: '13px' }}>Operations & Evidence Verification Console</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '12px', color: '#94A3B8', background: '#1E293B', padding: '4px 10px', borderRadius: '6px' }}>
              {session.user.email}
            </span>
            <button
              onClick={handleLogout}
              style={{ padding: '6px 12px', background: '#334155', color: '#F1F5F9', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Sub-header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', padding: '0 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '4px', overflowX: 'auto' }}>
          {[
            { id: 'overview', label: 'Platform Overview' },
            { id: 'merchants', label: 'Merchant Directory' },
            { id: 'transactions', label: 'Transaction Explorer' },
            { id: 'reconciliation', label: 'Reconciliation Cases' },
            { id: 'monitoring', label: 'Devices & Integrations' },
            { id: 'config', label: 'Platform Config' },
            { id: 'audit', label: 'Audit Logs' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '14px 18px',
                border: 'none',
                background: 'none',
                fontWeight: activeTab === tab.id ? 700 : 500,
                fontSize: '13px',
                color: activeTab === tab.id ? '#4F46E5' : '#64748B',
                borderBottom: activeTab === tab.id ? '2px solid #4F46E5' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Container */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {/* TAB 1: PLATFORM OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Platform Operational Overview</h2>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Real-time aggregation across merchants, payment intents, independently matched evidence, and companion health.
                </p>
              </div>
              <button
                onClick={fetchMetrics}
                disabled={loadingMetrics}
                style={{ padding: '8px 14px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
              >
                {loadingMetrics ? 'Refreshing...' : '↻ Refresh Data'}
              </button>
            </div>

            {/* Core Fintech Transparency Disclaimer */}
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '14px 18px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span style={{ fontSize: '18px' }}>ℹ️</span>
                <div style={{ fontSize: '13px', color: '#1E40AF', lineHeight: '1.5' }}>
                  <strong>Financial & Architecture Disclosure:</strong> RGS Ledger is a non-custodial evidence-matching platform. Total payment request value represents customer QR payment intent. Only value in <strong>SUCCESS</strong> status satisfies the independent dual-source verification policy (Email + Android companion push notification).
                </div>
              </div>
            </div>

            {metrics && (
              <>
                {/* Metrics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '18px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Total Registered Merchants</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>{metrics.merchants.total}</div>
                    <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>
                      {metrics.merchants.active} Active · {metrics.merchants.suspended} Suspended
                    </div>
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '18px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Total Payment Requests</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>{metrics.payments.total}</div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                      Intent Volume: ₹{(metrics.payments.totalRequestedValuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '18px', backgroundClip: 'padding-box' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#15803D' }}>Dual-Source Verified (SUCCESS)</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#166534', marginTop: '6px' }}>
                      ₹{(metrics.payments.totalSuccessValuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '12px', color: '#15803D', marginTop: '4px' }}>
                      Count: {metrics.payments.byStatus[PaymentStatus.SUCCESS] || 0} verified transactions
                    </div>
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #FED7AA', borderRadius: '8px', padding: '18px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#C2410C' }}>Partial Matches (1 Source)</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#9A3412', marginTop: '6px' }}>
                      {metrics.payments.partialSuccessCount}
                    </div>
                    <div style={{ fontSize: '12px', color: '#C2410C', marginTop: '4px' }}>
                      Awaiting 2nd evidence source
                    </div>
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #FECDD3', borderRadius: '8px', padding: '18px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#BE123C' }}>Review & Reconciliation Required</div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#9F1239', marginTop: '6px' }}>
                      {metrics.payments.reviewRequiredCount + metrics.payments.reconciliationRequiredCount}
                    </div>
                    <div style={{ fontSize: '12px', color: '#BE123C', marginTop: '4px' }}>
                      {metrics.payments.reviewRequiredCount} Review · {metrics.payments.reconciliationRequiredCount} Reconcile
                    </div>
                  </div>
                </div>

                {/* Status Breakdown & Operational Health Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>Payment Status Distribution</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {Object.entries(metrics.payments.byStatus).map(([status, count]) => (
                        <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <StatusBadge status={status as any} />
                            <span style={{ fontSize: '12px', color: '#475569' }}>{status}</span>
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>Operational Health Indicators</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>Active Android Companion Devices</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>In-device NotificationListener capture</div>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#059669' }}>{metrics.devices.activeCount}</div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>Connected Email Integrations</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Automated bank alert ingestion (Gmail)</div>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#0284C7' }}>{metrics.integrations.connectedEmailCount}</div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>Open Reconciliation Cases</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Late evidence, disputed UTRs, amount discrepancies</div>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: metrics.reconciliation.openCasesCount > 0 ? '#DC2626' : '#166534' }}>
                          {metrics.reconciliation.openCasesCount}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>Failed / Dead-Letter Webhook Deliveries</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Merchant endpoint outages exceeding retry limits</div>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: metrics.webhooks.deliveryFailuresCount > 0 ? '#DC2626' : '#166534' }}>
                          {metrics.webhooks.deliveryFailuresCount}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: MERCHANT MANAGEMENT */}
        {activeTab === 'merchants' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Merchant Directory & Oversight</h2>
                <p style={{ fontSize: '13px', color: '#64748B' }}>Inspect merchant accounts, configuration, payment statistics, and account status.</p>
              </div>
              <button
                onClick={fetchMerchants}
                style={{ padding: '8px 14px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                ↻ Refresh Directory
              </button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', background: '#FFFFFF', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <input
                type="text"
                placeholder="Search by name, email, or UPI VPA..."
                value={merchantSearch}
                onChange={(e) => setMerchantSearch(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
              <select
                value={merchantStatusFilter}
                onChange={(e: any) => setMerchantStatusFilter(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', background: '#FFFFFF' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="SUSPENDED">Suspended Only</option>
              </select>
            </div>

            {/* Table */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                  <tr>
                    <th style={{ padding: '12px 16px' }}>Merchant</th>
                    <th style={{ padding: '12px 16px' }}>Default VPA</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Accounts & Devices</th>
                    <th style={{ padding: '12px 16px' }}>Payments (Success/Total)</th>
                    <th style={{ padding: '12px 16px' }}>Verified Amount</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
                        {loadingMerchants ? 'Loading merchants...' : 'No merchants found matching your query.'}
                      </td>
                    </tr>
                  ) : (
                    merchants.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{m.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>{m.email}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#334155' }}>
                          {m.defaultVpa || '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: m.status === 'ACTIVE' ? '#DEF7EC' : '#FDE8E8',
                            color: m.status === 'ACTIVE' ? '#03543F' : '#9B1C1C'
                          }}>
                            {m.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#475569' }}>
                          {m.bankAccountsCount} Bank Acc · {m.activeDevicesCount} Device{m.activeDevicesCount === 1 ? '' : 's'} · {m.emailIntegrationConnected ? '✓ Email' : '✗ Email'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          <strong>{m.successPaymentsCount}</strong> / {m.totalPaymentsCount}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#15803D' }}>
                          ₹{(m.totalSuccessPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => fetchMerchantDetail(m.id)}
                            style={{ padding: '5px 10px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, marginRight: '6px', cursor: 'pointer' }}
                          >
                            Details
                          </button>
                          {m.status === 'ACTIVE' ? (
                            <button
                              onClick={() => { setSuspendModalMerchant(m); setSuspensionReason(''); }}
                              style={{ padding: '5px 10px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivateMerchant(m)}
                              style={{ padding: '5px 10px', background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#047857', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Reactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Merchant Details Modal */}
            {selectedMerchantDetail && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                <div style={{ background: '#FFFFFF', borderRadius: '12px', maxWidth: '750px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                        {selectedMerchantDetail.merchant.name}
                      </h3>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                        ID: {selectedMerchantDetail.merchant.id} · Registered: {new Date(selectedMerchantDetail.merchant.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedMerchantDetail(null)}
                      style={{ padding: '6px 12px', background: '#F1F5F9', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* Summary Stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
                    <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>Total Requests</div>
                      <div style={{ fontSize: '16px', fontWeight: 700 }}>{selectedMerchantDetail.stats.totalPayments}</div>
                    </div>
                    <div style={{ background: '#F0FDF4', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#166534' }}>Verified Success</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#166534' }}>{selectedMerchantDetail.stats.successPayments}</div>
                    </div>
                    <div style={{ background: '#FFF7ED', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#C2410C' }}>Partial Matches</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#C2410C' }}>{selectedMerchantDetail.stats.partialPayments}</div>
                    </div>
                    <div style={{ background: '#FEF2F2', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#991B1B' }}>Open Disputes</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#991B1B' }}>{selectedMerchantDetail.stats.reconciliationOpen}</div>
                    </div>
                  </div>

                  {/* Bank Accounts */}
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Configured Bank Accounts</h4>
                    {selectedMerchantDetail.bankAccounts.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#94A3B8' }}>No bank accounts configured.</div>
                    ) : (
                      selectedMerchantDetail.bankAccounts.map((b) => (
                        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px', marginBottom: '6px', fontSize: '12px' }}>
                          <span><strong>{b.bankName}</strong> ({b.accountSuffix}) · {b.upiId}</span>
                          <span style={{ color: b.isActive ? '#059669' : '#DC2626', fontWeight: 600 }}>{b.isActive ? 'Active' : 'Disabled'}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Paired Companion Devices */}
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Android Companion Devices</h4>
                    {selectedMerchantDetail.devices.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#94A3B8' }}>No devices paired.</div>
                    ) : (
                      selectedMerchantDetail.devices.map((d) => (
                        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px', marginBottom: '6px', fontSize: '12px' }}>
                          <span><strong>{d.deviceName}</strong> ({d.androidVersion || 'Android'}) · FP: {d.deviceFingerprint.slice(0, 8)}...</span>
                          <span style={{ color: d.notificationAccessGranted ? '#059669' : '#DC2626', fontWeight: 600 }}>
                            {d.notificationAccessGranted ? 'Access Granted' : 'Access Missing'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* API Credentials */}
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>API Keys (Redacted)</h4>
                    {selectedMerchantDetail.apiKeys.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#94A3B8' }}>No API keys provisioned.</div>
                    ) : (
                      selectedMerchantDetail.apiKeys.map((k) => (
                        <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px', marginBottom: '6px', fontSize: '12px' }}>
                          <span><code style={{ background: '#E2E8F0', padding: '2px 6px', borderRadius: '4px' }}>{k.keyId}</code> ({k.environment})</span>
                          <span style={{ color: '#64748B' }}>Scopes: [{k.scopes.join(', ')}]</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Suspend Merchant Reason Modal */}
            {suspendModalMerchant && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                <div style={{ background: '#FFFFFF', borderRadius: '12px', maxWidth: '480px', width: '100%', padding: '24px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#991B1B', margin: 0 }}>
                    Suspend Merchant Account
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748B', marginTop: '6px' }}>
                    Suspending <strong>{suspendModalMerchant.name}</strong> will halt payment creation and reject new API calls. Historical payment evidence, transactions, and devices will be preserved.
                  </p>

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                      Reason for Administrative Suspension (required)
                    </label>
                    <textarea
                      rows={3}
                      value={suspensionReason}
                      onChange={(e) => setSuspensionReason(e.target.value)}
                      placeholder="e.g. Inconclusive credit evidence alerts, security breach investigation..."
                      style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                    <button
                      onClick={() => setSuspendModalMerchant(null)}
                      style={{ padding: '8px 14px', background: '#F1F5F9', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSuspendMerchant}
                      disabled={!suspensionReason.trim()}
                      style={{ padding: '8px 14px', background: '#DC2626', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: suspensionReason.trim() ? 'pointer' : 'not-allowed' }}
                    >
                      Confirm Suspension
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TRANSACTION EXPLORER */}
        {activeTab === 'transactions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Platform-Wide Transaction Explorer</h2>
                <p style={{ fontSize: '13px', color: '#64748B' }}>Search and inspect payments across all registered merchants. Preserves immutable evidence integrity.</p>
              </div>
              <button
                onClick={fetchTransactions}
                style={{ padding: '8px 14px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                ↻ Refresh Explorer
              </button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', background: '#FFFFFF', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <input
                type="text"
                placeholder="Search by Order ID, reference, or UTR..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
              <select
                value={txStatusFilter}
                onChange={(e) => setTxStatusFilter(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', background: '#FFFFFF' }}
              >
                <option value="ALL">All Statuses</option>
                <option value={PaymentStatus.SUCCESS}>SUCCESS (Dual-Matched)</option>
                <option value={PaymentStatus.PARTIAL_SUCCESS}>PARTIAL_SUCCESS (1 Source)</option>
                <option value={PaymentStatus.PENDING}>PENDING</option>
                <option value={PaymentStatus.REVIEW_REQUIRED}>REVIEW_REQUIRED</option>
                <option value={PaymentStatus.EXPIRED}>EXPIRED</option>
                <option value={PaymentStatus.RECONCILIATION_REQUIRED}>RECONCILIATION_REQUIRED</option>
              </select>
            </div>

            {/* Table */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                  <tr>
                    <th style={{ padding: '12px 16px' }}>Payment Ref / Order</th>
                    <th style={{ padding: '12px 16px' }}>Merchant</th>
                    <th style={{ padding: '12px 16px' }}>Expected Amount</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Dual-Source Evidence</th>
                    <th style={{ padding: '12px 16px' }}>UTR / Reference</th>
                    <th style={{ padding: '12px 16px' }}>Created</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
                        {loadingTx ? 'Loading transactions...' : 'No transactions found.'}
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{tx.orderId}</div>
                          <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>{tx.paymentReference.slice(0, 16)}...</div>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {tx.merchantName}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>
                          ₹{(tx.amountPaise / 100).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <StatusBadge status={tx.status as any} />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              background: tx.hasEmailEvidence ? '#DEF7EC' : '#F3F4F6',
                              color: tx.hasEmailEvidence ? '#03543F' : '#9CA3AF'
                            }}>
                              ✉ Email
                            </span>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              background: tx.hasAndroidEvidence ? '#DEF7EC' : '#F3F4F6',
                              color: tx.hasAndroidEvidence ? '#03543F' : '#9CA3AF'
                            }}>
                              📱 Android
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#475569' }}>
                          {tx.utr || '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748B' }}>
                          {new Date(tx.createdAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => setSelectedTxDetail(tx)}
                            style={{ padding: '4px 8px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Transaction Read-Only Modal */}
            {selectedTxDetail && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                <div style={{ background: '#FFFFFF', borderRadius: '12px', maxWidth: '600px', width: '100%', padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Payment Request Inspector</h3>
                    <button onClick={() => setSelectedTxDetail(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div><strong>Order ID:</strong> {selectedTxDetail.orderId}</div>
                    <div><strong>Payment ID:</strong> {selectedTxDetail.id}</div>
                    <div><strong>Merchant:</strong> {selectedTxDetail.merchantName}</div>
                    <div><strong>Amount:</strong> ₹{(selectedTxDetail.amountPaise / 100).toFixed(2)}</div>
                    <div><strong>Status:</strong> <StatusBadge status={selectedTxDetail.status as any} /></div>
                    <div><strong>UTR:</strong> {selectedTxDetail.utr || 'Not yet matched'}</div>
                    <div><strong>Email Evidence:</strong> {selectedTxDetail.hasEmailEvidence ? '✓ Matched' : '✗ Missing'}</div>
                    <div><strong>Android Companion Evidence:</strong> {selectedTxDetail.hasAndroidEvidence ? '✓ Matched' : '✗ Missing'}</div>
                    {selectedTxDetail.reviewReason && (
                      <div style={{ padding: '8px', background: '#FFF7ED', borderRadius: '4px', color: '#9A3412' }}>
                        <strong>Review Reason:</strong> {selectedTxDetail.reviewReason}
                      </div>
                    )}
                    <div style={{ wordBreak: 'break-all', marginTop: '8px' }}>
                      <strong>UPI Intent URI:</strong>
                      <div style={{ background: '#F8FAFC', padding: '8px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', marginTop: '4px' }}>
                        {selectedTxDetail.upiUri}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: RECONCILIATION CASES */}
        {activeTab === 'reconciliation' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Global Reconciliation Cases</h2>
                <p style={{ fontSize: '13px', color: '#64748B' }}>Audit disputed transactions, conflicting evidence, late arrivals, and resolution history.</p>
              </div>
              <button
                onClick={fetchReconciliation}
                style={{ padding: '8px 14px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                ↻ Refresh Cases
              </button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', background: '#FFFFFF', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <select
                value={reconciliationStatusFilter}
                onChange={(e) => setReconciliationStatusFilter(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px', background: '#FFFFFF' }}
              >
                <option value="ALL">All Case Statuses</option>
                <option value="OPEN">OPEN Only</option>
                <option value="INVESTIGATING">INVESTIGATING Only</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="DISMISSED">DISMISSED</option>
              </select>
            </div>

            {/* Cases Table */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                  <tr>
                    <th style={{ padding: '12px 16px' }}>Case Type / Severity</th>
                    <th style={{ padding: '12px 16px' }}>Merchant</th>
                    <th style={{ padding: '12px 16px' }}>Reason</th>
                    <th style={{ padding: '12px 16px' }}>UTR</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Created</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationCases.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
                        {loadingReconciliation ? 'Loading reconciliation cases...' : 'No open cases found.'}
                      </td>
                    </tr>
                  ) : (
                    reconciliationCases.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{c.caseType}</div>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 700,
                            background: c.severity === 'CRITICAL' ? '#FEE2E2' : c.severity === 'HIGH' ? '#FFEDD5' : '#FEF3C7',
                            color: c.severity === 'CRITICAL' ? '#991B1B' : c.severity === 'HIGH' ? '#9A3412' : '#92400E'
                          }}>
                            {c.severity}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {c.merchantName}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#475569', maxWidth: '300px' }}>
                          {c.reason}
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px' }}>
                          {c.utr || '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: c.status === 'OPEN' ? '#FEF2F2' : c.status === 'RESOLVED' ? '#ECFDF5' : '#F1F5F9',
                            color: c.status === 'OPEN' ? '#991B1B' : c.status === 'RESOLVED' ? '#065F46' : '#475569'
                          }}>
                            {c.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748B' }}>
                          {new Date(c.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {c.status === 'OPEN' || c.status === 'INVESTIGATING' ? (
                            <button
                              onClick={() => { setResolvingCase(c); setResolutionNotes(''); setResolutionStatus('RESOLVED'); }}
                              style={{ padding: '5px 10px', background: '#4F46E5', color: '#FFFFFF', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Resolve
                            </button>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#94A3B8' }}>Resolved</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Resolve Case Modal */}
            {resolvingCase && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                <div style={{ background: '#FFFFFF', borderRadius: '12px', maxWidth: '500px', width: '100%', padding: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                    Resolve Reconciliation Case
                  </h3>
                  <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', margin: '14px 0', fontSize: '12px', color: '#475569' }}>
                    <div><strong>Type:</strong> {resolvingCase.caseType} ({resolvingCase.severity})</div>
                    <div><strong>Reason:</strong> {resolvingCase.reason}</div>
                    {resolvingCase.utr && <div><strong>UTR:</strong> {resolvingCase.utr}</div>}
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                      Resolution Action
                    </label>
                    <select
                      value={resolutionStatus}
                      onChange={(e: any) => setResolutionStatus(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    >
                      <option value="RESOLVED">RESOLVED (Merchant Notified / Handled)</option>
                      <option value="DISMISSED">DISMISSED (Invalid Dispute / False Alert)</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                      Resolution Notes (Audited)
                    </label>
                    <textarea
                      rows={3}
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Explain findings, merchant communication, or action taken..."
                      style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '16px', background: '#EFF6FF', padding: '8px', borderRadius: '4px' }}>
                    Notice: Resolving this case updates the operational investigation record. It does not alter payment evidence or compromise the dual-source rule.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      onClick={() => setResolvingCase(null)}
                      style={{ padding: '8px 14px', background: '#F1F5F9', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResolveCase}
                      disabled={!resolutionNotes.trim()}
                      style={{ padding: '8px 14px', background: '#4F46E5', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: resolutionNotes.trim() ? 'pointer' : 'not-allowed' }}
                    >
                      Save Case Resolution
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: MONITORING */}
        {activeTab === 'monitoring' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Device & Infrastructure Monitoring</h2>
                <p style={{ fontSize: '13px', color: '#64748B' }}>Live health metrics for companion devices, automated email sync workers, webhook delivery, and background jobs.</p>
              </div>
              <button
                onClick={fetchMonitoring}
                disabled={loadingMonitoring}
                style={{ padding: '8px 14px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                {loadingMonitoring ? 'Refreshing...' : '↻ Refresh Monitors'}
              </button>
            </div>

            {/* Sub-tab Navigation */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '16px' }}>
              {[
                { id: 'devices', label: 'Android Companion Devices' },
                { id: 'integrations', label: 'Email Integrations' },
                { id: 'webhooks', label: 'Webhook Delivery Outages' },
                { id: 'worker', label: 'Background Job Runner' }
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setMonitoringTab(sub.id as any)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: monitoringTab === sub.id ? '#4F46E5' : '#F1F5F9',
                    color: monitoringTab === sub.id ? '#FFFFFF' : '#475569',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Sub-tab 1: Devices */}
            {monitoringTab === 'devices' && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <tr>
                      <th style={{ padding: '12px 16px' }}>Device</th>
                      <th style={{ padding: '12px 16px' }}>Merchant</th>
                      <th style={{ padding: '12px 16px' }}>Android OS</th>
                      <th style={{ padding: '12px 16px' }}>Notification Access</th>
                      <th style={{ padding: '12px 16px' }}>Last Heartbeat</th>
                      <th style={{ padding: '12px 16px' }}>Upload Queue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitoredDevices.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No devices registered.</td></tr>
                    ) : (
                      monitoredDevices.map((d) => (
                        <tr key={d.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{d.deviceName}</td>
                          <td style={{ padding: '12px 16px' }}>{d.merchantName}</td>
                          <td style={{ padding: '12px 16px', color: '#64748B' }}>{d.androidVersion || 'Android 13+'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: d.notificationAccessGranted ? '#DEF7EC' : '#FDE8E8', color: d.notificationAccessGranted ? '#03543F' : '#9B1C1C' }}>
                              {d.notificationAccessGranted ? 'GRANTED' : 'REVOKED / MISSING'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748B' }}>
                            {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#475569' }}>
                            {d.pendingUploadCount} pending
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab 2: Integrations */}
            {monitoringTab === 'integrations' && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <tr>
                      <th style={{ padding: '12px 16px' }}>Provider</th>
                      <th style={{ padding: '12px 16px' }}>Merchant</th>
                      <th style={{ padding: '12px 16px' }}>Email Address</th>
                      <th style={{ padding: '12px 16px' }}>Status</th>
                      <th style={{ padding: '12px 16px' }}>Last Successful Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitoredIntegrations.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>No email integrations connected.</td></tr>
                    ) : (
                      monitoredIntegrations.map((i) => (
                        <tr key={i.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{i.provider}</td>
                          <td style={{ padding: '12px 16px' }}>{i.merchantName}</td>
                          <td style={{ padding: '12px 16px' }}>{i.emailAddress || '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: i.status === 'CONNECTED' ? '#DEF7EC' : '#FDE8E8', color: i.status === 'CONNECTED' ? '#03543F' : '#9B1C1C' }}>
                              {i.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748B' }}>
                            {i.lastSyncAt ? new Date(i.lastSyncAt).toLocaleString() : 'Never'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab 3: Webhooks */}
            {monitoringTab === 'webhooks' && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                    <tr>
                      <th style={{ padding: '12px 16px' }}>Event / Attempt</th>
                      <th style={{ padding: '12px 16px' }}>Merchant</th>
                      <th style={{ padding: '12px 16px' }}>Status</th>
                      <th style={{ padding: '12px 16px' }}>Error Details</th>
                      <th style={{ padding: '12px 16px' }}>Failed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitoredWebhooks.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>✓ Zero webhook delivery outages. All merchant webhooks delivering normally.</td></tr>
                    ) : (
                      monitoredWebhooks.map((w) => (
                        <tr key={w.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600 }}>{w.eventType}</div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>Attempt {w.attemptNumber} of 5</div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>{w.merchantName}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: w.status === 'DEAD_LETTER' ? '#7F1D1D' : '#FEE2E2', color: w.status === 'DEAD_LETTER' ? '#FEE2E2' : '#991B1B' }}>
                              {w.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#B91C1C', fontSize: '12px', maxWidth: '300px' }}>
                            {w.errorMessage || 'HTTP Failure'}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748B' }}>
                            {new Date(w.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-tab 4: Worker */}
            {monitoringTab === 'worker' && monitoredWorker && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }}></span>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0F172A' }}>Background Job Scheduler: OPERATIONAL</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>Active Worker Lease Locks</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A' }}>{monitoredWorker.activeLeaseCount}</div>
                  </div>
                  <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>Pending Dispatches in Queue</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#0F172A' }}>{monitoredWorker.pendingJobCount}</div>
                  </div>
                </div>

                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>Recent Scheduled Tasks</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {monitoredWorker.recentJobs?.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#94A3B8' }}>No job history recorded.</div>
                  ) : (
                    monitoredWorker.recentJobs.map((j: any) => (
                      <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFC', borderRadius: '6px', fontSize: '12px' }}>
                        <span><strong>{j.jobType}</strong> (Status: {j.status})</span>
                        <span style={{ color: '#64748B' }}>Updated: {new Date(j.updatedAt).toLocaleTimeString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: PLATFORM CONFIG */}
        {activeTab === 'config' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Platform Operational Configuration</h2>
                <p style={{ fontSize: '13px', color: '#64748B' }}>
                  Tune timeouts, intervals, retry backoffs, and evidence matching parameters.
                  {platformConfig?.updatedAt && ` · Last updated: ${new Date(platformConfig.updatedAt).toLocaleString()}`}
                </p>
              </div>
            </div>

            {/* Invariant Alert */}
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>⚠️</span>
                <div style={{ fontSize: '13px', color: '#92400E', lineHeight: '1.5' }}>
                  <strong>Architectural Invariant Guarantee:</strong> The dual-source evidence verification requirement (requiring both Email and Android companion evidence for payment SUCCESS) cannot be modified through administrative settings.
                </div>
              </div>
            </div>

            {configSuccessMsg && (
              <div style={{ padding: '12px', background: '#DEF7EC', border: '1px solid #31C48D', borderRadius: '6px', color: '#03543F', fontSize: '13px', marginBottom: '16px' }}>
                ✓ {configSuccessMsg}
              </div>
            )}
            {configErrorMsg && (
              <div style={{ padding: '12px', background: '#FDE8E8', border: '1px solid #F98080', borderRadius: '6px', color: '#9B1C1C', fontSize: '13px', marginBottom: '16px' }}>
                ✗ {configErrorMsg}
              </div>
            )}

            <form onSubmit={handleSaveConfig} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '24px', maxWidth: '700px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Payment Expiry Window (seconds)
                  </label>
                  <input
                    type="number"
                    min={300}
                    max={86400}
                    value={configForm.paymentExpirySeconds || 900}
                    onChange={(e) => setConfigForm({ ...configForm, paymentExpirySeconds: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Default: 900s (15 minutes). Range: 300s - 86400s</div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Evidence Matching Window (seconds)
                  </label>
                  <input
                    type="number"
                    min={300}
                    max={86400}
                    value={configForm.evidenceMatchingWindowSeconds || 1800}
                    onChange={(e) => setConfigForm({ ...configForm, evidenceMatchingWindowSeconds: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Default: 1800s (30 minutes). Range: 300s - 86400s</div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Reconciliation Schedule Interval (seconds)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={3600}
                    value={configForm.reconciliationScheduleIntervalSeconds || 60}
                    onChange={(e) => setConfigForm({ ...configForm, reconciliationScheduleIntervalSeconds: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Default: 60s. Lease-locked background pass.</div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Webhook Max Retries
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={configForm.webhookMaxRetries || 5}
                    onChange={(e) => setConfigForm({ ...configForm, webhookMaxRetries: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Transitions to DEAD_LETTER after max attempts.</div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Evidence Retention Period (days)
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={365}
                    value={configForm.evidenceRetentionDays || 90}
                    onChange={(e) => setConfigForm({ ...configForm, evidenceRetentionDays: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Immutable audit log retention minimum: 90 days.</div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    API Rate Limit (requests/minute)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    value={configForm.rateLimitPerMinute || 120}
                    onChange={(e) => setConfigForm({ ...configForm, rateLimitPerMinute: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Per merchant tier baseline limit.</div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loadingConfig}
                style={{ marginTop: '24px', padding: '10px 18px', background: '#4F46E5', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                {loadingConfig ? 'Saving Configuration...' : 'Save Configuration Changes'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 7: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>Platform Security & Audit Logs</h2>
                <p style={{ fontSize: '13px', color: '#64748B' }}>Immutable ledger of administrative actions, merchant suspensions, and security events.</p>
              </div>
              <button
                onClick={fetchAudit}
                style={{ padding: '8px 14px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                ↻ Refresh Audit Trail
              </button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', background: '#FFFFFF', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <input
                type="text"
                placeholder="Filter by action (e.g. ADMIN_LOGIN, MERCHANT_SUSPENDED)..."
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              />
            </div>

            {/* Table */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                  <tr>
                    <th style={{ padding: '12px 16px' }}>Timestamp</th>
                    <th style={{ padding: '12px 16px' }}>Action</th>
                    <th style={{ padding: '12px 16px' }}>Target Resource</th>
                    <th style={{ padding: '12px 16px' }}>Actor User ID</th>
                    <th style={{ padding: '12px 16px' }}>IP / User Agent</th>
                    <th style={{ padding: '12px 16px' }}>Details / Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
                        {loadingAudit ? 'Loading audit records...' : 'No audit log entries found.'}
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#EEF2FF', color: '#3730A3' }}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#334155' }}>
                          {log.resource} {log.resourceId ? `(${log.resourceId.slice(-6)})` : ''}
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>
                          {log.userId || 'system'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '11px', color: '#64748B' }}>
                          {log.ipAddress || 'internal'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#475569' }}>
                          {log.details ? JSON.stringify(log.details) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop: '40px' }}>
          <NonCustodialDisclosureBanner />
        </div>
      </main>
    </div>
  );
}
