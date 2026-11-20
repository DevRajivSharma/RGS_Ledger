import React, { useState, useEffect, useCallback } from 'react';
import { StatusBadge, NonCustodialDisclosureBanner } from '@rgs-ledger/ui';
import { PaymentStatus } from '@rgs-ledger/shared-types';
import {
  ApiResponse,
  MerchantAnalyticsSummaryDto,
  MerchantAnalyticsTimeseriesDto,
  MerchantOnboardingStatusDto
} from '@rgs-ledger/api-contracts';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

interface UserSession {
  userId: string;
  email: string;
  merchantId: string;
  role: string;
}

interface PaymentItem {
  id: string;
  orderId: string;
  merchantId: string;
  merchantName: string;
  amountPaise: number;
  currency: string;
  status: PaymentStatus;
  reviewReason?: string;
  upiUri: string;
  qrDataUrl: string;
  checkoutReference: string;
  expiresAt: string;
  createdAt: string;
  description?: string;
  idempotencyKey?: string;
  bankAccountId?: string | null;
  bankName?: string;
  accountSuffix?: string;
  evidenceSummary?: {
    hasEmailEvidence?: boolean;
    hasAndroidEvidence?: boolean;
    emailEvidenceId?: string;
    androidEvidenceId?: string;
    utr?: string;
    matchedAmountPaise?: number;
    verifiedAt?: string;
  };
}

interface MerchantBankAccountItem {
  id: string;
  merchantId: string;
  bankName: string;
  upiId: string;
  accountSuffix: string;
  isActive: boolean;
  isDefault?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface ReconciliationCaseItem {
  id: string;
  merchantId: string;
  paymentRequestId?: any;
  evidenceId?: any;
  evidenceIds?: string[];
  caseType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  expectedAmountPaise?: number;
  receivedAmountPaise?: number;
  utr?: string;
  bankAccountId?: string;
  accountSuffix?: string;
  orderId?: string;
  checkoutReference?: string;
  hasEmailEvidence?: boolean;
  hasAndroidEvidence?: boolean;
  resolvedByUserId?: string;
  resolutionNotes?: string;
  history?: Array<{
    action: string;
    notes?: string;
    previousStatus?: string;
    newStatus?: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface MerchantProfile {
  id: string;
  name: string;
  upiConfig: {
    vpa: string;
    businessName: string;
    mcc?: string;
    isAcceptingPayments: boolean;
  };
}

interface PaymentLinkItem {
  id: string;
  title: string;
  description?: string;
  linkReference: string;
  amountPaise: number | null;
  amountRupees: number | null;
  isOpenAmount: boolean;
  currency: string;
  isReusable: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'REVOKED';
  paymentsCount: number;
  totalCollectedPaise: number;
  totalCollectedRupees: number;
  checkoutUrl: string;
  expiresAt?: string | null;
  createdAt: string;
}

interface ApiKeyItem {
  id: string;
  name: string;
  keyId: string;
  keyPrefix: string;
  environment: 'PRODUCTION' | 'SANDBOX';
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface WebhookEndpointItem {
  id: string;
  url: string;
  secret: string;
  events: string[];
  description?: string;
  isActive: boolean;
  createdAt: string;
}

interface WebhookDeliveryItem {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  latencyMs?: number;
  attempts: number;
  status: string;
  createdAt: string;
}

function ReconSeverityBadge({ severity }: { severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) {
  let bg = '#F3F4F6';
  let color = '#374151';
  let border = '#D1D5DB';

  if (severity === 'CRITICAL') {
    bg = '#FEE2E2'; color = '#991B1B'; border = '#FCA5A5';
  } else if (severity === 'HIGH') {
    bg = '#FFEDD5'; color = '#9A3412'; border = '#FDBA74';
  } else if (severity === 'MEDIUM') {
    bg = '#FEF3C7'; color = '#92400E'; border = '#FCD34D';
  }

  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: bg, color, border: `1px solid ${border}` }}>
      {severity}
    </span>
  );
}

function ReconStatusBadge({ status }: { status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED' }) {
  let bg = '#F3F4F6';
  let color = '#4B5563';
  let border = '#D1D5DB';

  if (status === 'OPEN') {
    bg = '#FEF3C7'; color = '#92400E'; border = '#FCD34D';
  } else if (status === 'INVESTIGATING') {
    bg = '#DBEAFE'; color = '#1E40AF'; border = '#93C5FD';
  } else if (status === 'RESOLVED') {
    bg = '#DEF7EC'; color = '#03543F'; border = '#31C48D';
  }

  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: bg, color, border: `1px solid ${border}` }}>
      {status}
    </span>
  );
}

interface GmailIntegrationStatus {
  isConnected: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'REVOKED';
  connectedEmail: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: 'NEVER' | 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  lastSyncError: string | null;
  syncStats: {
    totalProcessed: number;
    newEvidenceCount: number;
    duplicatesCount: number;
  };
}

interface EvidenceItem {
  id: string;
  channel: string;
  provider: string;
  transactionType: 'CREDIT' | 'DEBIT';
  amountPaise: number;
  amountRupees: string;
  currency: string;
  utr: string | null;
  accountIdentifier: string | null;
  bankAccountId?: string | null;
  rawText?: string;
  senderOrPackage: string;
  transactionTimestamp: string | null;
  receivedAt: string;
  status: string;
  rejectionReason?: string;
  templateId?: string | null;
  templateVersion?: number | null;
  metadata?: {
    subject?: string;
    snippet?: string;
    appName?: string;
    notificationTitle?: string;
    packageName?: string;
    senderHeader?: string;
    [key: string]: any;
  };
}

interface EvidenceTemplateItem {
  id: string;
  _id?: string;
  merchantId: string;
  bankAccountId?: string | null;
  samplePayload?: string;
  channel: string;
  provider?: string;
  senderIdentifier: string;
  packageName?: string;
  senderHeader?: string;
  name: string;
  description?: string;
  regexPattern: string;
  fieldsMap: {
    amountPaiseExtractor?: string;
    utrExtractor?: string;
    accountExtractor?: string;
    transactionTimestampExtractor?: string;
    transactionTypeExtractor?: string;
  };
  version: number;
  status: 'DISCOVERED' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISABLED' | 'ARCHIVED';
  isActive?: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  deactivatedAt?: string;
  reactivatedAt?: string;
  isImmutable: boolean;
  approvedByUserId?: string;
  approvedAt?: string;
  history?: any[];
  createdAt: string;
  updatedAt: string;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Merchant Dashboard caught render error:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem('rgs_access_token');
    localStorage.removeItem('rgs_user');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '480px', margin: '64px auto', padding: '24px', background: '#FFF', borderRadius: '12px', border: '1px solid #FECACA', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <h2 style={{ color: '#991B1B', fontSize: '20px', fontWeight: 800, margin: '0 0 10px 0' }}>Something went wrong</h2>
          <p style={{ color: '#4B5563', fontSize: '14px', marginBottom: '20px', lineHeight: 1.5 }}>
            The merchant portal encountered an unexpected display error. Your merchant account, settings, and payment records remain completely secure.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '9px 18px', background: '#2563EB', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              Reload Dashboard
            </button>
            <button
              onClick={this.handleReset}
              style={{ padding: '9px 18px', background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              Sign In Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function MerchantDashboardApp() {
  const [accessToken, setAccessToken] = useState<string>('');
  const [user, setUser] = useState<UserSession | null>(() => {
    const raw = localStorage.getItem('rgs_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  // Auth form states
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Dashboard states
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Profile edit state
  const [editVpa, setEditVpa] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editAccepting, setEditAccepting] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Payment create state
  const [newOrderId, setNewOrderId] = useState('');
  const [newAmountRupees, setNewAmountRupees] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newExpiryMinutes, setNewExpiryMinutes] = useState('15');
  const [creatingPayment, setCreatingPayment] = useState(false);

  // Selected payment modal
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Gmail & Evidence states
  const [gmailStatus, setGmailStatus] = useState<GmailIntegrationStatus | null>(null);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [reclassifyingEvidence, setReclassifyingEvidence] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState<'ALL' | 'READY' | 'REVIEW' | 'REJECTED'>('ALL');

  // Merchant Bank Accounts states
  const [bankAccounts, setBankAccounts] = useState<MerchantBankAccountItem[]>([]);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [newBankName, setNewBankName] = useState('');
  const [newBankUpiId, setNewBankUpiId] = useState('');
  const [newBankAccountSuffix, setNewBankAccountSuffix] = useState('');
  const [newBankNotes, setNewBankNotes] = useState('');
  const [creatingBankAccount, setCreatingBankAccount] = useState(false);

  // Evidence Template states
  const [templates, setTemplates] = useState<EvidenceTemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'reconciliation' | 'payment-links' | 'api-keys' | 'webhooks' | 'bank-accounts' | 'templates' | 'devices'>('overview');
  const [templateBankAccountId, setTemplateBankAccountId] = useState<string>('');

  // Analytics & Reporting states (Phase 4A)
  const [analyticsSummary, setAnalyticsSummary] = useState<MerchantAnalyticsSummaryDto | null>(null);
  const [analyticsTimeseries, setAnalyticsTimeseries] = useState<MerchantAnalyticsTimeseriesDto | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<'today' | 'yesterday' | '7d' | '30d' | 'custom'>('7d');
  const [analyticsStartDate, setAnalyticsStartDate] = useState('');
  const [analyticsEndDate, setAnalyticsEndDate] = useState('');
  const [analyticsStatus, setAnalyticsStatus] = useState<string>('');
  const [analyticsBankAccountId, setAnalyticsBankAccountId] = useState<string>('');
  const [analyticsSource, setAnalyticsSource] = useState<'ALL' | 'LINK' | 'DIRECT'>('ALL');
  const [exportingReportType, setExportingReportType] = useState<string | null>(null);

  // Onboarding status (Phase 4B)
  const [onboardingStatus, setOnboardingStatus] = useState<MerchantOnboardingStatusDto | null>(null);

  // Payment Links states (Phase 3A)
  const [paymentLinks, setPaymentLinks] = useState<PaymentLinkItem[]>([]);
  const [loadingPaymentLinks, setLoadingPaymentLinks] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkDescription, setNewLinkDescription] = useState('');
  const [newLinkAmountRupees, setNewLinkAmountRupees] = useState('');
  const [newLinkIsReusable, setNewLinkIsReusable] = useState(true);
  const [newLinkExpiryHours, setNewLinkExpiryHours] = useState('72');
  const [creatingPaymentLink, setCreatingPaymentLink] = useState(false);
  const [selectedLinkDetails, setSelectedLinkDetails] = useState<{ link: PaymentLinkItem; recentPayments: any[] } | null>(null);
  const [loadingLinkDetails, setLoadingLinkDetails] = useState(false);

  // API Keys states (Phase 3A)
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyEnvironment, setNewKeyEnvironment] = useState<'PRODUCTION' | 'SANDBOX'>('SANDBOX');
  const [newKeyScopes, setNewKeyScopes] = useState('*');
  const [creatingApiKey, setCreatingApiKey] = useState(false);
  const [createdSecretModal, setCreatedSecretModal] = useState<{ title: string; keyId: string; rawSecret: string } | null>(null);
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null);

  // Webhooks states (Phase 3A)
  const [webhookEndpoints, setWebhookEndpoints] = useState<WebhookEndpointItem[]>([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDeliveryItem[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookDescription, setNewWebhookDescription] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState('*');
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [webhookTestResult, setWebhookTestResult] = useState<any | null>(null);

  // Reconciliation states
  const [reconCases, setReconCases] = useState<ReconciliationCaseItem[]>([]);
  const [loadingReconCases, setLoadingReconCases] = useState(false);
  const [reconStatusFilter, setReconStatusFilter] = useState<'ALL' | 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED'>('OPEN');
  const [reconSeverityFilter, setReconSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [reconTypeFilter, setReconTypeFilter] = useState<string>('ALL');
  const [reconSearch, setReconSearch] = useState<string>('');
  const [reconBankAccountId, setReconBankAccountId] = useState<string>('');
  const [selectedCase, setSelectedCase] = useState<ReconciliationCaseItem | null>(null);
  const [caseAction, setCaseAction] = useState<'CONFIRM_PAYMENT' | 'FLAG_FRAUD' | 'REFUND_RECOMMENDED' | 'DISMISS'>('CONFIRM_PAYMENT');
  const [caseResolutionNotes, setCaseResolutionNotes] = useState<string>('');
  const [resolvingCase, setResolvingCase] = useState<boolean>(false);
  const [autoReconciling, setAutoReconciling] = useState<boolean>(false);

  // Connected Companion Devices states
  const [devices, setDevices] = useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [activePairingCode, setActivePairingCode] = useState<string | null>(null);
  const [pairingCodeExpiresAt, setPairingCodeExpiresAt] = useState<string | null>(null);
  const [generatingPairingCode, setGeneratingPairingCode] = useState(false);
  const [selectedEvidenceForTemplate, setSelectedEvidenceForTemplate] = useState<EvidenceItem | null>(null);
  const [templateChannel, setTemplateChannel] = useState<'ANDROID' | 'EMAIL'>('ANDROID');
  const [templateFilterChannel, setTemplateFilterChannel] = useState<'ALL' | 'ANDROID' | 'EMAIL'>('ALL');
  const [templateFilterStatus, setTemplateFilterStatus] = useState<'ALL' | 'ACTIVE' | 'DISABLED' | 'PENDING_APPROVAL' | 'ARCHIVED'>('ALL');
  const [viewingTemplate, setViewingTemplate] = useState<EvidenceTemplateItem | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<EvidenceTemplateItem | null>(null);
  const [templateHistoryList, setTemplateHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [editingVersionTemplate, setEditingVersionTemplate] = useState<EvidenceTemplateItem | null>(null);
  const [newVersionRegex, setNewVersionRegex] = useState<string>('');
  const [newVersionReason, setNewVersionReason] = useState<string>('');
  const [savingNewVersion, setSavingNewVersion] = useState<boolean>(false);
  const [conflictModal, setConflictModal] = useState<{
    targetTemplateId: string;
    conflictingTemplate: any;
  } | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSender, setTemplateSender] = useState('');
  const [templatePackageName, setTemplatePackageName] = useState('com.google.android.apps.messaging');
  const [templateSenderHeader, setTemplateSenderHeader] = useState('');
  const [templateRegex, setTemplateRegex] = useState('');
  const [amountExtractor, setAmountExtractor] = useState('1');
  const [utrExtractor, setUtrExtractor] = useState('2');
  const [accountExtractor, setAccountExtractor] = useState('3');
  const [timestampExtractor, setTimestampExtractor] = useState('');
  const [typeExtractor, setTypeExtractor] = useState('');
  const [testSampleText, setTestSampleText] = useState('');
  const [regexTestResult, setRegexTestResult] = useState<any>(null);
  const [testingRegex, setTestingRegex] = useState(false);
  const [submittingTemplate, setSubmittingTemplate] = useState(false);

  // Notification Sources state
  const [notificationSources, setNotificationSources] = useState<Array<{
    packageName: string;
    appName: string;
    category: string;
    totalEvidenceCount: number;
    lastDetectedAt: string | null;
    isEnabled: boolean;
  }>>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleLogout = useCallback(() => {
    fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      credentials: 'include'
    }).catch(() => {});

    localStorage.removeItem('rgs_access_token');
    localStorage.removeItem('rgs_refresh_token'); // Clean up any legacy artifact
    localStorage.removeItem('rgs_user');
    setAccessToken('');
    setUser(null);
    setProfile(null);
    setPayments([]);
    setEvidenceList([]);
    setGmailStatus(null);
    showFeedback('success', 'You have been signed out.');
  }, [accessToken]);

  // Authenticated fetch with automatic token refresh via HttpOnly cookie
  const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    let response = await fetch(url, { ...options, headers, credentials: 'include' });

    // Handle 401: Token expired, attempt silent rotation via HttpOnly cookie
    // Safeguard against recursive loops on auth endpoints
    if (response.status === 401 && !url.includes('/auth/refresh') && !url.includes('/auth/logout')) {
      try {
        const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        const refreshData: ApiResponse<{ accessToken: string }> = await refreshRes.json();
        if (refreshRes.ok && refreshData.success && refreshData.data?.accessToken) {
          const newAccess = refreshData.data.accessToken;
          setAccessToken(newAccess);
          localStorage.setItem('rgs_access_token', newAccess);

          // Retry original request with fresh access token
          headers.set('Authorization', `Bearer ${newAccess}`);
          response = await fetch(url, { ...options, headers, credentials: 'include' });
        } else {
          handleLogout();
        }
      } catch {
        handleLogout();
      }
    }

    return response;
  }, [accessToken, handleLogout]);

  // Load Merchant Profile
  const fetchProfile = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/v1/merchant/profile`);
      const json: ApiResponse<{ merchant: MerchantProfile }> = await res.json();
      if (res.ok && json.success && json.data) {
        setProfile(json.data.merchant);
        setEditVpa(json.data.merchant.upiConfig?.vpa || '');
        setEditBusinessName(json.data.merchant.upiConfig?.businessName || '');
        setEditAccepting(json.data.merchant.upiConfig?.isAcceptingPayments ?? true);
      }
    } catch {
      // Handled silently
    }
  }, [authFetch]);



  // Load Payments with dual-field compatibility (items or payments) and array safety
  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/payments`);
      const json: ApiResponse<{ payments?: PaymentItem[]; items?: PaymentItem[] }> = await res.json();
      if (res.ok && json.success && json.data) {
        const rawList = json.data.items || json.data.payments || [];
        setPayments(Array.isArray(rawList) ? rawList : []);
      } else {
        setPayments([]);
      }
    } catch {
      showFeedback('error', 'Failed to load payments');
      setPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  }, [authFetch]);



  // Load Evidence Templates
  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/templates?includeArchived=true`);
      const json: ApiResponse<EvidenceTemplateItem[]> = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        setTemplates(json.data);
      } else {
        setTemplates([]);
      }
    } catch {
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }, [authFetch]);



  // Load Bank Accounts
  const fetchBankAccounts = useCallback(async () => {
    setLoadingBankAccounts(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/merchant/bank-accounts`);
      const json = await res.json();
      const accountsList = Array.isArray(json.data)
        ? json.data
        : Array.isArray(json.data?.accounts)
        ? json.data.accounts
        : [];
      if (res.ok && json.success) {
        setBankAccounts(accountsList);
        const activeAccounts = accountsList.filter((a: any) => a.isActive);
        const currentAccount = accountsList.find((a: any) => a.id === selectedBankAccountId);
        if (!currentAccount || !currentAccount.isActive) {
          const defaultActive = activeAccounts.find((a: any) => a.isDefault) || activeAccounts[0];
          setSelectedBankAccountId(defaultActive ? defaultActive.id : '');
        }
      } else {
        setBankAccounts([]);
      }
    } catch {
      setBankAccounts([]);
    } finally {
      setLoadingBankAccounts(false);
    }
  }, [authFetch, selectedBankAccountId]);

  // Create Bank Account
  const handleCreateBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingBankAccount) return;

    const trimmedBankName = newBankName.trim();
    const trimmedUpiId = newBankUpiId.trim();
    const trimmedSuffix = newBankAccountSuffix.trim();
    const trimmedNotes = newBankNotes.trim();

    if (!trimmedBankName || !trimmedUpiId || !trimmedSuffix) {
      showFeedback('error', 'Bank Name, UPI ID, and Account Suffix are required.');
      return;
    }

    if (trimmedBankName.length < 2) {
      showFeedback('error', 'Bank Name must be at least 2 characters.');
      return;
    }

    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;
    if (!upiRegex.test(trimmedUpiId)) {
      showFeedback('error', 'Account UPI ID must be a valid UPI VPA handle (e.g. name@okaxis, store@upi).');
      return;
    }

    const domainPart = trimmedUpiId.split('@')[1]?.toLowerCase() || '';
    const forbiddenDomains = [
      'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
      'unionbankofindia.bank', 'hdfcbank.net', 'icicibank.com', 'sbi.co.in', 'axisbank.com'
    ];
    if (
      forbiddenDomains.includes(domainPart) ||
      domainPart.endsWith('.bank') ||
      domainPart.endsWith('.com') ||
      domainPart.endsWith('.net') ||
      domainPart.endsWith('.org') ||
      domainPart.endsWith('.co.in')
    ) {
      showFeedback('error', 'Account UPI ID must be a UPI VPA (e.g. store@okaxis), not an email address or bank notification domain.');
      return;
    }

    const digits = trimmedSuffix.replace(/\D/g, '');
    if (digits.length < 2) {
      showFeedback('error', 'Account Suffix must contain at least 2 numeric digits (e.g. 0562 or XX0562).');
      return;
    }
    const cleanSuffix = digits.length > 6 ? digits.slice(-4) : digits;
    const cleanMasked = `XX${cleanSuffix}`;

    setCreatingBankAccount(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/merchant/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: trimmedBankName,
          upiId: trimmedUpiId,
          accountSuffix: cleanSuffix,
          accountNumberMasked: cleanMasked,
          notes: trimmedNotes || undefined
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        let errorMsg = json.error?.message || 'Failed to create bank account';
        if (json.error?.details) {
          if (Array.isArray(json.error.details)) {
            errorMsg = json.error.details.map((d: any) => d.message || d).join(', ');
          } else if (typeof json.error.details === 'object') {
            const issues = Object.values(json.error.details).flat();
            if (issues.length > 0) errorMsg = issues.join(', ');
          }
        }
        throw new Error(errorMsg);
      }
      showFeedback('success', `Bank account ${trimmedBankName} added successfully.`);
      setNewBankName('');
      setNewBankUpiId('');
      setNewBankAccountSuffix('');
      setNewBankNotes('');
      fetchBankAccounts();
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setCreatingBankAccount(false);
    }
  };

  // Toggle Bank Account Active/Inactive
  const handleToggleBankAccount = async (accountId: string) => {
    try {
      const res = await authFetch(`${API_BASE}/api/v1/merchant/bank-accounts/${accountId}/toggle`, {
        method: 'PATCH'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to toggle account status');
      }
      showFeedback('success', `Bank account status updated.`);
      fetchBankAccounts();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // ---------------- PAYMENT LINKS HANDLERS (Phase 3A) ----------------
  const fetchPaymentLinks = useCallback(async () => {
    setLoadingPaymentLinks(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/payment-links`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data?.links)) {
        setPaymentLinks(json.data.links);
      } else {
        setPaymentLinks([]);
      }
    } catch {
      setPaymentLinks([]);
    } finally {
      setLoadingPaymentLinks(false);
    }
  }, [authFetch]);

  const handleCreatePaymentLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingPaymentLink) return;

    if (!newLinkTitle.trim()) {
      showFeedback('error', 'Payment link title is required');
      return;
    }

    let amountPaise: number | null = null;
    if (newLinkAmountRupees.trim()) {
      const num = parseFloat(newLinkAmountRupees);
      if (isNaN(num) || num < 1) {
        showFeedback('error', 'Amount must be at least ₹1.00');
        return;
      }
      amountPaise = Math.round(num * 100);
    }

    let expiresAt: string | undefined;
    if (newLinkExpiryHours.trim() && !isNaN(Number(newLinkExpiryHours))) {
      expiresAt = new Date(Date.now() + Number(newLinkExpiryHours) * 3600000).toISOString();
    }

    setCreatingPaymentLink(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/payment-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newLinkTitle.trim(),
          description: newLinkDescription.trim() || undefined,
          amountPaise,
          isReusable: newLinkIsReusable,
          expiresAt
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to create payment link');
      }

      showFeedback('success', `Payment link created: ${json.data.link.linkReference}`);
      setNewLinkTitle('');
      setNewLinkDescription('');
      setNewLinkAmountRupees('');
      fetchPaymentLinks();
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setCreatingPaymentLink(false);
    }
  };

  const handleRevokePaymentLink = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this payment link? Customers will no longer be able to initiate payments.')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/payment-links/${id}/revoke`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to revoke payment link');
      }
      showFeedback('success', 'Payment link revoked');
      fetchPaymentLinks();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleViewLinkDetails = async (id: string) => {
    setLoadingLinkDetails(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/payment-links/${id}`);
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        setSelectedLinkDetails(json.data);
      }
    } catch (err: any) {
      showFeedback('error', 'Failed to load link details');
    } finally {
      setLoadingLinkDetails(false);
    }
  };

  // ---------------- API KEYS HANDLERS (Phase 3A) ----------------
  const fetchApiKeys = useCallback(async () => {
    setLoadingApiKeys(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/developer/keys`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data?.keys)) {
        setApiKeys(json.data.keys);
      } else {
        setApiKeys([]);
      }
    } catch {
      setApiKeys([]);
    } finally {
      setLoadingApiKeys(false);
    }
  }, [authFetch]);

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingApiKey) return;

    if (!newKeyName.trim()) {
      showFeedback('error', 'Key name is required');
      return;
    }

    const scopes = newKeyScopes.split(',').map((s) => s.trim()).filter(Boolean);

    setCreatingApiKey(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/developer/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          environment: newKeyEnvironment,
          scopes: scopes.length > 0 ? scopes : ['*']
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to generate API key');
      }

      setCreatedSecretModal({
        title: 'New API Key Created',
        keyId: json.data.apiKey.keyId,
        rawSecret: json.data.rawSecret
      });
      setNewKeyName('');
      fetchApiKeys();
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setCreatingApiKey(false);
    }
  };

  const handleRotateApiKey = async (id: string) => {
    if (!confirm('Rotating this key will immediately revoke the old secret. Continue?')) return;
    setRotatingKeyId(id);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/developer/keys/${id}/rotate`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to rotate API key');
      }

      setCreatedSecretModal({
        title: 'API Key Rotated',
        keyId: json.data.apiKey.keyId,
        rawSecret: json.data.newSecret
      });
      fetchApiKeys();
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setRotatingKeyId(null);
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Any applications using it will be blocked.')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/developer/keys/${id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to revoke API key');
      }
      showFeedback('success', 'API key revoked');
      fetchApiKeys();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // ---------------- WEBHOOKS HANDLERS (Phase 3A) ----------------
  const fetchWebhooks = useCallback(async () => {
    setLoadingWebhooks(true);
    try {
      const [epRes, delRes] = await Promise.all([
        authFetch(`${API_BASE}/api/v1/webhooks/endpoints`),
        authFetch(`${API_BASE}/api/v1/webhooks/deliveries`)
      ]);
      const epJson = await epRes.json();
      const delJson = await delRes.json();

      if (epRes.ok && epJson.success && Array.isArray(epJson.data?.endpoints)) {
        setWebhookEndpoints(epJson.data.endpoints);
      } else {
        setWebhookEndpoints([]);
      }

      if (delRes.ok && delJson.success && Array.isArray(delJson.data?.deliveries)) {
        setWebhookDeliveries(delJson.data.deliveries);
      } else {
        setWebhookDeliveries([]);
      }
    } catch {
      setWebhookEndpoints([]);
      setWebhookDeliveries([]);
    } finally {
      setLoadingWebhooks(false);
    }
  }, [authFetch]);

  const handleCreateWebhookEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingWebhook) return;

    if (!newWebhookUrl.trim()) {
      showFeedback('error', 'Webhook URL is required');
      return;
    }

    const events = newWebhookEvents.split(',').map((e) => e.trim()).filter(Boolean);

    setCreatingWebhook(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/webhooks/endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newWebhookUrl.trim(),
          description: newWebhookDescription.trim() || undefined,
          events: events.length > 0 ? events : ['*']
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to register webhook endpoint');
      }

      showFeedback('success', `Webhook endpoint registered.`);
      setNewWebhookUrl('');
      setNewWebhookDescription('');
      fetchWebhooks();
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleDeleteWebhookEndpoint = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook endpoint?')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/webhooks/endpoints/${id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to delete webhook endpoint');
      }
      showFeedback('success', 'Webhook endpoint deleted');
      fetchWebhooks();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleTestWebhookEndpoint = async (id: string) => {
    setTestingWebhookId(id);
    setWebhookTestResult(null);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/webhooks/endpoints/${id}/test`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Webhook test failed');
      }
      setWebhookTestResult(json.data);
      showFeedback(json.data.success ? 'success' : 'error', json.data.success ? 'Webhook test ping succeeded!' : `Test ping failed: ${json.data.errorMessage || json.data.statusCode}`);
      fetchWebhooks();
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setTestingWebhookId(null);
    }
  };

  // Fetch Paired Devices
  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/devices`);
      const json = await res.json();
      const list = Array.isArray(json.data) ? json.data : (json.data?.devices || []);
      if (res.ok && json.success) {
        setDevices(list);
      } else {
        setDevices([]);
      }
    } catch {
      setDevices([]);
    } finally {
      setLoadingDevices(false);
    }
  }, [authFetch]);



  // Generate 8-character pairing code
  const handleGeneratePairingCode = async () => {
    setGeneratingPairingCode(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/devices/generate-pairing-code`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to generate pairing code');
      }
      setActivePairingCode(json.data.pairingCode);
      setPairingCodeExpiresAt(json.data.expiresAt);
      showFeedback('success', `Pairing code ${json.data.pairingCode} generated. Valid for 15 minutes.`);
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setGeneratingPairingCode(false);
    }
  };

  // Revoke device
  const handleRevokeDevice = async (deviceId: string) => {
    if (!window.confirm('Are you sure you want to revoke and disconnect this companion device?')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/devices/${deviceId}/revoke`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to revoke device');
      }
      showFeedback('success', 'Companion device revoked.');
      fetchDevices();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Fetch Notification Sources
  const fetchNotificationSources = useCallback(async () => {
    setLoadingSources(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/devices/notification-sources`);
      const json = await res.json();
      if (res.ok && json.success) {
        setNotificationSources(json.data?.sources || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSources(false);
    }
  }, [authFetch]);



  // Toggle Notification Source on/off
  const handleToggleNotificationSource = async (packageName: string) => {
    try {
      const res = await authFetch(`${API_BASE}/api/v1/devices/notification-sources/${encodeURIComponent(packageName)}/toggle`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to toggle source');
      }
      showFeedback('success', json.message || 'Notification source toggled.');
      fetchNotificationSources();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  // Test Regex against sample alert text
  const handleTestRegex = async () => {
    if (!templateRegex || !testSampleText) {
      showFeedback('error', 'Please provide both a Regex pattern and sample notification/email text to test.');
      return;
    }
    setTestingRegex(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/templates/test-regex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: templateChannel,
          packageName: templateChannel === 'ANDROID' ? (templatePackageName.trim() || undefined) : undefined,
          senderHeader: templateChannel === 'ANDROID' ? (templateSenderHeader.trim() || undefined) : undefined,
          regexPattern: templateRegex,
          sampleText: testSampleText,
          fieldsMap: {
            amountPaiseExtractor: amountExtractor.trim() || undefined,
            utrExtractor: utrExtractor.trim() || undefined,
            accountExtractor: accountExtractor.trim() || undefined,
            transactionTimestampExtractor: timestampExtractor.trim() || undefined,
            transactionTypeExtractor: typeExtractor.trim() || undefined
          }
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setRegexTestResult(json.data);
        if (json.data.matched) {
          showFeedback('success', 'Pattern matched successfully! Check extracted fields preview.');
        } else {
          showFeedback('error', 'Pattern did not match sample text. Please refine the regex.');
        }
      } else {
        showFeedback('error', json.error?.message || 'Regex test failed.');
      }
    } catch {
      showFeedback('error', 'Error executing regex test.');
    } finally {
      setTestingRegex(false);
    }
  };

  // Submit Template for Approval
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveSender = templateChannel === 'ANDROID'
      ? (templateSenderHeader.trim() || templatePackageName.trim() || templateSender.trim() || '*')
      : templateSender.trim();

    if (!templateName || !effectiveSender || !templateRegex) {
      showFeedback('error', 'Template Name, Sender Identifier / Header, and Regex Pattern are required.');
      return;
    }
    setSubmittingTemplate(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: templateChannel,
          provider: templateChannel === 'ANDROID' ? 'ANDROID_COMPANION' : 'GMAIL',
          bankAccountId: templateBankAccountId || undefined,
          samplePayload: testSampleText || undefined,
          senderIdentifier: effectiveSender.toLowerCase(),
          packageName: templateChannel === 'ANDROID' ? (templatePackageName.trim() || undefined) : undefined,
          senderHeader: templateChannel === 'ANDROID' ? (templateSenderHeader.trim() || undefined) : undefined,
          name: templateName.trim(),
          regexPattern: templateRegex.trim(),
          fieldsMap: {
            amountPaiseExtractor: amountExtractor.trim() || undefined,
            utrExtractor: utrExtractor.trim() || undefined,
            accountExtractor: accountExtractor.trim() || undefined,
            transactionTimestampExtractor: timestampExtractor.trim() || undefined,
            transactionTypeExtractor: typeExtractor.trim() || undefined
          },
          status: 'PENDING_APPROVAL'
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', `Template "${templateName}" submitted for approval (PENDING_APPROVAL).`);
        setTemplateName('');
        setTemplateSender('');
        setTemplatePackageName('com.google.android.apps.messaging');
        setTemplateSenderHeader('');
        setTemplateRegex('');
        setTemplateBankAccountId('');
        setTimestampExtractor('');
        setTypeExtractor('');
        setRegexTestResult(null);
        setSelectedEvidenceForTemplate(null);
        fetchTemplates();
      } else {
        showFeedback('error', json.error?.message || 'Failed to create template.');
      }
    } catch {
      showFeedback('error', 'Error creating template.');
    } finally {
      setSubmittingTemplate(false);
    }
  };

  // Reclassify Historical Evidence
  const handleReclassifyEvidence = async () => {
    setReclassifyingEvidence(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/evidence/reclassify`, {
        method: 'POST'
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback(
          'success',
          `Reclassification complete! Evaluated: ${json.data.totalEvaluated}, Updated: ${json.data.reclassifiedCount} (Rejected non-financial: ${json.data.rejectedCount}, Needs review: ${json.data.reviewCount}, Ready: ${json.data.unmatchedCount}).`
        );
        fetchEvidence();
      } else {
        showFeedback('error', json.error?.message || 'Failed to reclassify evidence.');
      }
    } catch {
      showFeedback('error', 'Error reclassifying evidence.');
    } finally {
      setReclassifyingEvidence(false);
    }
  };

  // Approve Template with mandatory sample verification
  const handleApproveTemplate = async (templateId: string | undefined, version: number) => {
    if (!templateId || templateId === 'undefined') {
      showFeedback('error', 'Cannot approve template: invalid or missing template ID.');
      return;
    }
    try {
      const res = await authFetch(`${API_BASE}/api/v1/templates/${templateId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetVersion: version,
          approvalNotes: 'Approved via Merchant Dashboard',
          samplePayload: testSampleText || undefined
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', `Template version ${version} approved and verified active!`);
        fetchTemplates();
      } else {
        showFeedback('error', json.error?.message || 'Failed to approve template.');
      }
    } catch {
      showFeedback('error', 'Error approving template.');
    }
  };

  // Reactivate Template
  const handleReactivateTemplate = async (templateId: string | undefined, switchConflicting: boolean = false) => {
    if (!templateId || templateId === 'undefined') {
      showFeedback('error', 'Cannot reactivate template: invalid or missing template ID.');
      return;
    }
    try {
      const res = await authFetch(`${API_BASE}/api/v1/templates/${templateId}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          switchConflicting,
          reactivationNotes: 'Reactivated from Merchant Dashboard'
        })
      });
      const json = await res.json();
      if (res.status === 409 && json.error?.code === 'CONFLICTING_ACTIVE_TEMPLATE') {
        // Show conflict confirmation modal
        setConflictModal({
          targetTemplateId: templateId,
          conflictingTemplate: json.error.conflictingTemplate
        });
        return;
      }
      if (res.ok && json.success) {
        setConflictModal(null);
        showFeedback('success', 'Template reactivated successfully and is now active for evidence extraction!');
        fetchTemplates();
      } else {
        showFeedback('error', json.error?.message || 'Failed to reactivate template.');
      }
    } catch {
      showFeedback('error', 'Error reactivating template.');
    }
  };

  // Archive Template (soft-delete, preservation for historical compliance)
  const handleArchiveTemplate = async (templateId: string | undefined) => {
    if (!templateId || templateId === 'undefined') {
      showFeedback('error', 'Cannot archive template: invalid or missing template ID.');
      return;
    }
    if (!confirm('Are you sure you want to archive this template? It will be safely preserved for historical audit records, but will stop extracting new evidence.')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/templates/${templateId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Archived from Merchant Dashboard' })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', 'Template archived safely.');
        fetchTemplates();
      } else {
        showFeedback('error', json.error?.message || 'Failed to archive template.');
      }
    } catch {
      showFeedback('error', 'Error archiving template.');
    }
  };

  // Restore Template from archive
  const handleRestoreTemplate = async (templateId: string | undefined) => {
    if (!templateId || templateId === 'undefined') {
      showFeedback('error', 'Cannot restore template: invalid or missing template ID.');
      return;
    }
    try {
      const res = await authFetch(`${API_BASE}/api/v1/templates/${templateId}/restore`, {
        method: 'POST'
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', 'Template restored from archive.');
        fetchTemplates();
      } else {
        showFeedback('error', json.error?.message || 'Failed to restore template.');
      }
    } catch {
      showFeedback('error', 'Error restoring template.');
    }
  };

  // Permanent Delete Template (only permitted if zero dependent evidence records exist)
  const handleDeleteTemplate = async (templateId: string | undefined) => {
    if (!templateId || templateId === 'undefined') {
      showFeedback('error', 'Cannot delete template: invalid or missing template ID.');
      return;
    }
    if (!confirm('Permanently delete this template? Note: templates that have extracted payment evidence cannot be permanently deleted and must be archived instead.')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/templates/${templateId}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', 'Template deleted permanently.');
        fetchTemplates();
      } else {
        showFeedback('error', json.error?.message || 'Failed to delete template. If historical evidence exists, please use Archive instead.');
      }
    } catch {
      showFeedback('error', 'Error deleting template.');
    }
  };

  // View Version History
  const handleFetchVersionHistory = async (tmpl: EvidenceTemplateItem) => {
    setHistoryTemplate(tmpl);
    setLoadingHistory(true);
    try {
      const tid = tmpl.id || tmpl._id || '';
      const res = await authFetch(`${API_BASE}/api/v1/templates/${tid}/history`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data?.history)) {
        setTemplateHistoryList(json.data.history);
      } else {
        setTemplateHistoryList(tmpl.history || []);
      }
    } catch {
      setTemplateHistoryList(tmpl.history || []);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Save New Version of Template
  const handleSaveNewVersion = async () => {
    if (!editingVersionTemplate) return;
    if (!newVersionRegex.trim()) {
      showFeedback('error', 'Regex pattern cannot be empty.');
      return;
    }
    setSavingNewVersion(true);
    try {
      const tid = editingVersionTemplate.id || editingVersionTemplate._id || '';
      const res = await authFetch(`${API_BASE}/api/v1/templates/${tid}/version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regexPattern: newVersionRegex.trim(),
          changeReason: newVersionReason.trim() || `Created version ${editingVersionTemplate.version + 1}`,
          samplePayload: testSampleText || undefined
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', `Created new version ${editingVersionTemplate.version + 1} in PENDING_APPROVAL.`);
        setEditingVersionTemplate(null);
        fetchTemplates();
      } else {
        showFeedback('error', json.error?.message || 'Failed to create new template version.');
      }
    } catch {
      showFeedback('error', 'Error creating new version.');
    } finally {
      setSavingNewVersion(false);
    }
  };
  const handleDisableTemplate = async (templateId: string | undefined) => {
    if (!templateId || templateId === 'undefined') {
      showFeedback('error', 'Cannot disable template: invalid or missing template ID.');
      return;
    }
    if (!confirm('Are you sure you want to disable this template? It will no longer be used for evidence extraction.')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/templates/${templateId}/disable`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Disabled from Merchant Dashboard' })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', 'Template disabled.');
        fetchTemplates();
      } else {
        showFeedback('error', json.error?.message || 'Failed to disable template.');
      }
    } catch {
      showFeedback('error', 'Error disabling template.');
    }
  };

  // Load Gmail Integration Status
  const fetchGmailStatus = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/v1/integrations/gmail/status`);
      const json: ApiResponse<GmailIntegrationStatus> = await res.json();
      if (res.ok && json.success && json.data) {
        setGmailStatus(json.data);
      }
    } catch {
      // Handled silently
    }
  }, [authFetch]);



  // Load Ingested Evidence with dual-field compatibility (items or evidence) and array safety
  const fetchEvidence = useCallback(async () => {
    setLoadingEvidence(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/evidence`);
      const json: ApiResponse<{ items?: EvidenceItem[]; evidence?: EvidenceItem[] }> = await res.json();
      if (res.ok && json.success && json.data) {
        const rawList = json.data.items || json.data.evidence || [];
        setEvidenceList(Array.isArray(rawList) ? rawList : []);
      } else {
        setEvidenceList([]);
      }
    } catch {
      setEvidenceList([]);
    } finally {
      setLoadingEvidence(false);
    }
  }, [authFetch]);

  // Load Reconciliation Cases with filters and search
  const fetchReconciliationCases = useCallback(async () => {
    setLoadingReconCases(true);
    try {
      const params = new URLSearchParams();
      if (reconStatusFilter !== 'ALL') params.set('status', reconStatusFilter);
      if (reconSeverityFilter !== 'ALL') params.set('severity', reconSeverityFilter);
      if (reconTypeFilter !== 'ALL') params.set('caseType', reconTypeFilter);
      if (reconBankAccountId) params.set('bankAccountId', reconBankAccountId);
      if (reconSearch.trim()) params.set('search', reconSearch.trim());

      const res = await authFetch(`${API_BASE}/api/v1/reconciliation/cases?${params.toString()}`);
      const json: ApiResponse<{ cases: ReconciliationCaseItem[]; total: number }> = await res.json();
      if (res.ok && json.success && json.data) {
        setReconCases(json.data.cases || []);
      } else {
        setReconCases([]);
      }
    } catch {
      showFeedback('error', 'Failed to load reconciliation cases');
      setReconCases([]);
    } finally {
      setLoadingReconCases(false);
    }
  }, [authFetch, reconStatusFilter, reconSeverityFilter, reconTypeFilter, reconBankAccountId, reconSearch]);

  // Handle Update Case Status (Investigating / Dismissed / Open)
  const handleUpdateCaseStatus = async (caseId: string, newStatus: 'OPEN' | 'INVESTIGATING' | 'DISMISSED', notes?: string) => {
    try {
      const res = await authFetch(`${API_BASE}/api/v1/reconciliation/cases/${caseId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, notes })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', `Case status updated to ${newStatus}`);
        fetchReconciliationCases();
        if (selectedCase && (selectedCase.id === caseId || (selectedCase as any)._id === caseId)) {
          setSelectedCase(json.data.case);
        }
      } else {
        showFeedback('error', json.error?.message || 'Failed to update case status');
      }
    } catch {
      showFeedback('error', 'Error updating case status');
    }
  };

  // Handle Resolve Case
  const handleResolveCase = async (caseId: string) => {
    if (!caseResolutionNotes.trim()) {
      showFeedback('error', 'Please provide resolution notes explaining the decision.');
      return;
    }
    setResolvingCase(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/reconciliation/cases/${caseId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: caseAction,
          notes: caseResolutionNotes.trim()
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', `Case resolved successfully with action: ${caseAction}`);
        setCaseResolutionNotes('');
        setSelectedCase(null);
        fetchReconciliationCases();
        fetchPayments();
      } else {
        showFeedback('error', json.error?.message || 'Failed to resolve reconciliation case');
      }
    } catch {
      showFeedback('error', 'Error resolving reconciliation case');
    } finally {
      setResolvingCase(false);
    }
  };

  // Handle Trigger Auto-Reconciliation
  const handleRunAutoReconcile = async () => {
    setAutoReconciling(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/reconciliation/auto-reconcile`, {
        method: 'POST'
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        showFeedback(
          'success',
          `Auto-reconciliation complete: Scanned ${json.data.scanned} payments, auto-resolved ${json.data.autoResolved} cases, created ${json.data.casesCreated} new exception cases.`
        );
        fetchReconciliationCases();
        fetchPayments();
      } else {
        showFeedback('error', json.error?.message || 'Auto-reconciliation process failed');
      }
    } catch {
      showFeedback('error', 'Error running auto-reconciliation');
    } finally {
      setAutoReconciling(false);
    }
  };

  // Load Analytics Summary and Timeseries (Phase 4A)
  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    setAnalyticsError(null);
    try {
      const params = new URLSearchParams();
      params.set('timeframe', analyticsTimeframe);
      if (analyticsTimeframe === 'custom' && analyticsStartDate) {
        params.set('startDate', analyticsStartDate);
        if (analyticsEndDate) params.set('endDate', analyticsEndDate);
      }
      if (analyticsStatus) params.set('status', analyticsStatus);
      if (analyticsBankAccountId && analyticsBankAccountId !== 'ALL') params.set('bankAccountId', analyticsBankAccountId);
      if (analyticsSource && analyticsSource !== 'ALL') params.set('source', analyticsSource);

      const [summaryRes, timeseriesRes] = await Promise.all([
        authFetch(`${API_BASE}/api/v1/merchant/analytics/summary?${params.toString()}`),
        authFetch(`${API_BASE}/api/v1/merchant/analytics/timeseries?${params.toString()}`)
      ]);

      const summaryJson: ApiResponse<MerchantAnalyticsSummaryDto> = await summaryRes.json();
      const timeseriesJson: ApiResponse<MerchantAnalyticsTimeseriesDto> = await timeseriesRes.json();

      if (summaryRes.ok && summaryJson.success && summaryJson.data) {
        setAnalyticsSummary(summaryJson.data);
      } else {
        setAnalyticsError(summaryJson.error?.message || 'Failed to load analytics summary');
      }

      if (timeseriesRes.ok && timeseriesJson.success && timeseriesJson.data) {
        setAnalyticsTimeseries(timeseriesJson.data);
      }
    } catch (err: any) {
      setAnalyticsError(err.message || 'Error fetching analytics');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [authFetch, analyticsTimeframe, analyticsStartDate, analyticsEndDate, analyticsStatus, analyticsBankAccountId, analyticsSource]);

  const handleExportReport = async (reportType: 'payments' | 'evidence' | 'reconciliation' | 'daily_summary') => {
    setExportingReportType(reportType);
    try {
      const params = new URLSearchParams();
      params.set('reportType', reportType);
      params.set('format', 'csv');
      params.set('timeframe', analyticsTimeframe);
      if (analyticsTimeframe === 'custom' && analyticsStartDate) {
        params.set('startDate', analyticsStartDate);
        if (analyticsEndDate) params.set('endDate', analyticsEndDate);
      }
      if (analyticsStatus) params.set('status', analyticsStatus);
      if (analyticsBankAccountId && analyticsBankAccountId !== 'ALL') params.set('bankAccountId', analyticsBankAccountId);
      if (analyticsSource && analyticsSource !== 'ALL') params.set('source', analyticsSource);

      const res = await authFetch(`${API_BASE}/api/v1/merchant/analytics/reports/export?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || `Export failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `rgs-report-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
      if (contentDisposition && contentDisposition.includes('filename=')) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showFeedback('success', `Exported ${reportType.replace('_', ' ')} CSV successfully`);
    } catch (err: any) {
      showFeedback('error', `Report export failed: ${err.message}`);
    } finally {
      setExportingReportType(null);
    }
  };

  // Fetch real-time onboarding readiness status (Phase 4B)
  const fetchOnboardingStatus = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/merchant/onboarding/status`);
      const json: ApiResponse<MerchantOnboardingStatusDto> = await res.json();
      if (res.ok && json.success && json.data) {
        setOnboardingStatus(json.data);
      }
    } catch {
      // Ignore if session not established
    }
  }, [authFetch, accessToken]);

  const handleDismissOnboarding = async () => {
    try {
      await authFetch(`${API_BASE}/api/v1/merchant/onboarding/dismiss`, { method: 'POST' });
      setOnboardingStatus((prev) => (prev ? { ...prev, isDismissed: true } : null));
    } catch {
      setOnboardingStatus((prev) => (prev ? { ...prev, isDismissed: true } : null));
    }
  };



  // Handle URL query parameters after Google OAuth redirection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get('status');
    const emailParam = params.get('email');
    const errorParam = params.get('error');

    if (statusParam === 'connected') {
      showFeedback('success', `Gmail account connected successfully: ${emailParam || ''}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam) {
      showFeedback('error', `Gmail connection failed: ${errorParam}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Initial session restoration on mount
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      const storedToken = localStorage.getItem('rgs_access_token');
      if (storedToken) {
        try {
          const res = await fetch(`${API_BASE}/api/v1/merchant/profile`, {
            headers: { Authorization: `Bearer ${storedToken}` },
            credentials: 'include'
          });
          if (res.ok) {
            const json: ApiResponse<{ merchant: MerchantProfile }> = await res.json();
            if (isMounted && json.success && json.data?.merchant) {
              setAccessToken(storedToken);
              setProfile(json.data.merchant);
              setEditVpa(json.data.merchant.upiConfig.vpa);
              setEditBusinessName(json.data.merchant.upiConfig.businessName);
              setEditAccepting(json.data.merchant.upiConfig.isAcceptingPayments ?? true);
              setIsCheckingAuth(false);
              return;
            }
          }
        } catch {
          // Token verification failed; fall through to silent refresh
        }
      }

      // If token missing or expired, attempt silent rotation via HttpOnly cookie
      try {
        const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        if (refreshRes.ok) {
          const refreshJson: ApiResponse<{ accessToken: string }> = await refreshRes.json();
          const newAccess = refreshJson.data?.accessToken;
          if (isMounted && refreshJson.success && newAccess) {
            setAccessToken(newAccess);
            localStorage.setItem('rgs_access_token', newAccess);

            const profileRes = await fetch(`${API_BASE}/api/v1/merchant/profile`, {
              headers: { Authorization: `Bearer ${newAccess}` },
              credentials: 'include'
            });
            if (profileRes.ok) {
              const profileJson: ApiResponse<{ merchant: MerchantProfile }> = await profileRes.json();
              if (profileJson.success && profileJson.data?.merchant) {
                setProfile(profileJson.data.merchant);
                setEditVpa(profileJson.data.merchant.upiConfig.vpa);
                setEditBusinessName(profileJson.data.merchant.upiConfig.businessName);
                setEditAccepting(profileJson.data.merchant.upiConfig.isAcceptingPayments ?? true);
              }
            }
            setIsCheckingAuth(false);
            return;
          }
        }
      } catch {
        // Silent refresh failed
      }

      // Not authenticated: clear stale session records
      if (isMounted) {
        setAccessToken('');
        localStorage.removeItem('rgs_access_token');
        setUser(null);
        localStorage.removeItem('rgs_user');
        setIsCheckingAuth(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Load dashboard dataset only after initial session verification has concluded
  useEffect(() => {
    if (!isCheckingAuth && accessToken) {
      fetchProfile();
      fetchPayments();
      fetchGmailStatus();
      fetchEvidence();
      fetchTemplates();
      fetchBankAccounts();
      fetchDevices();
      fetchNotificationSources();
      fetchReconciliationCases();
      fetchPaymentLinks();
      fetchApiKeys();
      fetchWebhooks();
      fetchOnboardingStatus();
    }
  }, [isCheckingAuth, accessToken, fetchProfile, fetchPayments, fetchGmailStatus, fetchEvidence, fetchTemplates, fetchBankAccounts, fetchDevices, fetchNotificationSources, fetchReconciliationCases, fetchPaymentLinks, fetchApiKeys, fetchWebhooks, fetchOnboardingStatus]);

  // Refetch when tab changes
  useEffect(() => {
    if (!isCheckingAuth && accessToken) {
      if (activeTab === 'analytics') fetchAnalytics();
      else if (activeTab === 'reconciliation') fetchReconciliationCases();
      else if (activeTab === 'payment-links') fetchPaymentLinks();
      else if (activeTab === 'api-keys') fetchApiKeys();
      else if (activeTab === 'webhooks') fetchWebhooks();
    }
  }, [isCheckingAuth, accessToken, activeTab, fetchAnalytics, fetchReconciliationCases, fetchPaymentLinks, fetchApiKeys, fetchWebhooks]);

  const handleConnectGmail = async () => {
    setLoadingGmail(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/integrations/gmail/connect`);
      const json: ApiResponse<{ authUrl: string }> = await res.json();
      if (res.ok && json.success && json.data?.authUrl) {
        window.location.href = json.data.authUrl;
      } else {
        showFeedback('error', json.error?.message || 'Failed to initiate Gmail OAuth');
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to connect Gmail');
    } finally {
      setLoadingGmail(false);
    }
  };

  const handleSyncGmail = async () => {
    setSyncingGmail(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/integrations/gmail/sync`, {
        method: 'POST'
      });
      const json: ApiResponse<{ newEvidenceCount: number; duplicatesCount: number; totalProcessed: number }> = await res.json();
      if (res.ok && json.success && json.data) {
        showFeedback('success', `Sync finished: ${json.data.newEvidenceCount} new evidence record(s) extracted from ${json.data.totalProcessed} email(s).`);
        fetchGmailStatus();
        fetchEvidence();
      } else {
        showFeedback('error', json.error?.message || 'Sync failed');
        fetchGmailStatus();
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Sync request failed');
    } finally {
      setSyncingGmail(false);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!window.confirm('Are you sure you want to disconnect Gmail? Tokens will be revoked.')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/integrations/gmail/disconnect`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showFeedback('success', 'Gmail integration disconnected successfully.');
        fetchGmailStatus();
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to disconnect');
    }
  };

  // Handle Login & Registration with Robust Credential Extraction
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading) return; // Prevent duplicate concurrent submissions

    setAuthError(null);
    setAuthLoading(true);

    try {
      const endpoint = authMode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const payload = authMode === 'login'
        ? { email: email.trim().toLowerCase(), password }
        : { email: email.trim().toLowerCase(), password, merchantName: merchantName.trim(), upiVpa: upiVpa.trim() };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        const errMessage = json.error?.message
          || (res.status === 401 ? 'Invalid email or password. Please verify your credentials.' : undefined)
          || (res.status === 409 ? 'An account with this email address already exists.' : undefined)
          || 'Authentication failed. Please check your inputs.';
        setAuthError(errMessage);
        return;
      }

      // Backend returns { user, merchant, tokens: { accessToken, refreshToken, expiresIn } }
      const newAccess = json.data?.tokens?.accessToken || (json.data as any)?.accessToken;
      const userRaw = json.data?.user;
      const merchantRaw = json.data?.merchant;

      if (newAccess && userRaw) {
        // Establish authenticated session immediately
        const sessionUser: UserSession = {
          userId: userRaw.id || userRaw.userId,
          email: userRaw.email,
          merchantId: userRaw.merchantId,
          role: userRaw.role
        };

        setAccessToken(newAccess);
        setUser(sessionUser);
        localStorage.setItem('rgs_access_token', newAccess);
        localStorage.setItem('rgs_user', JSON.stringify(sessionUser));

        if (merchantRaw) {
          setProfile(merchantRaw);
          setEditVpa(merchantRaw.upiConfig?.vpa || '');
          setEditBusinessName(merchantRaw.upiConfig?.businessName || '');
          setEditAccepting(merchantRaw.upiConfig?.isAcceptingPayments ?? true);
        }

        // Reset sensitive input fields
        setPassword('');
        setEmail('');
        setMerchantName('');
        setUpiVpa('');

        if (authMode === 'register') {
          showFeedback('success', `Welcome to RGS Ledger, ${merchantRaw?.name || sessionUser.email}! Your merchant account has been created.`);
        } else {
          showFeedback('success', `Welcome back, ${merchantRaw?.name || sessionUser.email}! Signed in successfully.`);
        }
      } else if (authMode === 'register') {
        // Registration succeeded without returning immediate session tokens
        setAuthMode('login');
        setPassword('');
        showFeedback('success', 'Account created successfully! Please sign in with your credentials.');
      } else {
        setAuthError('Sign in response did not contain valid access credentials.');
      }
    } catch {
      setAuthError('Unable to connect to the API server. Please check your network connection.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Update UPI Configuration
  const handleUpdateUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/merchant/upi`, {
        method: 'PUT',
        body: JSON.stringify({
          vpa: editVpa.trim(),
          businessName: editBusinessName.trim(),
          isAcceptingPayments: editAccepting
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showFeedback('error', json.error?.message || 'Failed to update UPI settings');
        return;
      }
      showFeedback('success', 'UPI Settings updated successfully!');
      fetchProfile();
    } catch {
      showFeedback('error', 'Error updating UPI configuration');
    } finally {
      setSavingProfile(false);
    }
  };

  // Create Payment
  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(newAmountRupees);
    if (isNaN(amountNum) || amountNum <= 0) {
      showFeedback('error', 'Please enter a valid amount greater than ₹0');
      return;
    }

    setCreatingPayment(true);
    try {
      const amountPaise = Math.round(amountNum * 100);
      const idempotencyKey = `idempotency_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      const chosenAccount = bankAccounts.find(b => b.id === selectedBankAccountId);
      if (chosenAccount && !chosenAccount.isActive) {
        showFeedback('error', 'The selected bank account is disabled. Please enable it in the Bank Accounts tab or select Default VPA.');
        setCreatingPayment(false);
        return;
      }

      const trimmedAccountId = selectedBankAccountId.trim();
      const payload: any = {
        orderId: newOrderId.trim(),
        amountPaise,
        description: newDescription.trim() || undefined,
        expiresInMinutes: parseInt(newExpiryMinutes, 10) || 15,
        idempotencyKey
      };
      if (trimmedAccountId && trimmedAccountId !== '') {
        payload.bankAccountId = trimmedAccountId;
      }

      const res = await authFetch(`${API_BASE}/api/v1/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showFeedback('error', json.error?.message || 'Failed to create payment');
        return;
      }

      showFeedback('success', `Payment for Order #${newOrderId} created with QR Code!`);
      setNewOrderId('');
      setNewAmountRupees('');
      setNewDescription('');
      fetchPayments();
      setSelectedPayment(json.data.payment);
    } catch {
      showFeedback('error', 'Error creating payment request');
    } finally {
      setCreatingPayment(false);
    }
  };

  // Cancel Payment
  const handleCancelPayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to cancel this payment request?')) return;
    try {
      const res = await authFetch(`${API_BASE}/api/v1/payments/${paymentId}/cancel`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showFeedback('error', json.error?.message || 'Failed to cancel payment');
        return;
      }
      showFeedback('success', 'Payment marked CANCELLED');
      fetchPayments();
      if (selectedPayment && selectedPayment.id === paymentId) {
        setSelectedPayment({ ...selectedPayment, status: PaymentStatus.CANCELLED });
      }
    } catch {
      showFeedback('error', 'Error cancelling payment');
    }
  };

  // Dual-source matching & manual review states
  const [matchingEvidence, setMatchingEvidence] = useState(false);
  const [resolvingReview, setResolvingReview] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  // Re-evaluate Dual-Source Matching
  const handleTriggerMatching = async () => {
    setMatchingEvidence(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/evidence-matching/re-evaluate`, {
        method: 'POST'
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback(
          'success',
          `Evaluated ${json.data?.evaluated || 0} evidence records, matched ${json.data?.matched || 0} to open payments.`
        );
        fetchPayments();
        fetchEvidence();
      } else {
        showFeedback('error', json.error?.message || 'Matching evaluation failed');
      }
    } catch {
      showFeedback('error', 'Error running matching engine');
    } finally {
      setMatchingEvidence(false);
    }
  };

  // Manual Review Resolution
  const handleResolveReview = async (action: 'RESOLVE' | 'DISMISS') => {
    if (!selectedPayment) return;
    setResolvingReview(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/evidence-matching/manual-review`, {
        method: 'POST',
        body: JSON.stringify({
          paymentRequestId: selectedPayment.id,
          action,
          notes: reviewNotes.trim()
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showFeedback('success', json.data?.message || 'Case resolved successfully');
        setReviewNotes('');
        fetchPayments();
        setSelectedPayment((prev) => (prev ? { ...prev, status: json.data?.status || prev.status, reviewReason: undefined } : null));
      } else {
        showFeedback('error', json.error?.message || 'Failed to resolve case');
      }
    } catch {
      showFeedback('error', 'Error resolving review case');
    } finally {
      setResolvingReview(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // ---------------- INITIAL AUTH CHECK LOADING ----------------
  if (isCheckingAuth) {
    return (
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '440px', margin: '96px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#111827', margin: 0 }}>RGS Ledger</h1>
        <p style={{ color: '#6B7280', fontSize: '14px', marginTop: '8px' }}>Restoring merchant session...</p>
        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid #E5E7EB', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ---------------- AUTHENTICATION VIEW ----------------
  if (!accessToken) {
    return (
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '440px', margin: '48px auto', padding: '0 16px' }}>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#111827', margin: 0 }}>RGS Ledger</h1>
          <p style={{ color: '#4B5563', fontSize: '14px', marginTop: '4px' }}>Merchant Portal & UPI Payment Engine</p>
        </div>

        {/* Global Feedback Toast in Auth View */}
        {feedback && (
          <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', fontWeight: 500, background: feedback.type === 'success' ? '#DEF7EC' : '#FDE8E8', color: feedback.type === 'success' ? '#03543F' : '#9B1C1C', border: `1px solid ${feedback.type === 'success' ? '#31C48D' : '#F98080'}` }}>
            {feedback.message}
          </div>
        )}

        <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', marginBottom: '20px' }}>
            <button
              onClick={() => { if (!authLoading) { setAuthMode('login'); setAuthError(null); } }}
              disabled={authLoading}
              style={{ flex: 1, padding: '10px', background: 'none', border: 'none', borderBottom: authMode === 'login' ? '2px solid #2563EB' : 'none', fontWeight: authMode === 'login' ? 700 : 500, color: authMode === 'login' ? '#2563EB' : '#6B7280', cursor: authLoading ? 'not-allowed' : 'pointer' }}
            >
              Merchant Sign In
            </button>
            <button
              onClick={() => { if (!authLoading) { setAuthMode('register'); setAuthError(null); } }}
              disabled={authLoading}
              style={{ flex: 1, padding: '10px', background: 'none', border: 'none', borderBottom: authMode === 'register' ? '2px solid #2563EB' : 'none', fontWeight: authMode === 'register' ? 700 : 500, color: authMode === 'register' ? '#2563EB' : '#6B7280', cursor: authLoading ? 'not-allowed' : 'pointer' }}
            >
              Register Account
            </button>
          </div>

          {authError && (
            <div style={{ padding: '10px 14px', background: '#FEE2E2', border: '1px solid #F87171', borderRadius: '6px', color: '#991B1B', fontSize: '13px', marginBottom: '16px' }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {authMode === 'register' && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Business / Merchant Name</label>
                  <input
                    type="text"
                    required
                    disabled={authLoading}
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="e.g. Acme Retail Pvt Ltd"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', backgroundColor: authLoading ? '#F9FAFB' : '#FFFFFF' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Your UPI ID (VPA)</label>
                  <input
                    type="text"
                    required
                    disabled={authLoading}
                    value={upiVpa}
                    onChange={(e) => setUpiVpa(e.target.value)}
                    placeholder="e.g. yourname@okhdfcbank"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', backgroundColor: authLoading ? '#F9FAFB' : '#FFFFFF' }}
                  />
                  <span style={{ fontSize: '11px', color: '#6B7280' }}>All customer payments transfer directly to this UPI address.</span>
                </div>
              </>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Work Email</label>
              <input
                type="email"
                required
                disabled={authLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="merchant@example.com"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', backgroundColor: authLoading ? '#F9FAFB' : '#FFFFFF' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Password</label>
              <input
                type="password"
                required
                disabled={authLoading}
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', backgroundColor: authLoading ? '#F9FAFB' : '#FFFFFF' }}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              style={{
                marginTop: '8px',
                padding: '11px',
                background: authLoading ? '#93C5FD' : '#2563EB',
                color: '#FFF',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: authLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {authLoading && (
                <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              )}
              {authLoading
                ? (authMode === 'login' ? 'Signing in...' : 'Creating account...')
                : (authMode === 'login' ? 'Sign In to Dashboard' : 'Create Merchant Account')}
            </button>
          </form>
        </div>

        <div style={{ marginTop: '20px' }}>
          <NonCustodialDisclosureBanner />
        </div>
      </div>
    );
  }

  // ---------------- AUTHENTICATED DASHBOARD ----------------
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1100px', margin: '24px auto', padding: '0 20px', color: '#111827' }}>
      {/* Top Navbar */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '16px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: '800', margin: 0 }}>RGS Ledger</h1>
            <span style={{ fontSize: '11px', background: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>PHASE 1 ENGINE</span>
          </div>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>
            Merchant: <strong>{profile?.name || user?.email}</strong> &bull; UPI: <strong>{profile?.upiConfig.vpa || 'Not Configured'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#4B5563' }}>{user?.email}</span>
          <button
            onClick={handleLogout}
            style={{ padding: '7px 14px', background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E5E7EB', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'overview' ? '3px solid #2563EB' : '3px solid transparent',
            color: activeTab === 'overview' ? '#2563EB' : '#6B7280'
          }}
        >
          💳 Payments & Evidence
        </button>
        <button
          onClick={() => {
            setActiveTab('analytics');
            fetchAnalytics();
          }}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'analytics' ? '3px solid #2563EB' : '3px solid transparent',
            color: activeTab === 'analytics' ? '#2563EB' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>📊 Analytics & Reports</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('reconciliation');
            fetchReconciliationCases();
          }}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'reconciliation' ? '3px solid #2563EB' : '3px solid transparent',
            color: activeTab === 'reconciliation' ? '#2563EB' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>⚖️ Reconciliation</span>
          {reconCases.filter((c) => c.status === 'OPEN' || c.status === 'INVESTIGATING').length > 0 && (
            <span style={{ fontSize: '11px', background: '#FEE2E2', color: '#991B1B', fontWeight: 800, padding: '1px 6px', borderRadius: '10px', border: '1px solid #FCA5A5' }}>
              {reconCases.filter((c) => c.status === 'OPEN' || c.status === 'INVESTIGATING').length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('payment-links');
            fetchPaymentLinks();
          }}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'payment-links' ? '3px solid #2563EB' : '3px solid transparent',
            color: activeTab === 'payment-links' ? '#2563EB' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>🔗 Payment Links</span>
          <span style={{ fontSize: '11px', background: '#E0E7FF', color: '#3730A3', padding: '1px 6px', borderRadius: '10px' }}>
            {paymentLinks.length}
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab('api-keys');
            fetchApiKeys();
          }}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'api-keys' ? '3px solid #2563EB' : '3px solid transparent',
            color: activeTab === 'api-keys' ? '#2563EB' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>🔑 API Keys</span>
          <span style={{ fontSize: '11px', background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: '10px' }}>
            {apiKeys.length}
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab('webhooks');
            fetchWebhooks();
          }}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'webhooks' ? '3px solid #2563EB' : '3px solid transparent',
            color: activeTab === 'webhooks' ? '#2563EB' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>🔔 Webhooks</span>
          <span style={{ fontSize: '11px', background: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: '10px' }}>
            {webhookEndpoints.length}
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab('bank-accounts');
            fetchBankAccounts();
          }}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'bank-accounts' ? '3px solid #2563EB' : '3px solid transparent',
            color: activeTab === 'bank-accounts' ? '#2563EB' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>🏦 Bank Accounts</span>
          <span style={{ fontSize: '11px', background: '#DBEAFE', color: '#1E40AF', padding: '1px 6px', borderRadius: '10px' }}>
            {bankAccounts.length}
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab('templates');
            fetchTemplates();
          }}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'templates' ? '3px solid #2563EB' : '3px solid transparent',
            color: activeTab === 'templates' ? '#2563EB' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>📜 Evidence Templates</span>
          <span style={{ fontSize: '11px', background: '#E0E7FF', color: '#3730A3', padding: '1px 6px', borderRadius: '10px' }}>
            {templates.length}
          </span>
        </button>
        <button
          onClick={() => {
            setActiveTab('devices');
            fetchDevices();
            fetchNotificationSources();
          }}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'devices' ? '3px solid #2563EB' : '3px solid transparent',
            color: activeTab === 'devices' ? '#2563EB' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>📱 Android Devices</span>
          <span style={{ fontSize: '11px', background: '#DEF7EC', color: '#03543F', padding: '1px 6px', borderRadius: '10px' }}>
            {devices.length}
          </span>
        </button>
      </div>

      {/* Global Alerts */}
      {feedback && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: 500, background: feedback.type === 'success' ? '#DEF7EC' : '#FDE8E8', color: feedback.type === 'success' ? '#03543F' : '#9B1C1C', border: `1px solid ${feedback.type === 'success' ? '#31C48D' : '#F98080'}` }}>
          {feedback.message}
        </div>
      )}

      {/* Merchant Setup & Verification Readiness Checklist Banner (Phase 4B) */}
      {onboardingStatus && !onboardingStatus.isDismissed && (
        <div
          style={{
            background: onboardingStatus.readinessStatus === 'FULLY_READY' ? '#F0FDF4' : onboardingStatus.readinessStatus === 'PARTIALLY_READY' ? '#EFF6FF' : '#FFFBEB',
            border: onboardingStatus.readinessStatus === 'FULLY_READY' ? '1px solid #BBF7D0' : onboardingStatus.readinessStatus === 'PARTIALLY_READY' ? '1px solid #BFDBFE' : '1px solid #FCD34D',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>
                {onboardingStatus.readinessStatus === 'FULLY_READY' ? '✅' : onboardingStatus.readinessStatus === 'PARTIALLY_READY' ? 'ℹ️' : '⚠️'}
              </span>
              <strong style={{ fontSize: '15px', color: '#111827' }}>
                Setup & Dual-Source Verification Readiness:
              </strong>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: onboardingStatus.readinessStatus === 'FULLY_READY' ? '#D1FAE5' : onboardingStatus.readinessStatus === 'PARTIALLY_READY' ? '#DBEAFE' : '#FEF3C7',
                  color: onboardingStatus.readinessStatus === 'FULLY_READY' ? '#065F46' : onboardingStatus.readinessStatus === 'PARTIALLY_READY' ? '#1E40AF' : '#92400E'
                }}
              >
                {onboardingStatus.readinessStatus}
              </span>
            </div>
            <button
              onClick={handleDismissOnboarding}
              style={{ background: 'none', border: 'none', fontSize: '12px', color: '#6B7280', cursor: 'pointer', padding: '4px 8px' }}
            >
              Dismiss ✕
            </button>
          </div>

          <p style={{ fontSize: '13px', color: '#4B5563', margin: '0 0 14px 0', lineHeight: 1.5 }}>
            {onboardingStatus.readinessMessage}
          </p>

          {/* 5-step checklist pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('bank-accounts')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                background: onboardingStatus.checks.bankAccountActive ? '#DCFCE7' : '#FFFFFF',
                color: onboardingStatus.checks.bankAccountActive ? '#166534' : '#374151',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span>{onboardingStatus.checks.bankAccountActive ? '✓' : '●'}</span>
              <span>1. Bank Account ({onboardingStatus.checks.bankAccountActive ? 'Active' : 'Missing'})</span>
            </button>

            <button
              onClick={() => setActiveTab('overview')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                background: onboardingStatus.checks.emailConnected ? '#DCFCE7' : '#FFFFFF',
                color: onboardingStatus.checks.emailConnected ? '#166534' : '#374151',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span>{onboardingStatus.checks.emailConnected ? '✓' : '●'}</span>
              <span>2. Gmail ({onboardingStatus.checks.emailConnected ? 'Connected' : 'Disconnected'})</span>
            </button>

            <button
              onClick={() => setActiveTab('devices')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                background: onboardingStatus.checks.androidDevicePaired ? '#DCFCE7' : '#FFFFFF',
                color: onboardingStatus.checks.androidDevicePaired ? '#166534' : '#374151',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span>{onboardingStatus.checks.androidDevicePaired ? '✓' : '●'}</span>
              <span>3. Android Device ({onboardingStatus.checks.androidDevicePaired ? 'Paired' : 'Not Paired'})</span>
            </button>

            <button
              onClick={() => setActiveTab('templates')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                background: onboardingStatus.checks.emailTemplateApproved ? '#DCFCE7' : '#FFFFFF',
                color: onboardingStatus.checks.emailTemplateApproved ? '#166534' : '#374151',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span>{onboardingStatus.checks.emailTemplateApproved ? '✓' : '●'}</span>
              <span>4. Email Template ({onboardingStatus.checks.emailTemplateApproved ? 'Approved' : 'Pending'})</span>
            </button>

            <button
              onClick={() => setActiveTab('templates')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                background: onboardingStatus.checks.androidTemplateApproved ? '#DCFCE7' : '#FFFFFF',
                color: onboardingStatus.checks.androidTemplateApproved ? '#166534' : '#374151',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span>{onboardingStatus.checks.androidTemplateApproved ? '✓' : '●'}</span>
              <span>5. Android Template ({onboardingStatus.checks.androidTemplateApproved ? 'Approved' : 'Pending'})</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'overview' ? (
        <>
          {/* Main Grid: Left Column UPI & New Payment, Right Column Payments Table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* UPI Settings Card */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 12px 0' }}>UPI Configuration</h2>
            <form onSubmit={handleUpdateUpi} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Merchant UPI VPA</label>
                <input
                  type="text"
                  required
                  value={editVpa}
                  onChange={(e) => setEditVpa(e.target.value)}
                  placeholder="name@handle"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Business Display Name</label>
                <input
                  type="text"
                  required
                  value={editBusinessName}
                  onChange={(e) => setEditBusinessName(e.target.value)}
                  placeholder="Acme Retail"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  id="acceptingToggle"
                  checked={editAccepting}
                  onChange={(e) => setEditAccepting(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                <label htmlFor="acceptingToggle" style={{ fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                  Accept Incoming Payments
                </label>
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                style={{ padding: '8px 12px', background: '#374151', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}
              >
                {savingProfile ? 'Saving...' : 'Save UPI Settings'}
              </button>
            </form>
          </div>

          {/* Create Payment Card */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 12px 0' }}>Create UPI Payment Request</h2>
            <form onSubmit={handleCreatePayment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Collection Bank Account</label>
                <select
                  value={selectedBankAccountId}
                  onChange={(e) => setSelectedBankAccountId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="">
                    Default Profile VPA ({profile?.upiConfig?.vpa || 'Not configured in profile'})
                  </option>
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id} disabled={!acc.isActive}>
                      {acc.bankName} (XX{acc.accountSuffix}) &bull; {acc.upiId}{!acc.isActive ? ' — (Disabled)' : (acc.isDefault ? ' ★ Default' : '')}
                    </option>
                  ))}
                </select>
                {(() => {
                  const selectedAccount = bankAccounts.find(b => b.id === selectedBankAccountId);
                  const targetVpa = selectedAccount ? selectedAccount.upiId : profile?.upiConfig?.vpa;
                  const isSelectedDisabled = selectedAccount && !selectedAccount.isActive;

                  return (
                    <div style={{ marginTop: '4px', fontSize: '11px' }}>
                      <div style={{ color: isSelectedDisabled ? '#DC2626' : (targetVpa ? '#2563EB' : '#DC2626'), fontWeight: 600 }}>
                        Target UPI ID: {targetVpa || 'No UPI ID configured — please configure a VPA in Settings'}
                      </div>
                      {selectedAccount && (
                        <div style={{ color: selectedAccount.isActive ? '#166534' : '#DC2626', marginTop: '1px' }}>
                          Account: {selectedAccount.bankName} (XX{selectedAccount.accountSuffix}) &bull; Status: {selectedAccount.isActive ? 'Active' : 'Disabled'}
                        </div>
                      )}
                      {isSelectedDisabled && (
                        <div style={{ color: '#DC2626', fontWeight: 600, marginTop: '2px' }}>
                          ⚠ Selected bank account is disabled. Please enable it in the Bank Accounts tab or choose Default VPA.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Order ID</label>
                <input
                  type="text"
                  required
                  value={newOrderId}
                  onChange={(e) => setNewOrderId(e.target.value)}
                  placeholder="e.g. ORD-98214"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Amount in Rupees (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={newAmountRupees}
                  onChange={(e) => setNewAmountRupees(e.target.value)}
                  placeholder="e.g. 499.00"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
                {newAmountRupees && !isNaN(parseFloat(newAmountRupees)) && (
                  <span style={{ fontSize: '11px', color: '#6B7280' }}>
                    = {Math.round(parseFloat(newAmountRupees) * 100)} integer paise
                  </span>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Description (Optional)</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="e.g. Order payment at checkout"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Payment Window (Minutes)</label>
                <select
                  value={newExpiryMinutes}
                  onChange={(e) => setNewExpiryMinutes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="5">5 Minutes</option>
                  <option value="15">15 Minutes (Default)</option>
                  <option value="30">30 Minutes</option>
                  <option value="60">60 Minutes</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={creatingPayment}
                style={{ marginTop: '8px', padding: '10px', background: '#2563EB', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
              >
                {creatingPayment ? 'Generating QR...' : 'Generate Payment & QR'}
              </button>
            </form>
          </div>

          {/* Gmail Evidence Integration Card */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>✉️</span>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>Gmail Evidence</h2>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: gmailStatus?.isConnected ? '#DEF7EC' : gmailStatus?.status === 'REVOKED' ? '#FDE8E8' : '#F3F4F6',
                  color: gmailStatus?.isConnected ? '#03543F' : gmailStatus?.status === 'REVOKED' ? '#9B1C1C' : '#4B5563'
                }}
              >
                {gmailStatus?.isConnected ? '● CONNECTED' : gmailStatus?.status === 'REVOKED' ? '✕ REVOKED' : '○ DISCONNECTED'}
              </span>
            </div>

            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 14px 0', lineHeight: '1.4' }}>
              Connect your business Gmail to automatically ingest bank credit alerts for dual-source verification.
            </p>

            {gmailStatus?.isConnected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', paddingBottom: '6px' }}>
                  <span style={{ color: '#6B7280' }}>Connected Email:</span>
                  <strong style={{ color: '#111827' }}>{gmailStatus.connectedEmail}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', paddingBottom: '6px' }}>
                  <span style={{ color: '#6B7280' }}>Last Sync:</span>
                  <span style={{ color: '#374151' }}>
                    {gmailStatus.lastSyncAt ? new Date(gmailStatus.lastSyncAt).toLocaleString() : 'Never synced'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', paddingBottom: '6px' }}>
                  <span style={{ color: '#6B7280' }}>Ingested Evidence:</span>
                  <span style={{ color: '#374151', fontWeight: 600 }}>
                    {gmailStatus.syncStats?.newEvidenceCount || 0} records ({gmailStatus.syncStats?.duplicatesCount || 0} dupes)
                  </span>
                </div>

                {gmailStatus.lastSyncError && (
                  <div style={{ padding: '8px 10px', background: '#FDE8E8', border: '1px solid #F98080', borderRadius: '6px', fontSize: '12px', color: '#9B1C1C' }}>
                    ⚠️ {gmailStatus.lastSyncError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    onClick={handleSyncGmail}
                    disabled={syncingGmail}
                    style={{ flex: 1, padding: '8px', background: '#2563EB', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: syncingGmail ? 'not-allowed' : 'pointer' }}
                  >
                    {syncingGmail ? 'Syncing...' : '↻ Sync Now'}
                  </button>
                  <button
                    onClick={handleDisconnectGmail}
                    style={{ padding: '8px 12px', background: '#F3F4F6', color: '#DC2626', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {gmailStatus?.status === 'REVOKED' && (
                  <div style={{ padding: '8px 10px', background: '#FDE8E8', border: '1px solid #F98080', borderRadius: '6px', fontSize: '12px', color: '#9B1C1C', marginBottom: '10px' }}>
                    Google permissions were revoked. Please reconnect.
                  </div>
                )}
                <button
                  onClick={handleConnectGmail}
                  disabled={loadingGmail}
                  style={{ width: '100%', padding: '10px', background: '#EA4335', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: loadingGmail ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <span>✉</span>
                  <span>{loadingGmail ? 'Redirecting...' : 'Connect with Google Gmail'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Payments Table */}
        <div>
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Payment Requests</h2>
                <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>All created payment intents and their lifecycle statuses</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleTriggerMatching}
                  disabled={matchingEvidence}
                  style={{
                    padding: '6px 12px',
                    background: '#FEF3C7',
                    color: '#92400E',
                    border: '1px solid #FCD34D',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: matchingEvidence ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>⚡</span>
                  <span>{matchingEvidence ? 'Matching...' : 'Run Dual-Source Match'}</span>
                </button>
                <button
                  onClick={fetchPayments}
                  disabled={loadingPayments}
                  style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                >
                  {loadingPayments ? 'Refreshing...' : '↻ Refresh'}
                </button>
              </div>
            </div>

            {(() => {
              const paymentList = Array.isArray(payments) ? payments : [];
              if (paymentList.length === 0) {
                return (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                    No payment requests found. Create your first payment request using the form on the left.
                  </div>
                );
              }
              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E5E7EB', color: '#4B5563' }}>
                        <th style={{ padding: '10px 8px' }}>Order ID</th>
                        <th style={{ padding: '10px 8px' }}>Amount</th>
                        <th style={{ padding: '10px 8px' }}>Target Account</th>
                        <th style={{ padding: '10px 8px' }}>UTR / Reference</th>
                        <th style={{ padding: '10px 8px' }}>Status & Evidence</th>
                        <th style={{ padding: '10px 8px' }}>Created</th>
                        <th style={{ padding: '10px 8px' }}>Expires</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentList.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '12px 8px', fontWeight: 600 }}>#{p.orderId}</td>
                          <td style={{ padding: '12px 8px', fontWeight: 700 }}>₹{(p.amountPaise / 100).toFixed(2)}</td>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#1F2937' }}>
                              {p.bankName || 'UPI VPA'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#6B7280' }}>
                              {p.accountSuffix ? `XX${p.accountSuffix}` : 'Default Account'}
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: p.evidenceSummary?.utr ? '#F3F4F6' : '#F9FAFB',
                              color: p.evidenceSummary?.utr ? '#111827' : '#9CA3AF'
                            }}>
                              {p.evidenceSummary?.utr || 'Awaiting'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <StatusBadge status={p.status} />
                              {p.reviewReason && (
                                <span style={{
                                  fontSize: '10px',
                                  background: '#FEF3C7',
                                  color: '#92400E',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  border: '1px solid #FCD34D',
                                  fontWeight: 600
                                }}>
                                  ⚠️ {p.reviewReason}
                                </span>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
                                <span style={{
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: p.evidenceSummary?.hasEmailEvidence ? '#DEF7EC' : '#F3F4F6',
                                  color: p.evidenceSummary?.hasEmailEvidence ? '#03543F' : '#9CA3AF',
                                  border: `1px solid ${p.evidenceSummary?.hasEmailEvidence ? '#31C48D' : '#E5E7EB'}`,
                                  fontWeight: 600
                                }}>
                                  ✉ Email
                                </span>
                                <span style={{
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: p.evidenceSummary?.hasAndroidEvidence ? '#DEF7EC' : '#F3F4F6',
                                  color: p.evidenceSummary?.hasAndroidEvidence ? '#03543F' : '#9CA3AF',
                                  border: `1px solid ${p.evidenceSummary?.hasAndroidEvidence ? '#31C48D' : '#E5E7EB'}`,
                                  fontWeight: 600
                                }}>
                                  📱 Android
                                </span>
                                {p.evidenceSummary?.verifiedAt && (
                                  <span style={{ color: '#059669', fontWeight: 600 }}>
                                    ✓ Verified {new Date(p.evidenceSummary.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 8px', color: '#6B7280' }}>
                            {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '12px 8px', color: '#6B7280' }}>
                            {new Date(p.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                            <button
                              onClick={() => setSelectedPayment(p)}
                              style={{ padding: '4px 8px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', marginRight: '6px' }}
                            >
                              View QR
                            </button>
                            {p.status === PaymentStatus.PENDING && (
                              <button
                                onClick={() => handleCancelPayment(p.id)}
                                style={{ padding: '4px 8px', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Ingested Payment Evidence Table */}
      <div style={{ marginTop: '24px', background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Ingested Payment Evidence</h2>
              <span style={{ fontSize: '11px', background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>DUAL-SOURCE FEED</span>
            </div>
            <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>
              Credit alerts ingested from connected Gmail accounts and mobile companion
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleReclassifyEvidence}
              disabled={reclassifyingEvidence}
              style={{
                padding: '6px 12px',
                background: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #FCD34D',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: reclassifyingEvidence ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>⚡</span>
              <span>{reclassifyingEvidence ? 'Reclassifying...' : 'Reclassify Historical Evidence'}</span>
            </button>
            <button
              onClick={fetchEvidence}
              disabled={loadingEvidence}
              style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
            >
              {loadingEvidence ? 'Refreshing...' : '↻ Refresh Evidence'}
            </button>
          </div>
        </div>

        {/* Evidence Status Filters */}
        {(() => {
          const allItems = Array.isArray(evidenceList) ? evidenceList : [];
          const readyCount = allItems.filter(e => e.status === 'UNMATCHED' || e.status === 'MATCHED').length;
          const reviewCount = allItems.filter(e => e.status === 'REVIEW_REQUIRED').length;
          const rejectedCount = allItems.filter(e => e.status === 'REJECTED').length;

          return (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid #E5E7EB', paddingBottom: '10px' }}>
              <button
                onClick={() => setEvidenceFilter('ALL')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: evidenceFilter === 'ALL' ? '#374151' : '#F3F4F6',
                  color: evidenceFilter === 'ALL' ? '#FFF' : '#4B5563'
                }}
              >
                All ({allItems.length})
              </button>
              <button
                onClick={() => setEvidenceFilter('READY')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: evidenceFilter === 'READY' ? '#047857' : '#DEF7EC',
                  color: evidenceFilter === 'READY' ? '#FFF' : '#03543F'
                }}
              >
                Ready for Matching ({readyCount})
              </button>
              <button
                onClick={() => setEvidenceFilter('REVIEW')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: evidenceFilter === 'REVIEW' ? '#B45309' : '#FEF3C7',
                  color: evidenceFilter === 'REVIEW' ? '#FFF' : '#92400E'
                }}
              >
                Review Required ({reviewCount})
              </button>
              <button
                onClick={() => setEvidenceFilter('REJECTED')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: evidenceFilter === 'REJECTED' ? '#B91C1C' : '#FEE2E2',
                  color: evidenceFilter === 'REJECTED' ? '#FFF' : '#991B1B'
                }}
              >
                Rejected & Debits ({rejectedCount})
              </button>
            </div>
          );
        })()}

        {(() => {
          const rawItems = Array.isArray(evidenceList) ? evidenceList : [];
          const evidenceItems = rawItems.filter(item => {
            if (evidenceFilter === 'READY') return item.status === 'UNMATCHED' || item.status === 'MATCHED';
            if (evidenceFilter === 'REVIEW') return item.status === 'REVIEW_REQUIRED';
            if (evidenceFilter === 'REJECTED') return item.status === 'REJECTED';
            return true;
          });

          if (evidenceItems.length === 0) {
            return (
              <div style={{ padding: '30px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                {rawItems.length === 0
                  ? 'No evidence records ingested yet. Connect Gmail and click "Sync Now" to ingest credit notification alerts.'
                  : 'No evidence matches the selected filter.'}
              </div>
            );
          }
          return (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E5E7EB', color: '#4B5563' }}>
                    <th style={{ padding: '10px 8px' }}>Amount</th>
                    <th style={{ padding: '10px 8px' }}>Type</th>
                    <th style={{ padding: '10px 8px' }}>UTR / Reference</th>
                    <th style={{ padding: '10px 8px' }}>Account</th>
                    <th style={{ padding: '10px 8px' }}>Provider / Sender</th>
                    <th style={{ padding: '10px 8px' }}>Template</th>
                    <th style={{ padding: '10px 8px' }}>Received</th>
                    <th style={{ padding: '10px 8px' }}>Status</th>
                    <th style={{ padding: '10px 8px' }}>Template Action</th>
                  </tr>
                </thead>
                <tbody>
                  {evidenceItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 700 }}>₹{item.amountRupees}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: item.transactionType === 'CREDIT' ? '#DEF7EC' : '#FDE8E8',
                            color: item.transactionType === 'CREDIT' ? '#03543F' : '#9B1C1C'
                          }}
                        >
                          {item.transactionType}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', fontFamily: 'monospace' }}>
                        {item.utr || <span style={{ color: '#9CA3AF' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#4B5563' }}>
                        {item.accountIdentifier || <span style={{ color: '#9CA3AF' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#374151' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: item.channel === 'ANDROID' || item.provider === 'ANDROID_COMPANION' ? '#DEF7EC' : '#EFF6FF',
                              color: item.channel === 'ANDROID' || item.provider === 'ANDROID_COMPANION' ? '#03543F' : '#1E40AF'
                            }}
                          >
                            {item.metadata?.appName ? `📱 ${item.metadata.appName}` : (item.channel === 'ANDROID' || item.provider === 'ANDROID_COMPANION' ? '📱 Android' : '✉ Gmail')}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px', wordBreak: 'break-all' }}>
                          {item.metadata?.notificationTitle ? `${item.metadata.notificationTitle} · ${item.senderOrPackage}` : item.senderOrPackage}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        {item.templateId ? (
                          <span style={{ fontSize: '11px', background: '#E0E7FF', color: '#3730A3', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            v{item.templateVersion || 1} Approved
                          </span>
                        ) : item.status === 'REVIEW_REQUIRED' ? (
                          <span style={{ fontSize: '11px', background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            Template Needed
                          </span>
                        ) : (
                          <span style={{ color: '#9CA3AF', fontSize: '12px' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#6B7280' }}>
                        {new Date(item.transactionTimestamp || item.receivedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background:
                              item.status === 'MATCHED'
                                ? '#DEF7EC'
                                : item.status === 'UNMATCHED'
                                ? '#E0F2FE'
                                : item.status === 'REVIEW_REQUIRED'
                                ? '#FEF3C7'
                                : '#FDE8E8',
                            color:
                              item.status === 'MATCHED'
                                ? '#03543F'
                                : item.status === 'UNMATCHED'
                                ? '#0369A1'
                                : item.status === 'REVIEW_REQUIRED'
                                ? '#92400E'
                                : '#9B1C1C'
                          }}
                        >
                          {item.status}
                        </span>
                        {item.rejectionReason && (
                          <div style={{ fontSize: '10px', color: '#DC2626', marginTop: '2px' }}>
                            {item.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        {item.status !== 'REJECTED' ? (
                          <button
                            onClick={() => {
                              setSelectedEvidenceForTemplate(item);
                              const isAndroid = item.channel === 'ANDROID';
                              setTemplateChannel(isAndroid ? 'ANDROID' : 'EMAIL');
                              if (isAndroid) {
                                const pkg = item.metadata?.packageName || item.senderOrPackage || 'com.google.android.apps.messaging';
                                const header = item.metadata?.senderHeader || item.metadata?.notificationTitle || '';
                                setTemplatePackageName(pkg);
                                setTemplateSenderHeader(header);
                                setTemplateSender(header || pkg);
                                setTemplateName(
                                  header
                                    ? `${header} SMS Template`
                                    : `${pkg.split('.').pop() || 'Android'} Notification Template`
                                );
                              } else {
                                setTemplateSender(item.senderOrPackage);
                                setTemplateName(`${item.senderOrPackage.split('@')[0]} Email Template`);
                              }
                              setTemplateBankAccountId(item.bankAccountId || '');
                              const snippet = item.metadata?.notificationText || item.metadata?.snippet || (item as any).rawText || '';
                              if (snippet) {
                                setTestSampleText(snippet);
                              } else {
                                setTestSampleText(`${item.senderOrPackage}: credited with INR ${item.amountRupees} to account ${item.accountIdentifier || 'XXXX1234'}. Ref: ${item.utr || '123456789012'}`);
                              }

                              if (isAndroid) {
                                setTemplateRegex('A/c\\s*[*]?([a-zA-Z0-9]+)\\s*Credited\\s+for\\s*(?:Rs\\.?:?|INR|₹)?\\s*([0-9,.]+)\\s*on\\s*([0-9-]{10}(?:\\s+[0-9:]{8})?)\\s*(?:by.*?)?ref\\s*(?:no)?\\s*([0-9a-zA-Z]+)');
                                setAccountExtractor('1');
                                setAmountExtractor('2');
                                setTimestampExtractor('3');
                                setUtrExtractor('4');
                                setTypeExtractor('');
                              } else {
                                const hasLabels = /Amount:|Account:|UPI Reference No:|Transaction Type:/i.test(snippet);
                                if (hasLabels) {
                                  setTemplateRegex('(?:Account[:\\s]+([a-zA-Z0-9X*]+))?[\\s\\S]*?Amount[:\\s]+(?:Rs\\.?|INR|₹)?\\s*([0-9,.]+)[\\s\\S]*?(?:UPI\\s*(?:Reference\\s*)?No|Ref|RRN)[:\\s]*([a-zA-Z0-9]+)');
                                  setAccountExtractor('1');
                                  setAmountExtractor('2');
                                  setUtrExtractor('3');
                                  setTimestampExtractor('');
                                  setTypeExtractor('');
                                } else {
                                  setTemplateRegex('(?:credited|received)\\s*(?:with|by)?\\s*(?:INR|Rs\\.?|₹)?\\s*([0-9,.]+)[\\s\\S]*?(?:UPI\\s*Ref|Ref|RRN)[:\\s]*([a-zA-Z0-9]+)');
                                  setAmountExtractor('1');
                                  setUtrExtractor('2');
                                  setAccountExtractor('');
                                  setTimestampExtractor('');
                                  setTypeExtractor('');
                                }
                              }
                              setActiveTab('templates');
                            }}
                            style={{
                              padding: '4px 8px',
                              background: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              borderRadius: '4px',
                              color: '#1D4ED8',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            + Create Template
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Excluded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
        </>
      ) : activeTab === 'analytics' ? (
        /* MERCHANT ANALYTICS & REPORTING TAB (Phase 4A) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Header Card */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#111827' }}>
                📊 Merchant Analytics & Reports
              </h2>
              <p style={{ color: '#4B5563', fontSize: '13px', margin: 0 }}>
                Real-time non-custodial UPI payment analytics, dual-source evidence verification rates, and compliance exports.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => fetchAnalytics()}
                disabled={loadingAnalytics}
                style={{
                  padding: '8px 16px',
                  background: loadingAnalytics ? '#93C5FD' : '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: loadingAnalytics ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{loadingAnalytics ? 'Refreshing...' : '🔄 Refresh Data'}</span>
              </button>
            </div>
          </div>

          {/* Non-Custodial Fintech Disclosure Banner */}
          <NonCustodialDisclosureBanner />

          {/* Filter Bar */}
          <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              {/* Timeframe selector pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#4B5563', marginRight: '6px' }}>Timeframe:</span>
                {(['today', 'yesterday', '7d', '30d', 'custom'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => {
                      setAnalyticsTimeframe(tf);
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: analyticsTimeframe === tf ? '1px solid #2563EB' : '1px solid #D1D5DB',
                      background: analyticsTimeframe === tf ? '#EFF6FF' : '#FFFFFF',
                      color: analyticsTimeframe === tf ? '#2563EB' : '#4B5563',
                      cursor: 'pointer'
                    }}
                  >
                    {tf === 'today' ? 'Today' : tf === 'yesterday' ? 'Yesterday' : tf === '7d' ? 'Last 7 Days' : tf === '30d' ? 'Last 30 Days' : 'Custom Range'}
                  </button>
                ))}
              </div>

              {/* Custom Date Pickers */}
              {analyticsTimeframe === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="date"
                    value={analyticsStartDate}
                    onChange={(e) => setAnalyticsStartDate(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                  <span style={{ fontSize: '12px', color: '#6B7280' }}>to</span>
                  <input
                    type="date"
                    value={analyticsEndDate}
                    onChange={(e) => setAnalyticsEndDate(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                </div>
              )}
            </div>

            {/* Secondary Filters: Status, Bank Account, Source */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', paddingTop: '10px', borderTop: '1px solid #F3F4F6' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>Payment Status</label>
                <select
                  value={analyticsStatus}
                  onChange={(e) => setAnalyticsStatus(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#FFFFFF' }}
                >
                  <option value="">All Statuses</option>
                  <option value="SUCCESS">SUCCESS (Dual-Source Confirmed)</option>
                  <option value="PARTIAL_SUCCESS">PARTIAL_SUCCESS (Single Evidence)</option>
                  <option value="PENDING">PENDING (Awaiting Payment)</option>
                  <option value="REVIEW_REQUIRED">REVIEW_REQUIRED (Discrepancy)</option>
                  <option value="RECONCILIATION_REQUIRED">RECONCILIATION_REQUIRED (Late/Manual)</option>
                  <option value="EXPIRED">EXPIRED (Timeout)</option>
                  <option value="CANCELLED">CANCELLED (Merchant Cancelled)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>Receiving Bank Account</label>
                <select
                  value={analyticsBankAccountId}
                  onChange={(e) => setAnalyticsBankAccountId(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#FFFFFF' }}
                >
                  <option value="">All Receiving Accounts</option>
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bankName} (***{acc.accountSuffix || 'N/A'}) {acc.isDefault ? '[Default]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>Payment Source</label>
                <select
                  value={analyticsSource}
                  onChange={(e) => setAnalyticsSource(e.target.value as 'ALL' | 'LINK' | 'DIRECT')}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '6px', background: '#FFFFFF' }}
                >
                  <option value="ALL">All Sources (Links & Direct QR)</option>
                  <option value="LINK">Payment Links Only</option>
                  <option value="DIRECT">Direct QR Requests Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {analyticsError && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', padding: '12px 16px', borderRadius: '8px', color: '#991B1B', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ {analyticsError}</span>
              <button
                onClick={() => fetchAnalytics()}
                style={{ background: '#991B1B', color: '#FFF', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
              >
                Retry
              </button>
            </div>
          )}

          {/* KPI Summary Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
            {/* Card 1: Total Payment Requests */}
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Payment Requests</span>
                <span style={{ fontSize: '18px' }}>📋</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#111827' }}>
                {analyticsSummary?.totalPaymentRequests ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                Total payment intents created
              </div>
            </div>

            {/* Card 2: Total Intent Requested */}
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E7EB', borderLeft: '4px solid #3B82F6', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment Intent Requested</span>
                <span style={{ fontSize: '18px' }}>💳</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#111827' }}>
                ₹{(analyticsSummary?.totalAmountRequestedRupees ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                Non-custodial intent volume created
              </div>
            </div>

            {/* Card 3: Dual-Source Confirmed SUCCESS */}
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E7EB', borderLeft: '4px solid #10B981', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dual-Source Verified (SUCCESS)</span>
                <span style={{ fontSize: '18px' }}>✅</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#047857' }}>
                ₹{(analyticsSummary?.successAmountRupees ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <span style={{ fontSize: '11px', background: '#D1FAE5', color: '#065F46', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                  {analyticsSummary?.successCount ?? 0} Verified
                </span>
                <span style={{ fontSize: '11px', color: '#6B7280' }}>Email + Android matched</span>
              </div>
            </div>

            {/* Card 4: Evidence Matching Rate */}
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E7EB', borderLeft: '4px solid #8B5CF6', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Evidence Matching Rate</span>
                <span style={{ fontSize: '18px' }}>🎯</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#7C3AED' }}>
                {analyticsSummary?.evidenceMatchingRate ?? 0}%
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                Dual-source confirmed / Total intents
              </div>
            </div>

            {/* Card 5: Average Evidence Matching Time */}
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Time to Verify</span>
                <span style={{ fontSize: '18px' }}>⏱️</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#111827' }}>
                {analyticsSummary?.averageEvidenceMatchingTimeSeconds
                  ? `${analyticsSummary.averageEvidenceMatchingTimeSeconds}s`
                  : 'N/A'}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                QR creation to dual-source confirmation
              </div>
            </div>

            {/* Card 6: Partial Success */}
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E7EB', borderLeft: '4px solid #F59E0B', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Single-Source Matches</span>
                <span style={{ fontSize: '18px' }}>⏳</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#B45309' }}>
                {analyticsSummary?.partialSuccessCount ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                ₹{(analyticsSummary?.partialSuccessAmountRupees ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Awaiting 2nd source)
              </div>
            </div>

            {/* Card 7: Review & Reconciliation Required */}
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E7EB', borderLeft: '4px solid #EF4444', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Review & Exception Cases</span>
                <span style={{ fontSize: '18px' }}>⚖️</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#DC2626' }}>
                {(analyticsSummary?.reviewRequiredCount ?? 0) + (analyticsSummary?.reconciliationRequiredCount ?? 0)}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                {analyticsSummary?.reviewRequiredCount ?? 0} Review / {analyticsSummary?.reconciliationRequiredCount ?? 0} Recon Required
              </div>
            </div>

            {/* Card 8: Expired & Cancelled */}
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E7EB', borderLeft: '4px solid #6B7280', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expired & Cancelled</span>
                <span style={{ fontSize: '18px' }}>⌛</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#4B5563' }}>
                {(analyticsSummary?.expiredCount ?? 0) + (analyticsSummary?.cancelledCount ?? 0)}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                {analyticsSummary?.expiredCount ?? 0} Expired / {analyticsSummary?.cancelledCount ?? 0} Cancelled
              </div>
            </div>
          </div>

          {/* Visual Charts & Trends Section */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
            {/* Chart 1: Daily Requests & Dual-Source SUCCESS Volume */}
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 2px 0', color: '#111827' }}>
                    📈 Daily Requests vs Dual-Source SUCCESS Volume
                  </h3>
                  <span style={{ fontSize: '12px', color: '#6B7280' }}>
                    Comparing intent requested volume with verified payment volume
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#3B82F6' }}>
                    <span style={{ width: '10px', height: '10px', background: '#3B82F6', borderRadius: '2px' }}></span> Intent Requested
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10B981' }}>
                    <span style={{ width: '10px', height: '10px', background: '#10B981', borderRadius: '2px' }}></span> Verified (SUCCESS)
                  </span>
                </div>
              </div>

              {/* Bar Chart Renderer */}
              {(() => {
                const items = analyticsTimeseries?.items || [];
                if (items.length === 0) {
                  return (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
                      No timeseries data available for this range
                    </div>
                  );
                }
                const maxVolume = Math.max(...items.map((i) => Math.max(i.amountRequestedRupees, i.successAmountRupees)), 100);

                return (
                  <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', minWidth: `${items.length * 52}px`, height: '180px', paddingTop: '20px', borderBottom: '1px solid #E5E7EB' }}>
                      {items.map((it) => {
                        const reqHeight = Math.max(4, Math.round((it.amountRequestedRupees / maxVolume) * 140));
                        const succHeight = Math.max(4, Math.round((it.successAmountRupees / maxVolume) * 140));
                        return (
                          <div key={it.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '140px' }}>
                              {/* Requested bar */}
                              <div
                                title={`${it.date}: ₹${it.amountRequestedRupees.toFixed(2)} (${it.paymentRequestsCount} requests)`}
                                style={{ width: '16px', height: `${reqHeight}px`, background: '#93C5FD', borderRadius: '4px 4px 0 0', transition: 'height 0.2s' }}
                              />
                              {/* Success bar */}
                              <div
                                title={`${it.date}: ₹${it.successAmountRupees.toFixed(2)} (${it.successCount} verified SUCCESS)`}
                                style={{ width: '16px', height: `${succHeight}px`, background: '#10B981', borderRadius: '4px 4px 0 0', transition: 'height 0.2s' }}
                              />
                            </div>
                            <span style={{ fontSize: '10px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                              {it.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Chart 2: Dual-Source Evidence Ingestion Trends */}
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 2px 0', color: '#111827' }}>
                    📱 Dual-Source Evidence Ingestion Activity
                  </h3>
                  <span style={{ fontSize: '12px', color: '#6B7280' }}>
                    Independent arrival trends: Bank Credit Emails vs Android Companion Notifications
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#8B5CF6' }}>
                    <span style={{ width: '10px', height: '10px', background: '#8B5CF6', borderRadius: '2px' }}></span> Email Alerts
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0D9488' }}>
                    <span style={{ width: '10px', height: '10px', background: '#0D9488', borderRadius: '2px' }}></span> Android Push
                  </span>
                </div>
              </div>

              {/* Evidence arrival bar chart */}
              {(() => {
                const items = analyticsTimeseries?.items || [];
                if (items.length === 0) {
                  return (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
                      No evidence ingestion data available
                    </div>
                  );
                }
                const maxCount = Math.max(...items.map((i) => Math.max(i.emailEvidenceCount, i.androidEvidenceCount)), 5);

                return (
                  <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', minWidth: `${items.length * 52}px`, height: '180px', paddingTop: '20px', borderBottom: '1px solid #E5E7EB' }}>
                      {items.map((it) => {
                        const emailH = Math.max(4, Math.round((it.emailEvidenceCount / maxCount) * 140));
                        const androidH = Math.max(4, Math.round((it.androidEvidenceCount / maxCount) * 140));
                        return (
                          <div key={it.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '140px' }}>
                              {/* Email bar */}
                              <div
                                title={`${it.date}: ${it.emailEvidenceCount} bank credit emails`}
                                style={{ width: '16px', height: `${emailH}px`, background: '#C4B5FD', borderRadius: '4px 4px 0 0' }}
                              />
                              {/* Android bar */}
                              <div
                                title={`${it.date}: ${it.androidEvidenceCount} Android companion push notifications`}
                                style={{ width: '16px', height: `${androidH}px`, background: '#2DD4BF', borderRadius: '4px 4px 0 0' }}
                              />
                            </div>
                            <span style={{ fontSize: '10px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                              {it.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Payment Lifecycle Status Distribution Bar */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: '#111827' }}>
              🥧 Payment Lifecycle Status Distribution
            </h3>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 14px 0' }}>
              Breakdown of all {analyticsSummary?.totalPaymentRequests ?? 0} payment requests created in this period
            </p>

            {(() => {
              const total = analyticsSummary?.totalPaymentRequests || 0;
              if (total === 0) {
                return <div style={{ fontSize: '13px', color: '#9CA3AF' }}>No payments found in this timeframe.</div>;
              }
              const successPct = (((analyticsSummary?.successCount || 0) / total) * 100).toFixed(1);
              const partialPct = (((analyticsSummary?.partialSuccessCount || 0) / total) * 100).toFixed(1);
              const pendingPct = (((analyticsSummary?.pendingCount || 0) / total) * 100).toFixed(1);
              const reviewPct = ((((analyticsSummary?.reviewRequiredCount || 0) + (analyticsSummary?.reconciliationRequiredCount || 0)) / total) * 100).toFixed(1);
              const expiredPct = ((((analyticsSummary?.expiredCount || 0) + (analyticsSummary?.cancelledCount || 0)) / total) * 100).toFixed(1);

              return (
                <div>
                  <div style={{ display: 'flex', height: '24px', borderRadius: '6px', overflow: 'hidden', marginBottom: '14px' }}>
                    <div style={{ width: `${successPct}%`, background: '#10B981' }} title={`SUCCESS: ${analyticsSummary?.successCount} (${successPct}%)`} />
                    <div style={{ width: `${partialPct}%`, background: '#F59E0B' }} title={`PARTIAL_SUCCESS: ${analyticsSummary?.partialSuccessCount} (${partialPct}%)`} />
                    <div style={{ width: `${pendingPct}%`, background: '#3B82F6' }} title={`PENDING: ${analyticsSummary?.pendingCount} (${pendingPct}%)`} />
                    <div style={{ width: `${reviewPct}%`, background: '#EF4444' }} title={`REVIEW & RECON: ${reviewPct}%`} />
                    <div style={{ width: `${expiredPct}%`, background: '#9CA3AF' }} title={`EXPIRED & CANCELLED: ${expiredPct}%`} />
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', background: '#10B981', borderRadius: '3px' }}></span>
                      <span><strong>SUCCESS:</strong> {analyticsSummary?.successCount || 0} ({successPct}%)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', background: '#F59E0B', borderRadius: '3px' }}></span>
                      <span><strong>PARTIAL_SUCCESS:</strong> {analyticsSummary?.partialSuccessCount || 0} ({partialPct}%)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', background: '#3B82F6', borderRadius: '3px' }}></span>
                      <span><strong>PENDING:</strong> {analyticsSummary?.pendingCount || 0} ({pendingPct}%)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', background: '#EF4444', borderRadius: '3px' }}></span>
                      <span><strong>REVIEW & RECON:</strong> {(analyticsSummary?.reviewRequiredCount || 0) + (analyticsSummary?.reconciliationRequiredCount || 0)} ({reviewPct}%)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', height: '12px', background: '#9CA3AF', borderRadius: '3px' }}></span>
                      <span><strong>EXPIRED/CANCELLED:</strong> {(analyticsSummary?.expiredCount || 0) + (analyticsSummary?.cancelledCount || 0)} ({expiredPct}%)</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Compliance & Export Reports Section */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0', color: '#111827' }}>
                📥 Download Compliance & Operational Reports
              </h3>
              <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
                Download sanitized CSV reports for tax, accounting, and audit compliance. Sensitive account numbers are masked and formula injection is neutralized.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              {/* Report 1: Payment Requests */}
              <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', padding: '16px', background: '#F9FAFB', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                    💳 Payment Requests Report
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 12px 0' }}>
                    All payment requests with checkout references, order IDs, amount, bank suffix, UTR, and dual-evidence status.
                  </p>
                </div>
                <button
                  onClick={() => handleExportReport('payments')}
                  disabled={exportingReportType !== null}
                  style={{
                    padding: '8px 12px',
                    background: exportingReportType === 'payments' ? '#93C5FD' : '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: exportingReportType !== null ? 'not-allowed' : 'pointer'
                  }}
                >
                  {exportingReportType === 'payments' ? 'Generating CSV...' : '⬇️ Download Payments CSV'}
                </button>
              </div>

              {/* Report 2: Payment Evidence */}
              <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', padding: '16px', background: '#F9FAFB', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                    📑 Payment Evidence Records
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 12px 0' }}>
                    All captured credit alert emails and Android companion notifications with timestamps and match status.
                  </p>
                </div>
                <button
                  onClick={() => handleExportReport('evidence')}
                  disabled={exportingReportType !== null}
                  style={{
                    padding: '8px 12px',
                    background: exportingReportType === 'evidence' ? '#93C5FD' : '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: exportingReportType !== null ? 'not-allowed' : 'pointer'
                  }}
                >
                  {exportingReportType === 'evidence' ? 'Generating CSV...' : '⬇️ Download Evidence CSV'}
                </button>
              </div>

              {/* Report 3: Reconciliation Cases */}
              <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', padding: '16px', background: '#F9FAFB', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                    ⚖️ Reconciliation & Exceptions
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 12px 0' }}>
                    Detailed export of all exception cases, mismatch reasons, investigation history, and resolutions.
                  </p>
                </div>
                <button
                  onClick={() => handleExportReport('reconciliation')}
                  disabled={exportingReportType !== null}
                  style={{
                    padding: '8px 12px',
                    background: exportingReportType === 'reconciliation' ? '#93C5FD' : '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: exportingReportType !== null ? 'not-allowed' : 'pointer'
                  }}
                >
                  {exportingReportType === 'reconciliation' ? 'Generating CSV...' : '⬇️ Download Reconciliation CSV'}
                </button>
              </div>

              {/* Report 4: Daily Aggregated Summary */}
              <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', padding: '16px', background: '#F9FAFB', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                    📅 Daily Aggregated Summary
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 12px 0' }}>
                    Daily intent volume, dual-source confirmed volume, evidence counts, and exception metrics.
                  </p>
                </div>
                <button
                  onClick={() => handleExportReport('daily_summary')}
                  disabled={exportingReportType !== null}
                  style={{
                    padding: '8px 12px',
                    background: exportingReportType === 'daily_summary' ? '#93C5FD' : '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: exportingReportType !== null ? 'not-allowed' : 'pointer'
                  }}
                >
                  {exportingReportType === 'daily_summary' ? 'Generating CSV...' : '⬇️ Download Daily Summary CSV'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'reconciliation' ? (
        /* RECONCILIATION & EXCEPTION MANAGEMENT TAB */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Card */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#111827' }}>
                ⚖️ Reconciliation & Exception Cases
              </h2>
              <p style={{ color: '#4B5563', fontSize: '13px', margin: 0 }}>
                Audit and resolve payment exceptions, late evidence, mismatched amounts, and dual-source discrepancies with immutable history.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleRunAutoReconcile}
                disabled={autoReconciling}
                style={{
                  padding: '9px 16px',
                  background: '#2563EB',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: autoReconciling ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {autoReconciling ? 'Auto-Reconciling...' : '⚡ Run Auto-Reconciliation'}
              </button>
              <button
                onClick={fetchReconciliationCases}
                disabled={loadingReconCases}
                style={{
                  padding: '9px 14px',
                  background: '#F3F4F6',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: loadingReconCases ? 'not-allowed' : 'pointer'
                }}
              >
                {loadingReconCases ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '10px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Open Cases
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#D97706', marginTop: '6px' }}>
                {reconCases.filter((c) => c.status === 'OPEN').length}
              </div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>Awaiting initial review</div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '10px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Investigating
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#2563EB', marginTop: '6px' }}>
                {reconCases.filter((c) => c.status === 'INVESTIGATING').length}
              </div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>In active investigation</div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '10px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Critical Exceptions
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#DC2626', marginTop: '6px' }}>
                {reconCases.filter((c) => c.severity === 'CRITICAL' && (c.status === 'OPEN' || c.status === 'INVESTIGATING')).length}
              </div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>Duplicate UTR / Fraud risks</div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '10px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Resolved / Dismissed
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#059669', marginTop: '6px' }}>
                {reconCases.filter((c) => c.status === 'RESOLVED' || c.status === 'DISMISSED').length}
              </div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>Completed audit decisions</div>
            </div>
          </div>

          {/* Filters & Search Bar */}
          <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '10px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Status Pills */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563', marginRight: '4px' }}>Status:</span>
              {(['ALL', 'OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setReconStatusFilter(st)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: reconStatusFilter === st ? '1px solid #2563EB' : '1px solid #E5E7EB',
                    background: reconStatusFilter === st ? '#EFF6FF' : '#F9FAFB',
                    color: reconStatusFilter === st ? '#1D4ED8' : '#4B5563'
                  }}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Filter Dropdowns & Search */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1.5fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>Severity</label>
                <select
                  value={reconSeverityFilter}
                  onChange={(e) => setReconSeverityFilter(e.target.value as any)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px' }}
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>Case Type</label>
                <select
                  value={reconTypeFilter}
                  onChange={(e) => setReconTypeFilter(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px' }}
                >
                  <option value="ALL">All Case Types</option>
                  <option value="LATE_EVIDENCE">Late Evidence (Post-Expiry)</option>
                  <option value="AMOUNT_MISMATCH">Amount Mismatch</option>
                  <option value="DUPLICATE_UTR">Duplicate UTR Reference</option>
                  <option value="MISSING_UTR">Missing UTR</option>
                  <option value="ACCOUNT_MISMATCH">Account Mismatch</option>
                  <option value="EVIDENCE_DISAGREEMENT">Evidence Disagreement</option>
                  <option value="DUPLICATE_PAYLOAD">Duplicate Raw Payload</option>
                  <option value="MISSING_SECOND_SOURCE">Missing Second Evidence Source</option>
                  <option value="CANCELLED_PAYMENT_EVIDENCE">Evidence on Cancelled Payment</option>
                  <option value="MANUAL_FLAG">Manual Merchant Flag</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>Bank Account</label>
                <select
                  value={reconBankAccountId}
                  onChange={(e) => setReconBankAccountId(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px' }}
                >
                  <option value="">All Accounts</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} (XX{b.accountSuffix})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '4px' }}>Search</label>
                <input
                  type="text"
                  placeholder="Order ID, UTR, Reason..."
                  value={reconSearch}
                  onChange={(e) => setReconSearch(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          {/* Cases Table */}
          <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                Cases List ({reconCases.length})
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                Filter: <strong>{reconStatusFilter}</strong> &bull; Severity: <strong>{reconSeverityFilter}</strong>
              </div>
            </div>

            {loadingReconCases ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                Loading reconciliation cases...
              </div>
            ) : reconCases.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: '#6B7280' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🎉</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>No exception cases found</div>
                <p style={{ fontSize: '13px', margin: '4px 0 0 0', color: '#6B7280' }}>
                  No payment reconciliation cases match the selected status or filters.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#4B5563', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '12px 14px' }}>Severity</th>
                      <th style={{ padding: '12px 14px' }}>Status</th>
                      <th style={{ padding: '12px 14px' }}>Case Type & Reason</th>
                      <th style={{ padding: '12px 14px' }}>Order / Checkout Ref</th>
                      <th style={{ padding: '12px 14px' }}>Expected / Received</th>
                      <th style={{ padding: '12px 14px' }}>UTR / Bank Account</th>
                      <th style={{ padding: '12px 14px' }}>Dual-Source</th>
                      <th style={{ padding: '12px 14px' }}>Created</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconCases.map((c) => {
                      const cid = c.id || (c as any)._id;
                      const hasAmtMismatch = c.expectedAmountPaise && c.receivedAmountPaise && c.expectedAmountPaise !== c.receivedAmountPaise;

                      return (
                        <tr key={cid} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '12px 14px' }}>
                            <ReconSeverityBadge severity={c.severity} />
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <ReconStatusBadge status={c.status} />
                          </td>
                          <td style={{ padding: '12px 14px', maxWidth: '240px' }}>
                            <div style={{ fontWeight: 700, color: '#111827', fontSize: '12px' }}>
                              {c.caseType.replace(/_/g, ' ')}
                            </div>
                            <div style={{ color: '#4B5563', fontSize: '11px', marginTop: '2px', wordBreak: 'break-word' }}>
                              {c.reason}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: '#111827' }}>
                              {c.orderId ? `Order: ${c.orderId}` : '—'}
                            </div>
                            <div style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace' }}>
                              {c.checkoutReference ? `Ref: ${c.checkoutReference}` : '—'}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ color: '#4B5563', fontSize: '12px' }}>
                              Exp: <strong>₹{((c.expectedAmountPaise || 0) / 100).toFixed(2)}</strong>
                            </div>
                            <div style={{ color: hasAmtMismatch ? '#DC2626' : '#166534', fontSize: '12px', fontWeight: hasAmtMismatch ? 700 : 500 }}>
                              Recv: ₹{((c.receivedAmountPaise || 0) / 100).toFixed(2)}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontFamily: 'monospace', fontWeight: 600, color: c.utr ? '#111827' : '#9CA3AF' }}>
                              {c.utr || 'Awaiting UTR'}
                            </div>
                            <div style={{ color: '#6B7280', fontSize: '11px' }}>
                              {c.accountSuffix ? `A/c: XX${c.accountSuffix}` : '—'}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' }}>
                              <span style={{ color: c.hasEmailEvidence ? '#047857' : '#9CA3AF', fontWeight: 600 }}>
                                {c.hasEmailEvidence ? '✓ ✉ Email' : '○ ✉ Email'}
                              </span>
                              <span style={{ color: c.hasAndroidEvidence ? '#047857' : '#9CA3AF', fontWeight: 600 }}>
                                {c.hasAndroidEvidence ? '✓ 📱 Android' : '○ 📱 Android'}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: '#6B7280', fontSize: '11px' }}>
                            {new Date(c.createdAt).toLocaleDateString()}<br />
                            {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => {
                                setSelectedCase(c);
                                setCaseResolutionNotes('');
                                setCaseAction('CONFIRM_PAYMENT');
                              }}
                              style={{
                                padding: '6px 12px',
                                background: '#2563EB',
                                color: '#FFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Inspect / Resolve
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'bank-accounts' ? (
        /* BANK ACCOUNTS TAB */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
          {/* Left Column: Add Bank Account Form */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 4px 0' }}>Add Collection Bank Account</h2>
            <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 16px 0' }}>
              Configure collection accounts to receive customer UPI payments and match evidence.
            </p>

            <form onSubmit={handleCreateBankAccount} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Bank Name</label>
                <input
                  type="text"
                  required
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  placeholder="e.g. Union Bank of India, HDFC Bank, ICICI Bank"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Account UPI ID (VPA)</label>
                <input
                  type="text"
                  required
                  value={newBankUpiId}
                  onChange={(e) => setNewBankUpiId(e.target.value)}
                  placeholder="e.g. merchant@unionbank or store@okaxis"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Account Number Suffix / Mask (e.g. 0562 or XX0562)</label>
                <input
                  type="text"
                  required
                  value={newBankAccountSuffix}
                  onChange={(e) => setNewBankAccountSuffix(e.target.value)}
                  placeholder="e.g. XX0562 or 0562"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: '11px', color: '#6B7280' }}>
                  Matches bank credit alerts without storing plain full account numbers.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Branch / Notes (Optional)</label>
                <input
                  type="text"
                  value={newBankNotes}
                  onChange={(e) => setNewBankNotes(e.target.value)}
                  placeholder="e.g. Primary settlement account"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <button
                type="submit"
                disabled={creatingBankAccount}
                style={{ marginTop: '6px', padding: '10px', background: '#2563EB', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 700, cursor: creatingBankAccount ? 'not-allowed' : 'pointer' }}
              >
                {creatingBankAccount ? 'Saving...' : '+ Add Bank Account'}
              </button>
            </form>
          </div>

          {/* Right Column: Bank Accounts List */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Configured Collection Accounts</h2>
                <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>
                  Accounts isolated for payment generation and dual-source evidence matching
                </p>
              </div>
              <button
                onClick={fetchBankAccounts}
                disabled={loadingBankAccounts}
                style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                {loadingBankAccounts ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {bankAccounts.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                No dedicated collection bank accounts added yet. Payments currently default to your profile UPI ID ({profile?.upiConfig?.vpa || 'Default'}).
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {bankAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    style={{
                      border: `1px solid ${acc.isActive ? '#BFDBFE' : '#E5E7EB'}`,
                      background: acc.isActive ? '#F8FAFC' : '#F9FAFB',
                      borderRadius: '8px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{acc.bankName}</span>
                          <span style={{ fontSize: '11px', background: '#E0E7FF', color: '#3730A3', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            XX{acc.accountSuffix}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
                          UPI VPA: {acc.upiId}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          background: acc.isActive ? '#DEF7EC' : '#F3F4F6',
                          color: acc.isActive ? '#03543F' : '#6B7280',
                          border: `1px solid ${acc.isActive ? '#31C48D' : '#D1D5DB'}`
                        }}
                      >
                        {acc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {acc.notes && (
                      <div style={{ fontSize: '12px', color: '#4B5563', marginBottom: '10px' }}>
                        {acc.notes}
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                        <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>
                          ✉ Email Alerts
                        </span>
                        <span style={{ background: '#F0FDF4', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>
                          📱 Companion Push
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setTemplateBankAccountId(acc.id);
                            setTemplateSender(acc.bankName.toLowerCase().replace(/[^a-z0-9]/g, ''));
                            setTemplateName(`${acc.bankName} Credit Template`);
                            setActiveTab('templates');
                          }}
                          style={{ padding: '5px 10px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          + Template
                        </button>
                        <button
                          onClick={() => handleToggleBankAccount(acc.id)}
                          style={{
                            padding: '5px 10px',
                            background: acc.isActive ? '#FEF2F2' : '#F0FDF4',
                            color: acc.isActive ? '#DC2626' : '#166534',
                            border: `1px solid ${acc.isActive ? '#FECACA' : '#BBF7D0'}`,
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {acc.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'templates' ? (
        /* TEMPLATES TAB */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Left Column: Template Builder & Tester */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 4px 0' }}>Merchant Template Builder</h2>
            <p style={{ color: '#6B7280', fontSize: '13px', margin: '0 0 16px 0' }}>
              Configure custom bank notification patterns to parse alerts accurately.
            </p>

            {selectedEvidenceForTemplate && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px', fontSize: '12px', color: '#166534' }}>
                Prefilled from evidence: <strong>{selectedEvidenceForTemplate.senderOrPackage}</strong> (₹{selectedEvidenceForTemplate.amountRupees})
              </div>
            )}

            <form onSubmit={handleCreateTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '6px' }}>Evidence Channel</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateChannel('ANDROID');
                      setTemplatePackageName('com.google.android.apps.messaging');
                      setTemplateSenderHeader('VM-UNIONB');
                      setTemplateSender('VM-UNIONB');
                      setTemplateName('Union Bank Android SMS Template');
                      setTemplateRegex('A/c\\s*[*]?([a-zA-Z0-9]+)\\s*Credited\\s+for\\s*(?:Rs\\.?:?|INR|₹)?\\s*([0-9,.]+)\\s*on\\s*([0-9-]{10}(?:\\s+[0-9:]{8})?)\\s*(?:by.*?)?ref\\s*(?:no)?\\s*([0-9a-zA-Z]+)');
                      setAccountExtractor('1');
                      setAmountExtractor('2');
                      setTimestampExtractor('3');
                      setUtrExtractor('4');
                      setTypeExtractor('');
                      if (!testSampleText) {
                        setTestSampleText('A/c *0562 Credited for Rs:1.71 on 19-11-2026 21:39:04 by Mob Bk ref no 632351257748 Avl Bal Rs:531.30.Never Share OTP/PIN/CVV-Union Bank of India');
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: templateChannel === 'ANDROID' ? '2px solid #2563EB' : '1px solid #D1D5DB',
                      background: templateChannel === 'ANDROID' ? '#EFF6FF' : '#FFFFFF',
                      color: templateChannel === 'ANDROID' ? '#1D4ED8' : '#374151',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    📱 Android Notification
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateChannel('EMAIL');
                      setTemplateSender('alerts@unionbankofindia.bank');
                      setTemplateName('Union Bank Email Template');
                      setTemplateRegex('(?:Account[:\\s]+([a-zA-Z0-9X*]+))?[\\s\\S]*?Amount[:\\s]+(?:Rs\\.?|INR|₹)?\\s*([0-9,.]+)[\\s\\S]*?(?:UPI\\s*(?:Reference\\s*)?No|Ref|RRN)[:\\s]*([a-zA-Z0-9]+)');
                      setAccountExtractor('1');
                      setAmountExtractor('2');
                      setUtrExtractor('3');
                      setTimestampExtractor('');
                      setTypeExtractor('');
                      setTestSampleText('From: alerts@unionbankofindia.bank\nSubject: Credit Alert - Account XX0562\nAccount: XX0562\nAmount: Rs. 1.00\nUPI Reference No: 123456789012');
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: templateChannel === 'EMAIL' ? '2px solid #2563EB' : '1px solid #D1D5DB',
                      background: templateChannel === 'EMAIL' ? '#EFF6FF' : '#FFFFFF',
                      color: templateChannel === 'EMAIL' ? '#1D4ED8' : '#374151',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    📧 Bank Credit Email
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Template Name</label>
                <input
                  type="text"
                  required
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Union Bank Android SMS Template"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Associated Bank Account (Optional)</label>
                <select
                  value={templateBankAccountId}
                  onChange={(e) => setTemplateBankAccountId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="">General Pattern (All Accounts)</option>
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bankName} (XX{acc.accountSuffix}) &bull; {acc.upiId}
                    </option>
                  ))}
                </select>
              </div>

              {templateChannel === 'ANDROID' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>
                      Android Package Name (* for all)
                    </label>
                    <input
                      type="text"
                      required
                      value={templatePackageName}
                      onChange={(e) => setTemplatePackageName(e.target.value)}
                      placeholder="e.g. com.google.android.apps.messaging, com.infrasofttech.uboi, or *"
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>
                      SMS Sender Header / Title (* for all)
                    </label>
                    <input
                      type="text"
                      value={templateSenderHeader}
                      onChange={(e) => setTemplateSenderHeader(e.target.value)}
                      placeholder="e.g. VM-UNIONB, Union Bank, or *"
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>
                    Bank Sender Email / Domain
                  </label>
                  <input
                    type="text"
                    required
                    value={templateSender}
                    onChange={(e) => setTemplateSender(e.target.value)}
                    placeholder="e.g. alerts@hdfcbank.net or unionbankofindia.bank"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563' }}>Regex Pattern (supports multiline dotAll)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setTemplatePackageName('com.google.android.apps.messaging');
                        setTemplateSenderHeader('VM-UNIONB');
                        setTemplateSender('VM-UNIONB');
                        setTemplateRegex('A/c\\s*[*]?([a-zA-Z0-9]+)\\s*Credited\\s+for\\s*(?:Rs\\.?:?|INR|₹)?\\s*([0-9,.]+)\\s*on\\s*([0-9-]{10}(?:\\s+[0-9:]{8})?)\\s*(?:by.*?)?ref\\s*(?:no)?\\s*([0-9a-zA-Z]+)');
                        setAccountExtractor('1');
                        setAmountExtractor('2');
                        setTimestampExtractor('3');
                        setUtrExtractor('4');
                        setTypeExtractor('');
                        if (!testSampleText) {
                          setTestSampleText('A/c *0562 Credited for Rs:1.71 on 19-11-2026 21:39:04 by Mob Bk ref no 632351257748 Avl Bal Rs:531.30.Never Share OTP/PIN/CVV-Union Bank of India');
                        }
                      }}
                      style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      ⚡ Union Bank SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateRegex('(?:Account[:\\s]+([a-zA-Z0-9X*]+))?[\\s\\S]*?Amount[:\\s]+(?:Rs\\.?|INR|₹)?\\s*([0-9,.]+)[\\s\\S]*?(?:UPI\\s*(?:Reference\\s*)?No|Ref|RRN)[:\\s]*([a-zA-Z0-9]+)');
                        setAccountExtractor('1');
                        setAmountExtractor('2');
                        setUtrExtractor('3');
                        setTimestampExtractor('');
                        setTypeExtractor('');
                      }}
                      style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      ⚡ Union Bank Email
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  required
                  value={templateRegex}
                  onChange={(e) => setTemplateRegex(e.target.value)}
                  placeholder="e.g. A\/c.*Credited for Rs:([0-9,.]+)"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Amount (Mandatory)</label>
                  <input
                    type="text"
                    required
                    value={amountExtractor}
                    onChange={(e) => setAmountExtractor(e.target.value)}
                    placeholder="2"
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>UTR / Ref</label>
                  <input
                    type="text"
                    value={utrExtractor}
                    onChange={(e) => setUtrExtractor(e.target.value)}
                    placeholder="4"
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Account Suffix</label>
                  <input
                    type="text"
                    value={accountExtractor}
                    onChange={(e) => setAccountExtractor(e.target.value)}
                    placeholder="1"
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4B5563', marginBottom: '4px' }}>Timestamp</label>
                  <input
                    type="text"
                    value={timestampExtractor}
                    onChange={(e) => setTimestampExtractor(e.target.value)}
                    placeholder="3"
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Safe Regex Testing Box */}
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>
                    Test Pattern Against Actual {templateChannel === 'ANDROID' ? 'Android Notification' : 'Email'}
                  </span>
                  <button
                    type="button"
                    onClick={handleTestRegex}
                    disabled={testingRegex}
                    style={{ padding: '4px 10px', background: '#3B82F6', color: '#FFF', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: testingRegex ? 'not-allowed' : 'pointer' }}
                  >
                    {testingRegex ? 'Testing...' : '▶ Test Regex'}
                  </button>
                </div>

                <textarea
                  rows={3}
                  value={testSampleText}
                  onChange={(e) => setTestSampleText(e.target.value)}
                  placeholder={templateChannel === 'ANDROID' ? 'Paste actual Android notification text here...' : 'Paste raw email snippet text here...'}
                  style={{ width: '100%', padding: '8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />

                {regexTestResult && (
                  <div style={{ marginTop: '10px', padding: '10px', borderRadius: '6px', background: regexTestResult.matched ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${regexTestResult.matched ? '#BBF7D0' : '#FECACA'}` }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: regexTestResult.matched ? '#166534' : '#991B1B' }}>
                      {regexTestResult.matched ? '✓ Pattern Matched Successfully!' : '✗ No Match'}
                    </div>
                    {regexTestResult.matched && regexTestResult.extracted && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#374151', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <div><strong>Amount:</strong> ₹{regexTestResult.extracted.amountRupees || 'None'} ({regexTestResult.extracted.amountPaise || 0} paise)</div>
                        <div><strong>UTR:</strong> {regexTestResult.extracted.utr || 'None'}</div>
                        <div><strong>Account:</strong> {regexTestResult.extracted.accountIdentifier || 'None'}</div>
                        <div><strong>Type:</strong> {regexTestResult.extracted.transactionType || 'CREDIT'}</div>
                        {regexTestResult.extracted.transactionTimestamp && (
                          <div style={{ gridColumn: 'span 2' }}>
                            <strong>Timestamp:</strong> {new Date(regexTestResult.extracted.transactionTimestamp).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submittingTemplate}
                style={{ padding: '10px', background: '#059669', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: submittingTemplate ? 'not-allowed' : 'pointer' }}
              >
                {submittingTemplate ? 'Submitting...' : '✓ Submit Template for Approval'}
              </button>
            </form>
          </div>

          {/* Right Column: Existing Templates Table */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Configured Templates</h2>
                <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>Approved templates parse incoming alerts into trusted evidence</p>
              </div>
              <button
                onClick={fetchTemplates}
                disabled={loadingTemplates}
                style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                {loadingTemplates ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {/* Filter Pills: Channels & Statuses */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563', marginRight: '4px' }}>Channel:</span>
                {(['ALL', 'ANDROID', 'EMAIL'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setTemplateFilterChannel(ch)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: templateFilterChannel === ch ? '1px solid #2563EB' : '1px solid #E5E7EB',
                      background: templateFilterChannel === ch ? '#EFF6FF' : '#F9FAFB',
                      color: templateFilterChannel === ch ? '#1D4ED8' : '#4B5563'
                    }}
                  >
                    {ch === 'ALL' && `All Channels (${templates.filter((t) => t.status !== 'ARCHIVED').length})`}
                    {ch === 'ANDROID' && `📱 Android (${templates.filter((t) => t.channel === 'ANDROID' && t.status !== 'ARCHIVED').length})`}
                    {ch === 'EMAIL' && `📧 Email (${templates.filter((t) => t.channel === 'EMAIL' && t.status !== 'ARCHIVED').length})`}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563', marginRight: '4px' }}>Status:</span>
                {(['ALL', 'ACTIVE', 'DISABLED', 'PENDING_APPROVAL', 'ARCHIVED'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTemplateFilterStatus(st)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '14px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: templateFilterStatus === st ? '1px solid #059669' : '1px solid #E5E7EB',
                      background: templateFilterStatus === st ? '#ECFDF5' : '#F9FAFB',
                      color: templateFilterStatus === st ? '#065F46' : '#4B5563'
                    }}
                  >
                    {st === 'ALL' && 'All Active/Disabled'}
                    {st === 'ACTIVE' && `🟢 Active (${templates.filter((t) => t.status === 'APPROVED' && t.isActive !== false).length})`}
                    {st === 'DISABLED' && `⚪ Disabled (${templates.filter((t) => t.status === 'DISABLED').length})`}
                    {st === 'PENDING_APPROVAL' && `🟡 Pending (${templates.filter((t) => t.status === 'PENDING_APPROVAL' || t.status === 'DISCOVERED').length})`}
                    {st === 'ARCHIVED' && `📦 Archived (${templates.filter((t) => t.status === 'ARCHIVED' || t.isArchived).length})`}
                  </button>
                ))}
              </div>
            </div>

            {templates.filter((t) => {
              if (templateFilterChannel !== 'ALL' && t.channel !== templateFilterChannel) return false;
              if (templateFilterStatus === 'ALL') return t.status !== 'ARCHIVED' && !t.isArchived;
              if (templateFilterStatus === 'ACTIVE') return t.status === 'APPROVED' && t.isActive !== false;
              if (templateFilterStatus === 'DISABLED') return t.status === 'DISABLED';
              if (templateFilterStatus === 'PENDING_APPROVAL') return t.status === 'PENDING_APPROVAL' || t.status === 'DISCOVERED';
              if (templateFilterStatus === 'ARCHIVED') return t.status === 'ARCHIVED' || t.isArchived;
              return true;
            }).length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                No templates matching the selected filter criteria.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {templates
                  .filter((t) => {
                    if (templateFilterChannel !== 'ALL' && t.channel !== templateFilterChannel) return false;
                    if (templateFilterStatus === 'ALL') return t.status !== 'ARCHIVED' && !t.isArchived;
                    if (templateFilterStatus === 'ACTIVE') return t.status === 'APPROVED' && t.isActive !== false;
                    if (templateFilterStatus === 'DISABLED') return t.status === 'DISABLED';
                    if (templateFilterStatus === 'PENDING_APPROVAL') return t.status === 'PENDING_APPROVAL' || t.status === 'DISCOVERED';
                    if (templateFilterStatus === 'ARCHIVED') return t.status === 'ARCHIVED' || t.isArchived;
                    return true;
                  })
                  .map((tmpl) => {
                    const matchedBank = bankAccounts.find(
                      (b) => (b.id || (b as any)._id)?.toString() === (tmpl.bankAccountId || '')?.toString()
                    );
                    const isApprovedActive = tmpl.status === 'APPROVED' && tmpl.isActive !== false;
                    const wasPreviouslyApproved = Boolean(
                      tmpl.approvedAt || (tmpl.history || []).some((h: any) => h.status === 'APPROVED')
                    );

                    return (
                      <div key={tmpl.id || (tmpl as any)._id} style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '14px', background: tmpl.status === 'ARCHIVED' ? '#F3F4F6' : '#FAFAFA' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{tmpl.name}</span>
                            <span style={{ fontSize: '11px', background: '#E5E7EB', color: '#374151', padding: '2px 6px', borderRadius: '4px' }}>
                              v{tmpl.version}
                            </span>
                            <span style={{ fontSize: '11px', background: tmpl.channel === 'ANDROID' ? '#E0F2FE' : '#F3E8FF', color: tmpl.channel === 'ANDROID' ? '#0369A1' : '#7E22CE', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              {tmpl.channel}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '12px',
                                background:
                                  tmpl.status === 'APPROVED'
                                    ? isApprovedActive ? '#DEF7EC' : '#FEE2E2'
                                    : tmpl.status === 'PENDING_APPROVAL'
                                    ? '#FEF3C7'
                                    : tmpl.status === 'DISCOVERED'
                                    ? '#E0E7FF'
                                    : tmpl.status === 'ARCHIVED'
                                    ? '#E5E7EB'
                                    : '#F3F4F6',
                                color:
                                  tmpl.status === 'APPROVED'
                                    ? isApprovedActive ? '#03543F' : '#991B1B'
                                    : tmpl.status === 'PENDING_APPROVAL'
                                    ? '#92400E'
                                    : tmpl.status === 'DISCOVERED'
                                    ? '#3730A3'
                                    : tmpl.status === 'ARCHIVED'
                                    ? '#4B5563'
                                    : '#6B7280'
                              }}
                            >
                              {tmpl.status === 'APPROVED' ? (isApprovedActive ? 'APPROVED (ACTIVE)' : 'APPROVED (DISABLED)') : tmpl.status}
                            </span>
                          </div>
                        </div>

                        <div style={{ fontSize: '12px', color: '#4B5563', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>Sender: <strong>{tmpl.senderIdentifier}</strong></span>
                          {matchedBank ? (
                            <span style={{ background: '#DBEAFE', color: '#1E40AF', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                              🏦 {matchedBank.bankName} (XX{matchedBank.accountSuffix})
                            </span>
                          ) : tmpl.bankAccountId ? (
                            <span style={{ background: '#DBEAFE', color: '#1E40AF', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                              🏦 Account-Specific
                            </span>
                          ) : (
                            <span style={{ background: '#F3F4F6', color: '#4B5563', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>
                              All Accounts
                            </span>
                          )}
                        </div>

                        <div style={{ background: '#FFFFFF', padding: '8px', borderRadius: '4px', border: '1px solid #E5E7EB', fontFamily: 'monospace', fontSize: '11px', color: '#1F2937', marginBottom: '10px', wordBreak: 'break-all' }}>
                          {tmpl.regexPattern}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ fontSize: '11px', color: '#6B7280' }}>
                            Created: {new Date(tmpl.createdAt).toLocaleDateString()} &bull; Updated: {tmpl.updatedAt ? new Date(tmpl.updatedAt).toLocaleDateString() : 'N/A'}
                          </div>

                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {/* View Details */}
                            <button
                              onClick={() => setViewingTemplate(tmpl)}
                              style={{ padding: '4px 8px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              👁️ View
                            </button>

                            {/* Test Regex */}
                            <button
                              onClick={() => {
                                setTemplateRegex(tmpl.regexPattern);
                                if (tmpl.samplePayload) setTestSampleText(tmpl.samplePayload);
                                showFeedback('success', 'Template pattern loaded into test form on the left.');
                              }}
                              style={{ padding: '4px 8px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              🧪 Test
                            </button>

                            {/* Approve (for pending/discovered) */}
                            {(tmpl.status === 'PENDING_APPROVAL' || tmpl.status === 'DISCOVERED') && (
                              <button
                                onClick={() => {
                                  const tid = tmpl.id || (tmpl as any)._id || '';
                                  handleApproveTemplate(tid, tmpl.version);
                                }}
                                style={{ padding: '4px 10px', background: '#059669', color: '#FFF', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                              >
                                ✓ Approve v{tmpl.version}
                              </button>
                            )}

                            {/* Disable (for active approved templates) */}
                            {isApprovedActive && (
                              <button
                                onClick={() => {
                                  const tid = tmpl.id || (tmpl as any)._id || '';
                                  handleDisableTemplate(tid);
                                }}
                                style={{ padding: '4px 8px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Disable
                              </button>
                            )}

                            {/* Reactivate (for disabled previously approved templates) */}
                            {tmpl.status === 'DISABLED' && wasPreviouslyApproved && (
                              <button
                                onClick={() => {
                                  const tid = tmpl.id || (tmpl as any)._id || '';
                                  handleReactivateTemplate(tid, false);
                                }}
                                style={{ padding: '4px 8px', background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                              >
                                ↻ Reactivate
                              </button>
                            )}

                            {/* Edit as New Version */}
                            {tmpl.status !== 'ARCHIVED' && (
                              <button
                                onClick={() => {
                                  setEditingVersionTemplate(tmpl);
                                  setNewVersionRegex(tmpl.regexPattern);
                                  setNewVersionReason(`Upgraded from v${tmpl.version}`);
                                }}
                                style={{ padding: '4px 8px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                ＋ New Version
                              </button>
                            )}

                            {/* Version History */}
                            <button
                              onClick={() => handleFetchVersionHistory(tmpl)}
                              style={{ padding: '4px 8px', background: '#F9FAFB', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              📜 History
                            </button>

                            {/* Archive */}
                            {tmpl.status !== 'ARCHIVED' && (
                              <button
                                onClick={() => {
                                  const tid = tmpl.id || (tmpl as any)._id || '';
                                  handleArchiveTemplate(tid);
                                }}
                                style={{ padding: '4px 8px', background: '#F3F4F6', color: '#4B5563', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                              >
                                📦 Archive
                              </button>
                            )}

                            {/* Restore */}
                            {tmpl.status === 'ARCHIVED' && (
                              <button
                                onClick={() => {
                                  const tid = tmpl.id || (tmpl as any)._id || '';
                                  handleRestoreTemplate(tid);
                                }}
                                style={{ padding: '4px 8px', background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                              >
                                ♻️ Restore
                              </button>
                            )}

                            {/* Delete */}
                            <button
                              onClick={() => {
                                const tid = tmpl.id || (tmpl as any)._id || '';
                                handleDeleteTemplate(tid);
                              }}
                              style={{ padding: '4px 8px', background: '#FFF1F2', color: '#E11D48', border: '1px solid #FECDD3', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* MODAL 1: VIEW TEMPLATE DETAILS */}
            {viewingTemplate && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
                <div style={{ background: '#FFF', borderRadius: '12px', padding: '24px', maxWidth: '600px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Template Details: {viewingTemplate.name}</h3>
                    <button onClick={() => setViewingTemplate(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6B7280' }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#374151' }}>
                    <div><strong>ID:</strong> <code style={{ fontSize: '12px', background: '#F3F4F6', padding: '2px 4px', borderRadius: '4px' }}>{viewingTemplate.id || (viewingTemplate as any)._id}</code></div>
                    <div><strong>Channel:</strong> {viewingTemplate.channel}</div>
                    <div><strong>Sender:</strong> {viewingTemplate.senderIdentifier}</div>
                    <div><strong>Version:</strong> v{viewingTemplate.version}</div>
                    <div><strong>Status:</strong> {viewingTemplate.status} {viewingTemplate.isActive ? '(Active)' : '(Inactive)'}</div>
                    <div><strong>Immutable:</strong> {viewingTemplate.isImmutable ? 'Yes (Locked)' : 'No (Draft)'}</div>
                    <div><strong>Created At:</strong> {new Date(viewingTemplate.createdAt).toLocaleString()}</div>
                    {viewingTemplate.approvedAt && <div><strong>Approved At:</strong> {new Date(viewingTemplate.approvedAt).toLocaleString()}</div>}
                    <div>
                      <strong>Regex Pattern:</strong>
                      <pre style={{ background: '#F3F4F6', padding: '8px', borderRadius: '6px', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{viewingTemplate.regexPattern}</pre>
                    </div>
                    <div>
                      <strong>Field Extractors:</strong>
                      <pre style={{ background: '#F3F4F6', padding: '8px', borderRadius: '6px', fontSize: '11px' }}>{JSON.stringify(viewingTemplate.fieldsMap, null, 2)}</pre>
                    </div>
                    {viewingTemplate.samplePayload && (
                      <div>
                        <strong>Sample Payload:</strong>
                        <pre style={{ background: '#F3F4F6', padding: '8px', borderRadius: '6px', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{viewingTemplate.samplePayload}</pre>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: '20px', textAlign: 'right' }}>
                    <button onClick={() => setViewingTemplate(null)} style={{ padding: '6px 14px', background: '#2563EB', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Close</button>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL 2: VERSION HISTORY */}
            {historyTemplate && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
                <div style={{ background: '#FFF', borderRadius: '12px', padding: '24px', maxWidth: '680px', width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Version History: {historyTemplate.name}</h3>
                    <button onClick={() => setHistoryTemplate(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6B7280' }}>✕</button>
                  </div>
                  {loadingHistory ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>Loading history entries...</div>
                  ) : templateHistoryList.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>No previous versions recorded.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {templateHistoryList.map((entry: any, i: number) => (
                        <div key={i} style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', background: entry.version === historyTemplate.version ? '#EFF6FF' : '#F9FAFB' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>
                              Version {entry.version} {entry.version === historyTemplate.version && '(Current Version)'}
                            </span>
                            <span style={{ fontSize: '11px', background: entry.status === 'APPROVED' ? '#DEF7EC' : '#F3F4F6', color: entry.status === 'APPROVED' ? '#03543F' : '#4B5563', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              {entry.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#4B5563', marginBottom: '6px' }}>
                            {entry.changeReason || 'No change notes provided'} &bull; <span style={{ color: '#6B7280' }}>{new Date(entry.createdAt).toLocaleString()}</span>
                          </div>
                          <div style={{ background: '#FFF', padding: '6px', borderRadius: '4px', border: '1px solid #E5E7EB', fontFamily: 'monospace', fontSize: '10px', wordBreak: 'break-all' }}>
                            {entry.regexPattern}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: '20px', textAlign: 'right' }}>
                    <button onClick={() => setHistoryTemplate(null)} style={{ padding: '6px 14px', background: '#2563EB', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Close</button>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL 3: EDIT AS NEW VERSION */}
            {editingVersionTemplate && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
                <div style={{ background: '#FFF', borderRadius: '12px', padding: '24px', maxWidth: '580px', width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                      Create New Version (v{editingVersionTemplate.version + 1})
                    </h3>
                    <button onClick={() => setEditingVersionTemplate(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6B7280' }}>✕</button>
                  </div>
                  <p style={{ color: '#4B5563', fontSize: '13px', margin: '0 0 16px 0' }}>
                    Approved templates are strictly immutable. Creating a new version moves it to <strong>PENDING_APPROVAL</strong> so you can safely test and verify it before merchant activation.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>New Regex Pattern</label>
                      <textarea
                        rows={3}
                        value={newVersionRegex}
                        onChange={(e) => setNewVersionRegex(e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Reason for Change</label>
                      <input
                        type="text"
                        value={newVersionReason}
                        onChange={(e) => setNewVersionReason(e.target.value)}
                        placeholder="e.g. Added support for UPI Ref prefix variations"
                        style={{ width: '100%', padding: '8px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                    <button
                      onClick={() => setEditingVersionTemplate(null)}
                      style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNewVersion}
                      disabled={savingNewVersion}
                      style={{ padding: '6px 14px', background: '#2563EB', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {savingNewVersion ? 'Saving...' : `Save as v${editingVersionTemplate.version + 1}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL 4: CONFLICT SAFE SWITCH CONFIRMATION */}
            {conflictModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
                <div style={{ background: '#FFF', borderRadius: '12px', padding: '24px', maxWidth: '520px', width: '100%' }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 700, color: '#B45309' }}>
                    ⚠️ Conflicting Active Template Detected
                  </h3>
                  <p style={{ color: '#374151', fontSize: '13px', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                    Template <strong>&quot;{conflictModal.conflictingTemplate?.name}&quot;</strong> is currently active for this bank account and channel.
                    Only one active template per channel and bank account can parse incoming evidence simultaneously.
                  </p>
                  <p style={{ color: '#4B5563', fontSize: '13px', margin: '0 0 20px 0' }}>
                    Would you like to safely <strong>deactivate the conflicting template</strong> and <strong>activate this template</strong> atomically?
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      onClick={() => setConflictModal(null)}
                      style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleReactivateTemplate(conflictModal.targetTemplateId, true)}
                      style={{ padding: '6px 14px', background: '#D97706', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Switch &amp; Activate
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'payment-links' ? (
        /* PAYMENT LINKS TAB (Phase 3A) */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
          {/* Left Column: Create Payment Link Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 6px 0' }}>Create Payment Link</h2>
              <p style={{ color: '#4B5563', fontSize: '13px', margin: '0 0 16px 0' }}>
                Generate fixed-price or open-amount UPI payment links to share directly with customers.
              </p>

              <form onSubmit={handleCreatePaymentLink} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Link Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Website Hosting - Monthly"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description displayed on customer checkout..."
                    value={newLinkDescription}
                    onChange={(e) => setNewLinkDescription(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="Leave blank for customer-defined amount"
                    value={newLinkAmountRupees}
                    onChange={(e) => setNewLinkAmountRupees(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  />
                  <p style={{ fontSize: '11px', color: '#6B7280', margin: '4px 0 0 0' }}>
                    If empty, customer enters their desired payment amount on checkout.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="isReusable"
                    checked={newLinkIsReusable}
                    onChange={(e) => setNewLinkIsReusable(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="isReusable" style={{ fontSize: '13px', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                    Reusable Link (multiple customers can pay)
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Validity Window
                  </label>
                  <select
                    value={newLinkExpiryHours}
                    onChange={(e) => setNewLinkExpiryHours(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="24">24 Hours</option>
                    <option value="72">72 Hours (3 Days)</option>
                    <option value="168">7 Days</option>
                    <option value="720">30 Days</option>
                    <option value="">Never Expires</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={creatingPaymentLink}
                  style={{
                    marginTop: '6px',
                    padding: '10px 16px',
                    background: '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: creatingPaymentLink ? 'not-allowed' : 'pointer'
                  }}
                >
                  {creatingPaymentLink ? 'Creating...' : '+ Create Payment Link'}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Payment Links Table */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Active Payment Links</h2>
                <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>
                  Each payment initiated via a link runs isolated dual-source verification.
                </p>
              </div>
              <button
                onClick={fetchPaymentLinks}
                disabled={loadingPaymentLinks}
                style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                {loadingPaymentLinks ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {loadingPaymentLinks && paymentLinks.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#6B7280', padding: '40px 0' }}>Loading payment links...</p>
            ) : paymentLinks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6B7280' }}>
                <p style={{ fontSize: '15px', fontWeight: 600 }}>No payment links created yet</p>
                <p style={{ fontSize: '13px' }}>Create your first link using the form on the left.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E7EB', color: '#4B5563', fontSize: '12px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 10px' }}>Title & Ref</th>
                      <th style={{ padding: '8px 10px' }}>Amount</th>
                      <th style={{ padding: '8px 10px' }}>Type</th>
                      <th style={{ padding: '8px 10px' }}>Collected</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentLinks.map((link) => (
                      <tr key={link.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px' }}>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{link.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#6B7280' }}>{link.linkReference}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(link.checkoutUrl);
                                showFeedback('success', `Copied checkout URL: ${link.checkoutUrl}`);
                              }}
                              style={{ padding: '2px 6px', fontSize: '10px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              Copy Link
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '10px', fontWeight: 700, color: '#111827' }}>
                          {link.isOpenAmount ? (
                            <span style={{ color: '#2563EB', fontWeight: 600, fontSize: '12px' }}>Customer Defined</span>
                          ) : (
                            `₹${(link.amountPaise! / 100).toFixed(2)}`
                          )}
                        </td>
                        <td style={{ padding: '10px', fontSize: '12px', color: '#4B5563' }}>
                          {link.isReusable ? 'Reusable' : 'Single-use'}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ fontWeight: 600, color: '#047857' }}>₹{link.totalCollectedRupees.toFixed(2)}</div>
                          <div style={{ fontSize: '11px', color: '#6B7280' }}>{link.paymentsCount} payments</div>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontWeight: 700,
                              background: link.status === 'ACTIVE' ? '#DEF7EC' : link.status === 'EXPIRED' ? '#FEE2E2' : '#F3F4F6',
                              color: link.status === 'ACTIVE' ? '#03543F' : link.status === 'EXPIRED' ? '#991B1B' : '#6B7280'
                            }}
                          >
                            {link.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => handleViewLinkDetails(link.id)}
                              style={{ padding: '4px 8px', background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Details
                            </button>
                            {link.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleRevokePaymentLink(link.id)}
                                style={{ padding: '4px 8px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'api-keys' ? (
        /* API KEYS TAB (Phase 3A) */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
          {/* Left Column: Generate API Key Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 6px 0' }}>Generate API Key</h2>
              <p style={{ color: '#4B5563', fontSize: '13px', margin: '0 0 16px 0' }}>
                Create API credentials to authenticate backend integrations and SDK calls.
              </p>

              <form onSubmit={handleCreateApiKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Key Name / Identifier *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Backend Production Server"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Environment
                  </label>
                  <select
                    value={newKeyEnvironment}
                    onChange={(e) => setNewKeyEnvironment(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="SANDBOX">Sandbox (rgs_test_...)</option>
                    <option value="PRODUCTION">Production (rgs_live_...)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Scopes (Comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="* or payments:read,payments:write"
                    value={newKeyScopes}
                    onChange={(e) => setNewKeyScopes(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {['*', 'payments:read', 'payments:write', 'links:read', 'links:write', 'webhooks:read'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewKeyScopes(s)}
                        style={{ padding: '2px 6px', fontSize: '10px', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '10px 12px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '11px', color: '#92400E', lineHeight: '16px' }}>
                  🔒 <strong>Secret Security Policy:</strong> API secrets are hashed with SHA-256 before storage. Raw secrets can never be viewed again after initial generation.
                </div>

                <button
                  type="submit"
                  disabled={creatingApiKey}
                  style={{
                    padding: '10px 16px',
                    background: '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: creatingApiKey ? 'not-allowed' : 'pointer'
                  }}
                >
                  {creatingApiKey ? 'Generating...' : '+ Generate API Key'}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: API Keys Table */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Configured API Keys</h2>
                <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>
                  Manage credentials used to connect backend services with RGS Ledger.
                </p>
              </div>
              <button
                onClick={fetchApiKeys}
                disabled={loadingApiKeys}
                style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                {loadingApiKeys ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {loadingApiKeys && apiKeys.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#6B7280', padding: '40px 0' }}>Loading API keys...</p>
            ) : apiKeys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6B7280' }}>
                <p style={{ fontSize: '15px', fontWeight: 600 }}>No API keys generated yet</p>
                <p style={{ fontSize: '13px' }}>Generate a key on the left to start integrating via REST API or Node.js SDK.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E7EB', color: '#4B5563', fontSize: '12px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 10px' }}>Name & Key ID</th>
                      <th style={{ padding: '8px 10px' }}>Env</th>
                      <th style={{ padding: '8px 10px' }}>Scopes</th>
                      <th style={{ padding: '8px 10px' }}>Last Used</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map((key) => (
                      <tr key={key.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '10px' }}>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{key.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#6B7280' }}>{key.keyId}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(key.keyId);
                                showFeedback('success', `Copied Key ID: ${key.keyId}`);
                              }}
                              style={{ padding: '2px 6px', fontSize: '10px', background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              Copy
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              background: key.environment === 'PRODUCTION' ? '#DEF7EC' : '#FEF3C7',
                              color: key.environment === 'PRODUCTION' ? '#03543F' : '#92400E'
                            }}
                          >
                            {key.environment}
                          </span>
                        </td>
                        <td style={{ padding: '10px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {key.scopes.map((sc) => (
                              <span key={sc} style={{ fontSize: '10px', background: '#EFF6FF', color: '#1E40AF', padding: '1px 5px', borderRadius: '3px' }}>
                                {sc}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '10px', fontSize: '12px', color: '#6B7280' }}>
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => handleRotateApiKey(key.id)}
                              disabled={rotatingKeyId === key.id}
                              style={{ padding: '4px 8px', background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              {rotatingKeyId === key.id ? 'Rotating...' : 'Rotate'}
                            </button>
                            <button
                              onClick={() => handleRevokeApiKey(key.id)}
                              style={{ padding: '4px 8px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Revoke
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'webhooks' ? (
        /* WEBHOOKS TAB (Phase 3A) */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
          {/* Left Column: Register Webhook Endpoint Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 6px 0' }}>Register Webhook</h2>
              <p style={{ color: '#4B5563', fontSize: '13px', margin: '0 0 16px 0' }}>
                Receive real-time signed HTTP notifications when payments and evidence transition status.
              </p>

              <form onSubmit={handleCreateWebhookEndpoint} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Webhook Destination URL *
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://api.yourdomain.com/webhooks/rgs"
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  />
                  <p style={{ fontSize: '11px', color: '#6B7280', margin: '4px 0 0 0' }}>
                    Must be HTTPS in production. Protected against SSRF (no localhost / private subnets).
                  </p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Events to Subscribe
                  </label>
                  <input
                    type="text"
                    placeholder="* or payment.success, payment.partial_success"
                    value={newWebhookEvents}
                    onChange={(e) => setNewWebhookEvents(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Order Fulfillment Server"
                    value={newWebhookDescription}
                    onChange={(e) => setNewWebhookDescription(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>

                <div style={{ padding: '10px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', fontSize: '11px', color: '#166534', lineHeight: '16px' }}>
                  🛡️ <strong>HMAC Signature Verification:</strong> Each request carries header <code>X-RGS-Signature: t=&lt;timestamp&gt;,v1=&lt;sig&gt;</code>. Use our SDK to verify authenticity.
                </div>

                <button
                  type="submit"
                  disabled={creatingWebhook}
                  style={{
                    padding: '10px 16px',
                    background: '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: creatingWebhook ? 'not-allowed' : 'pointer'
                  }}
                >
                  {creatingWebhook ? 'Registering...' : '+ Register Endpoint'}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Webhook Endpoints & Delivery Log */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Endpoints Table */}
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Registered Endpoints</h2>
                <button
                  onClick={fetchWebhooks}
                  disabled={loadingWebhooks}
                  style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                >
                  {loadingWebhooks ? 'Refreshing...' : '↻ Refresh'}
                </button>
              </div>

              {loadingWebhooks && webhookEndpoints.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6B7280', padding: '30px 0' }}>Loading endpoints...</p>
              ) : webhookEndpoints.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6B7280', padding: '30px 0' }}>No webhook endpoints registered.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E5E7EB', color: '#4B5563', fontSize: '12px', textTransform: 'uppercase' }}>
                        <th style={{ padding: '8px 10px' }}>Destination URL</th>
                        <th style={{ padding: '8px 10px' }}>Events</th>
                        <th style={{ padding: '8px 10px' }}>Status</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {webhookEndpoints.map((ep) => (
                        <tr key={ep.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '10px' }}>
                            <div style={{ fontWeight: 600, color: '#111827', wordBreak: 'break-all' }}>{ep.url}</div>
                            {ep.description && <div style={{ fontSize: '11px', color: '#6B7280' }}>{ep.description}</div>}
                          </td>
                          <td style={{ padding: '10px', fontSize: '11px', color: '#4B5563' }}>
                            {ep.events.join(', ')}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#DEF7EC', color: '#03543F', fontWeight: 600 }}>
                              Active
                            </span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => handleTestWebhookEndpoint(ep.id)}
                                disabled={testingWebhookId === ep.id}
                                style={{ padding: '4px 8px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                {testingWebhookId === ep.id ? 'Sending...' : 'Test Ping'}
                              </button>
                              <button
                                onClick={() => handleDeleteWebhookEndpoint(ep.id)}
                                style={{ padding: '4px 8px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Webhook Test Ping Result Card */}
              {webhookTestResult && (
                <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', background: webhookTestResult.success ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${webhookTestResult.success ? '#BBF7D0' : '#FECACA'}` }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: webhookTestResult.success ? '#166534' : '#991B1B' }}>
                    {webhookTestResult.success ? '✓ Test Ping Succeeded' : '✕ Test Ping Failed'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#4B5563', marginTop: '4px' }}>
                    Status Code: <strong>{webhookTestResult.statusCode || 'N/A'}</strong> &bull; Latency: <strong>{webhookTestResult.latencyMs}ms</strong>
                  </div>
                  {webhookTestResult.errorMessage && (
                    <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>
                      Error: {webhookTestResult.errorMessage}
                    </div>
                  )}
                  {webhookTestResult.responseBody && (
                    <div style={{ fontSize: '10px', fontFamily: 'monospace', background: '#FFF', padding: '6px', borderRadius: '4px', marginTop: '6px', border: '1px solid #E5E7EB' }}>
                      {webhookTestResult.responseBody}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Deliveries Log */}
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 12px 0' }}>Recent Delivery Log</h3>
              {webhookDeliveries.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6B7280', padding: '20px 0', fontSize: '13px' }}>No webhook events dispatched yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E5E7EB', color: '#4B5563', fontSize: '11px', textTransform: 'uppercase' }}>
                        <th style={{ padding: '6px 8px' }}>Event</th>
                        <th style={{ padding: '6px 8px' }}>Status</th>
                        <th style={{ padding: '6px 8px' }}>HTTP Code</th>
                        <th style={{ padding: '6px 8px' }}>Latency</th>
                        <th style={{ padding: '6px 8px' }}>Attempts</th>
                        <th style={{ padding: '6px 8px' }}>Delivered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {webhookDeliveries.map((del) => (
                        <tr key={del.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '8px', fontWeight: 600 }}>{del.eventType}</td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: del.status === 'SUCCESS' ? '#DEF7EC' : '#FEE2E2', color: del.status === 'SUCCESS' ? '#03543F' : '#991B1B' }}>
                              {del.status}
                            </span>
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{del.statusCode || '-'}</td>
                          <td style={{ padding: '8px' }}>{del.latencyMs !== undefined ? `${del.latencyMs}ms` : '-'}</td>
                          <td style={{ padding: '8px' }}>{del.attempts}</td>
                          <td style={{ padding: '8px', color: '#6B7280' }}>{new Date(del.createdAt).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'devices' ? (
        /* CONNECTED DEVICES TAB */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
          {/* Left Column: Device Pairing & Setup */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 6px 0' }}>Pair Companion Device</h2>
              <p style={{ color: '#4B5563', fontSize: '13px', margin: '0 0 16px 0', lineHeight: '18px' }}>
                Bind an Android companion phone to capture real-time bank and UPI credit notifications.
              </p>

              <button
                onClick={handleGeneratePairingCode}
                disabled={generatingPairingCode}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  background: '#2563EB',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: generatingPairingCode ? 'not-allowed' : 'pointer'
                }}
              >
                {generatingPairingCode ? 'Generating...' : '+ Generate Companion Pairing Code'}
              </button>

              {activePairingCode && (
                <div style={{ marginTop: '16px', padding: '16px', background: '#EFF6FF', borderRadius: '8px', border: '1px solid #BFDBFE', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#1E40AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Active Pairing Code
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '900', letterSpacing: '4px', color: '#1E3A8A', margin: '8px 0' }}>
                    {activePairingCode}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6B7280' }}>
                    Expires at {pairingCodeExpiresAt ? new Date(pairingCodeExpiresAt).toLocaleTimeString() : 'in 15 mins'}. Enter this code in your Android Companion application.
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px 0' }}>Setup Checklist:</h3>
              <ol style={{ margin: 0, paddingLeft: '20px', color: '#4B5563', fontSize: '13px', lineHeight: '20px' }}>
                <li>Install the RGS Companion APK on your Android device.</li>
                <li>Grant <strong>Notification Access</strong> permission in Android Settings.</li>
                <li>Enter the 8-character pairing code above.</li>
                <li>Keep the device connected to Wi-Fi or cellular network for real-time credit evidence sync.</li>
              </ol>
            </div>
          </div>

          {/* Right Column: Connected Devices List */}
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Connected Android Devices</h2>
                <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>
                  Companion devices authorized to ingest payment evidence into this merchant account
                </p>
              </div>
              <button
                onClick={fetchDevices}
                disabled={loadingDevices}
                style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                {loadingDevices ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {devices.length === 0 ? (
              <div style={{ padding: '36px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
                No Android companion devices paired yet. Click <strong>"+ Generate Companion Pairing Code"</strong> on the left to pair your first device.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {devices.map((dev) => (
                  <div
                    key={dev.id}
                    style={{
                      border: `1px solid ${dev.status === 'PAIRED' ? '#BFDBFE' : '#E5E7EB'}`,
                      background: dev.status === 'PAIRED' ? '#F8FAFC' : '#F9FAFB',
                      borderRadius: '8px',
                      padding: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>📱 {dev.deviceName}</span>
                          <span style={{ fontSize: '11px', background: '#E0E7FF', color: '#3730A3', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            {dev.androidVersion || 'Android 14'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px', fontFamily: 'monospace' }}>
                          Fingerprint: {dev.deviceFingerprint}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          background: dev.status === 'PAIRED' ? '#DEF7EC' : '#F3F4F6',
                          color: dev.status === 'PAIRED' ? '#03543F' : '#6B7280',
                          border: `1px solid ${dev.status === 'PAIRED' ? '#31C48D' : '#D1D5DB'}`
                        }}
                      >
                        {dev.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', margin: '12px 0', fontSize: '12px' }}>
                      <div style={{ background: '#FFF', padding: '8px', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                        <div style={{ color: '#6B7280', fontSize: '11px' }}>Notification Access</div>
                        <div style={{ fontWeight: 600, color: dev.notificationAccessGranted ? '#047857' : '#B45309' }}>
                          {dev.notificationAccessGranted ? '✓ Granted' : '○ Active / Standby'}
                        </div>
                      </div>
                      <div style={{ background: '#FFF', padding: '8px', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                        <div style={{ color: '#6B7280', fontSize: '11px' }}>Last Heartbeat</div>
                        <div style={{ fontWeight: 600, color: '#111827' }}>
                          {dev.lastHeartbeatAt ? new Date(dev.lastHeartbeatAt).toLocaleTimeString() : 'Never'}
                        </div>
                      </div>
                      <div style={{ background: '#FFF', padding: '8px', borderRadius: '6px', border: '1px solid #E5E7EB' }}>
                        <div style={{ color: '#6B7280', fontSize: '11px' }}>Pending Uploads</div>
                        <div style={{ fontWeight: 600, color: dev.pendingUploadCount > 0 ? '#B45309' : '#047857' }}>
                          {dev.pendingUploadCount || 0}
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>
                        Paired: {new Date(dev.pairedAt).toLocaleDateString()}
                      </div>
                      {dev.status === 'PAIRED' && (
                        <button
                          onClick={() => handleRevokeDevice(dev.id)}
                          style={{
                            padding: '4px 10px',
                            background: '#FEE2E2',
                            color: '#991B1B',
                            border: '1px solid #FCA5A5',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Revoke / Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Supported Notification Sources & Controls Card */}
            <div style={{ marginTop: '24px', background: '#FFFFFF', padding: '20px', borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>📲 Notification Sources & Messaging Apps</h3>
                  <p style={{ color: '#6B7280', fontSize: '13px', margin: '2px 0 0 0' }}>
                    Application-agnostic capture supports SMS, messaging, and banking applications without hardcoded limits.
                  </p>
                </div>
                <button
                  onClick={fetchNotificationSources}
                  disabled={loadingSources}
                  style={{ padding: '6px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                >
                  {loadingSources ? 'Refreshing...' : '↻ Refresh'}
                </button>
              </div>

              {/* Privacy Guarantee Banner */}
              <div style={{ padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#166534', lineHeight: '18px' }}>
                🛡️ <strong>On-Device Privacy Guaranteed:</strong> RGS Companion pre-filters notifications on-device using local eligibility heuristics. Personal chats, private messages, passwords, and authentication OTPs are redacted and never uploaded to RGS Ledger.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notificationSources.map((src) => (
                  <div
                    key={src.packageName}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      background: src.isEnabled ? '#FAFAFA' : '#F3F4F6',
                      borderRadius: '8px',
                      border: `1px solid ${src.isEnabled ? '#E5E7EB' : '#D1D5DB'}`
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: src.isEnabled ? '#111827' : '#6B7280' }}>
                          {src.appName}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            background: src.category === 'SMS' ? '#DBEAFE' : src.category === 'BANKING' ? '#DCFCE7' : '#FEF3C7',
                            color: src.category === 'SMS' ? '#1E40AF' : src.category === 'BANKING' ? '#166534' : '#92400E'
                          }}
                        >
                          {src.category}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#6B7280', fontFamily: 'monospace', marginTop: '2px' }}>
                        {src.packageName} &bull; {src.totalEvidenceCount} evidence captured
                        {src.lastDetectedAt && ` &bull; Last seen: ${new Date(src.lastDetectedAt).toLocaleDateString()}`}
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleNotificationSource(src.packageName)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: src.isEnabled ? '#DEF7EC' : '#FEE2E2',
                        color: src.isEnabled ? '#03543F' : '#991B1B'
                      }}
                    >
                      {src.isEnabled ? '✓ Allowed' : '✕ Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Payment Details / QR Modal */}
      {selectedPayment && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', maxWidth: '440px', width: '90%', padding: '24px', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <button
              onClick={() => setSelectedPayment(null)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7280' }}
            >
              &times;
            </button>

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment Details</span>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '2px 0 0 0' }}>Order #{selectedPayment.orderId}</h3>
              <div style={{ fontSize: '24px', fontWeight: '800', margin: '8px 0', color: '#111827' }}>
                ₹{(selectedPayment.amountPaise / 100).toFixed(2)}
                <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#6B7280', marginLeft: '6px' }}>
                  ({selectedPayment.amountPaise} paise)
                </span>
              </div>
              <StatusBadge status={selectedPayment.status} />

              {selectedPayment.reviewReason && (
                <div style={{ marginTop: '10px', padding: '8px 12px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '12px', color: '#92400E', textAlign: 'left' }}>
                  <strong>⚠️ Review Reason:</strong> {selectedPayment.reviewReason}
                </div>
              )}
            </div>

            {/* Dual-Source Evidence Summary Box */}
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ fontWeight: 700, color: '#374151', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Dual-Source Verification</span>
                <span style={{ fontFamily: 'monospace', color: '#4B5563' }}>Ref: {selectedPayment.checkoutReference}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>Bank Account:</span>
                <span style={{ fontWeight: 600, color: '#111827' }}>{selectedPayment.bankName || 'Default VPA'} {selectedPayment.accountSuffix ? `(XX${selectedPayment.accountSuffix})` : ''}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>UTR / Reference:</span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace', color: selectedPayment.evidenceSummary?.utr ? '#111827' : '#9CA3AF' }}>
                  {selectedPayment.evidenceSummary?.utr || 'Awaiting evidence'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>✉ Email Evidence:</span>
                <span style={{ fontWeight: 600, color: selectedPayment.evidenceSummary?.hasEmailEvidence ? '#047857' : '#9CA3AF' }}>
                  {selectedPayment.evidenceSummary?.hasEmailEvidence ? '✓ Matched & Verified' : '○ Awaiting Ingestion'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#6B7280' }}>📱 Android Evidence:</span>
                <span style={{ fontWeight: 600, color: selectedPayment.evidenceSummary?.hasAndroidEvidence ? '#047857' : '#9CA3AF' }}>
                  {selectedPayment.evidenceSummary?.hasAndroidEvidence ? '✓ Matched & Verified' : '○ Awaiting Ingestion'}
                </span>
              </div>
              {selectedPayment.evidenceSummary?.verifiedAt && (
                <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #E5E7EB', color: '#047857', fontWeight: 600, textAlign: 'center' }}>
                  ✓ Dual-source satisfied at {new Date(selectedPayment.evidenceSummary.verifiedAt).toLocaleString()}
                </div>
              )}
            </div>

            {/* Manual Review Interface for Ambiguous / Reconciliation Cases */}
            {(selectedPayment.status === PaymentStatus.REVIEW_REQUIRED || selectedPayment.status === PaymentStatus.RECONCILIATION_REQUIRED) && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400E', marginBottom: '4px' }}>
                  Manual Review Interface
                </div>
                <p style={{ fontSize: '11px', color: '#78350F', margin: '0 0 8px 0', lineHeight: '1.4' }}>
                  Note: Manual review strictly enforces dual-source evidence policy. Both valid Email and Android evidence must be matched to transition to SUCCESS.
                </p>
                <input
                  type="text"
                  placeholder="Resolution notes / reason..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '12px', marginBottom: '8px', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleResolveReview('RESOLVE')}
                    disabled={resolvingReview}
                    style={{ flex: 1, padding: '7px', background: '#059669', color: '#FFF', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: resolvingReview ? 'not-allowed' : 'pointer' }}
                  >
                    {resolvingReview ? 'Resolving...' : 'Resolve Dual-Source'}
                  </button>
                  <button
                    onClick={() => handleResolveReview('DISMISS')}
                    disabled={resolvingReview}
                    style={{ padding: '7px 12px', background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* QR Code */}
            <div style={{ textAlign: 'center', padding: '16px', background: '#FAFAFA', borderRadius: '10px', marginBottom: '16px' }}>
              <img
                src={selectedPayment.qrDataUrl}
                alt="Payment QR"
                style={{ width: '180px', height: '180px', display: 'block', margin: '0 auto' }}
              />
              <p style={{ fontSize: '11px', color: '#6B7280', margin: '8px 0 0 0' }}>Scan using GPay, PhonePe, Paytm, or BHIM</p>
            </div>

            {/* Action Links */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={`http://localhost:3002/?ref=${selectedPayment.checkoutReference}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: 1, padding: '9px', background: '#2563EB', color: '#FFF', textDecoration: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}
                >
                  Open Hosted Checkout ↗
                </a>
                <button
                  onClick={() => copyToClipboard(`http://localhost:3002/?ref=${selectedPayment.checkoutReference}`, 'checkout')}
                  style={{ padding: '9px 12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                >
                  {copiedText === 'checkout' ? '✓ Copied' : 'Copy Link'}
                </button>
              </div>

              <button
                onClick={() => copyToClipboard(selectedPayment.upiUri, 'upi')}
                style={{ padding: '8px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '12px', color: '#4B5563', cursor: 'pointer' }}
              >
                {copiedText === 'upi' ? '✓ Copied UPI Intent' : 'Copy Raw UPI Intent URI'}
              </button>

              {selectedPayment.status === PaymentStatus.PENDING && (
                <button
                  onClick={() => handleCancelPayment(selectedPayment.id)}
                  style={{ marginTop: '4px', padding: '8px', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel This Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reconciliation Case Inspection & Resolution Modal */}
      {selectedCase && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', maxWidth: '640px', width: '92%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <button
              onClick={() => setSelectedCase(null)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6B7280' }}
            >
              &times;
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <ReconSeverityBadge severity={selectedCase.severity} />
              <ReconStatusBadge status={selectedCase.status} />
              <span style={{ fontSize: '12px', color: '#6B7280', fontFamily: 'monospace' }}>
                Case #{selectedCase.id || (selectedCase as any)._id}
              </span>
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 6px 0', color: '#111827' }}>
              {selectedCase.caseType.replace(/_/g, ' ')}
            </h3>
            <div style={{ padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', fontSize: '12px', color: '#92400E', marginBottom: '16px' }}>
              <strong>Reason:</strong> {selectedCase.reason}
            </div>

            {/* Case Details Summary */}
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '14px', marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div>
                  <span style={{ color: '#6B7280' }}>Order ID:</span>{' '}
                  <strong style={{ color: '#111827' }}>{selectedCase.orderId || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: '#6B7280' }}>Checkout Ref:</span>{' '}
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>{selectedCase.checkoutReference || '—'}</span>
                </div>
                <div>
                  <span style={{ color: '#6B7280' }}>Expected Amount:</span>{' '}
                  <strong>₹{((selectedCase.expectedAmountPaise || 0) / 100).toFixed(2)}</strong>
                </div>
                <div>
                  <span style={{ color: '#6B7280' }}>Received Amount:</span>{' '}
                  <strong style={{ color: selectedCase.expectedAmountPaise !== selectedCase.receivedAmountPaise ? '#DC2626' : '#166534' }}>
                    ₹{((selectedCase.receivedAmountPaise || 0) / 100).toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#6B7280' }}>Bank UTR / Ref:</span>{' '}
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827' }}>{selectedCase.utr || 'Awaiting UTR'}</span>
                </div>
                <div>
                  <span style={{ color: '#6B7280' }}>Bank Account Suffix:</span>{' '}
                  <strong>{selectedCase.accountSuffix ? `XX${selectedCase.accountSuffix}` : '—'}</strong>
                </div>
              </div>

              {/* Dual Source Verification Status */}
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ color: '#6B7280' }}>✉ Email Evidence: </span>
                  <span style={{ fontWeight: 700, color: selectedCase.hasEmailEvidence ? '#047857' : '#DC2626' }}>
                    {selectedCase.hasEmailEvidence ? '✓ Present' : '✕ Missing'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#6B7280' }}>📱 Android Evidence: </span>
                  <span style={{ fontWeight: 700, color: selectedCase.hasAndroidEvidence ? '#047857' : '#DC2626' }}>
                    {selectedCase.hasAndroidEvidence ? '✓ Present' : '✕ Missing'}
                  </span>
                </div>
              </div>
            </div>

            {/* Invariant Policy Notice */}
            <div style={{ padding: '10px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', fontSize: '11px', color: '#1E40AF', marginBottom: '16px', lineHeight: '16px' }}>
              🛡️ <strong>Dual-Source Policy:</strong> Payment SUCCESS strictly requires BOTH independently verified Email and Android evidence. Resolving a single-source case with <code>CONFIRM_PAYMENT</code> without both sources is rejected by system invariants.
            </div>

            {/* Audit History Log */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>
                Case Audit History
              </div>
              <div style={{ maxHeight: '140px', overflowY: 'auto', background: '#FAFAFA', border: '1px solid #E5E7EB', borderRadius: '6px', padding: '10px' }}>
                {(!selectedCase.history || selectedCase.history.length === 0) ? (
                  <div style={{ fontSize: '11px', color: '#9CA3AF' }}>No history entries recorded.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedCase.history.map((h, idx) => (
                      <div key={idx} style={{ fontSize: '11px', borderBottom: idx < (selectedCase.history?.length || 0) - 1 ? '1px solid #E5E7EB' : 'none', paddingBottom: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#111827' }}>
                          <span>{h.action.replace(/_/g, ' ')} {h.newStatus ? `(${h.previousStatus || '—'} → ${h.newStatus})` : ''}</span>
                          <span style={{ color: '#6B7280' }}>{new Date(h.timestamp).toLocaleTimeString()}</span>
                        </div>
                        {h.notes && <div style={{ color: '#4B5563', marginTop: '2px' }}>{h.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Status Workflow Actions */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {selectedCase.status === 'OPEN' && (
                <button
                  onClick={() => handleUpdateCaseStatus(selectedCase.id || (selectedCase as any)._id, 'INVESTIGATING', 'Investigation started')}
                  style={{ padding: '7px 14px', background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  🔍 Mark Investigating
                </button>
              )}
              {selectedCase.status === 'INVESTIGATING' && (
                <button
                  onClick={() => handleUpdateCaseStatus(selectedCase.id || (selectedCase as any)._id, 'OPEN', 'Case returned to open queue')}
                  style={{ padding: '7px 14px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  ↩ Return to Open
                </button>
              )}
              {selectedCase.status !== 'DISMISSED' && selectedCase.status !== 'RESOLVED' && (
                <button
                  onClick={() => handleUpdateCaseStatus(selectedCase.id || (selectedCase as any)._id, 'DISMISSED', 'Dismissed by merchant')}
                  style={{ padding: '7px 14px', background: '#F3F4F6', color: '#4B5563', border: '1px solid #D1D5DB', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  ✕ Dismiss Case
                </button>
              )}
            </div>

            {/* Formal Resolution Form (if not resolved) */}
            {selectedCase.status !== 'RESOLVED' ? (
              <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                  Execute Resolution
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Resolution Action
                  </label>
                  <select
                    value={caseAction}
                    onChange={(e) => setCaseAction(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '12px' }}
                  >
                    <option value="CONFIRM_PAYMENT">
                      Confirm Payment (Strict Dual-Source: Requires Both Email & Android Evidence)
                    </option>
                    <option value="FLAG_FRAUD">
                      Flag as Fraud / Disputed (Locks payment, marks evidence conflicting)
                    </option>
                    <option value="REFUND_RECOMMENDED">
                      Recommend Refund (Merchants handle external banking refund)
                    </option>
                    <option value="DISMISS">
                      Dismiss Exception
                    </option>
                  </select>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Resolution Notes (Required for audit log)
                  </label>
                  <textarea
                    rows={2}
                    value={caseResolutionNotes}
                    onChange={(e) => setCaseResolutionNotes(e.target.value)}
                    placeholder="Document reason for resolution decision..."
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    onClick={() => setSelectedCase(null)}
                    style={{ padding: '8px 14px', background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleResolveCase(selectedCase.id || (selectedCase as any)._id)}
                    disabled={resolvingCase}
                    style={{
                      padding: '8px 18px',
                      background: '#059669',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: resolvingCase ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {resolvingCase ? 'Resolving...' : 'Submit Resolution'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '12px 16px', background: '#DEF7EC', border: '1px solid #31C48D', borderRadius: '8px', fontSize: '13px', color: '#03543F' }}>
                ✓ This case was resolved. Resolution Notes: <strong>{selectedCase.resolutionNotes || 'None'}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* API Key Secret Display Modal (Shown only once upon generation / rotation) */}
      {createdSecretModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', maxWidth: '480px', width: '90%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#111827' }}>
              🔑 {createdSecretModal.title}
            </h3>
            <p style={{ color: '#4B5563', fontSize: '13px', margin: '0 0 16px 0', lineHeight: '18px' }}>
              Your API credentials have been created. Copy the API Secret now; for security reasons, it cannot be recovered or displayed again.
            </p>

            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>API Key ID</div>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#111827', margin: '2px 0 10px 0' }}>
                {createdSecretModal.keyId}
              </div>

              <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>API Secret (Shown Once)</div>
              <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: '#B91C1C', wordBreak: 'break-all', background: '#FEF2F2', padding: '8px 10px', borderRadius: '6px', border: '1px solid #FECACA', margin: '4px 0 10px 0' }}>
                {createdSecretModal.rawSecret}
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdSecretModal.rawSecret);
                  showFeedback('success', 'API Secret copied to clipboard!');
                }}
                style={{ width: '100%', padding: '8px', background: '#2563EB', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Copy API Secret
              </button>
            </div>

            <div style={{ padding: '10px 12px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '11px', color: '#92400E', marginBottom: '16px', lineHeight: '16px' }}>
              ⚠️ <strong>Security Notice:</strong> Store this key securely on your server (e.g. in <code>.env</code>). Never commit secrets to source control or expose them in browser code.
            </div>

            <button
              onClick={() => setCreatedSecretModal(null)}
              style={{ width: '100%', padding: '10px', background: '#111827', color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              I Have Stored the Secret Securely
            </button>
          </div>
        </div>
      )}

      {/* Payment Link Details & History Modal */}
      {selectedLinkDetails && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', maxWidth: '600px', width: '92%', maxHeight: '85vh', overflowY: 'auto', padding: '24px', position: 'relative', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <button
              onClick={() => setSelectedLinkDetails(null)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7280' }}
            >
              &times;
            </button>

            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment Link Details</span>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '2px 0 0 0' }}>{selectedLinkDetails.link.title}</h3>
              <p style={{ color: '#4B5563', fontSize: '13px', margin: '2px 0 0 0' }}>{selectedLinkDetails.link.description || 'No description provided'}</p>
              {loadingLinkDetails && <p style={{ fontSize: '11px', color: '#2563EB', margin: '4px 0 0 0' }}>Updating payments...</p>}
            </div>

            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>Reference:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedLinkDetails.link.linkReference}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>Amount:</span>
                <span style={{ fontWeight: 700 }}>{selectedLinkDetails.link.isOpenAmount ? 'Customer Defined' : `₹${selectedLinkDetails.link.amountRupees?.toFixed(2)}`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>Status:</span>
                <span style={{ fontWeight: 700 }}>{selectedLinkDetails.link.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#6B7280' }}>Total Collected:</span>
                <span style={{ fontWeight: 700, color: '#047857' }}>₹{selectedLinkDetails.link.totalCollectedRupees.toFixed(2)} ({selectedLinkDetails.link.paymentsCount} payments)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ color: '#6B7280' }}>Checkout URL:</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedLinkDetails.link.checkoutUrl);
                    showFeedback('success', 'Checkout URL copied!');
                  }}
                  style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Copy URL
                </button>
              </div>
            </div>

            <h4 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 10px 0' }}>Payments Initiated Via This Link</h4>
            {selectedLinkDetails.recentPayments.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#6B7280', padding: '16px 0', textAlign: 'center' }}>No payments initiated yet via this link.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E5E7EB', color: '#4B5563', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '6px 8px' }}>Order ID</th>
                      <th style={{ padding: '6px 8px' }}>Amount</th>
                      <th style={{ padding: '6px 8px' }}>Status</th>
                      <th style={{ padding: '6px 8px' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLinkDetails.recentPayments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>#{p.orderId}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>₹{p.amountRupees.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}><StatusBadge status={p.status} /></td>
                        <td style={{ padding: '6px 8px', color: '#6B7280' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ marginTop: '40px', paddingBottom: '30px' }}>
        <NonCustodialDisclosureBanner />
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MerchantDashboardApp />
    </ErrorBoundary>
  );
}
