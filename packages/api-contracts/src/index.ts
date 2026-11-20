import {
  PaymentStatus,
  PaymentRequest,
  EvidenceSource,
  EvidenceProvider,
  EvidenceChannel,
  EvidenceStatus,
  TransactionType,
  TemplateLifecycleStatus,
  Merchant,
  MerchantBankAccount,
  AndroidDevice
} from '@rgs-ledger/shared-types';

export type {
  NormalizedEvidence,
  EvidenceTemplate,
  MerchantBankAccount,
  AndroidDevice
} from '@rgs-ledger/shared-types';

/** Standard API envelope */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

/** Health Check Response */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  services: {
    database: 'connected' | 'disconnected' | 'connecting';
    scheduler: 'active' | 'inactive';
  };
}

/** Auth DTOs */
export interface RegisterRequest {
  email: string;
  password: string;
  merchantName: string;
  upiVpa: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    merchantId: string;
    role: string;
  };
  merchant: {
    id: string;
    name: string;
    email: string;
    upiConfig: {
      vpa: string;
      businessName: string;
      mcc?: string;
      isAcceptingPayments: boolean;
    };
  };
  tokens: AuthTokens;
}

/** Merchant DTOs */
export interface UpdateMerchantProfileInput {
  name?: string;
}

export interface UpdateMerchantUpiInput {
  vpa: string;
  businessName: string;
  mcc?: string;
  isAcceptingPayments?: boolean;
}

export interface MerchantProfileResponse {
  merchant: Merchant;
}

/** Merchant Bank Account DTOs */
export interface CreateBankAccountRequest {
  bankName: string;
  upiId: string;
  accountSuffix?: string;
  accountNumberMasked?: string;
  notes?: string;
  accountHolderName?: string;
  expectedSenderEmails?: string[];
  expectedSenderDomains?: string[];
  expectedPackageNames?: string[];
  appNames?: string[];
  isDefault?: boolean;
}

export interface BankAccountResponse {
  account: MerchantBankAccount;
}

export interface BankAccountListResponse {
  accounts: MerchantBankAccount[];
}

/** Payment Request DTOs */
export interface CreatePaymentRequestInput {
  orderId: string;
  amountPaise: number;
  description?: string;
  expiresInMinutes?: number;
  idempotencyKey?: string;
}

export interface PaymentDetailsResponse {
  payment: PaymentRequest;
  qrCodeUrl: string;
  dualSourceStatus: {
    hasEmailEvidence: boolean;
    hasAndroidEvidence: boolean;
    isFullyVerified: boolean;
    disclosure: string;
  };
}

export interface CancelPaymentResponse {
  paymentId: string;
  orderId: string;
  status: PaymentStatus.CANCELLED;
  cancelledAt: string;
}

/** Public Hosted Checkout DTO */
export interface PublicCheckoutDetails {
  checkoutReference: string;
  merchantName: string;
  orderId: string;
  amountPaise: number;
  amountRupees: number;
  qrDataUrl: string;
  upiUri: string;
  intentLinks: {
    generic: string;
    phonepe: string;
    gpay: string;
    paytm: string;
    bhim: string;
  };
  status: PaymentStatus;
  description?: string;
  expiresAt: string;
  isExpired: boolean;
  disclosure: string;
}

/** Ingestion DTOs */
export interface IngestEmailEvidenceInput {
  merchantId: string;
  source: EvidenceSource.EMAIL_GMAIL | EvidenceSource.EMAIL_OUTLOOK;
  subject: string;
  bodySnippet: string;
  amountPaise: number;
  utr?: string;
  senderEmail: string;
  timestamp: string;
  rawPayloadHash: string;
}

export interface IngestAndroidEvidenceInput {
  deviceId: string;
  merchantId: string;
  packageName: string;
  notificationTitle: string;
  notificationText: string;
  amountPaise: number;
  utr?: string;
  postTime: number;
  rawPayloadHash: string;
}

export interface BatchEvidenceSyncInput {
  deviceId: string;
  items: IngestAndroidEvidenceInput[];
}

export interface IngestEvidenceResponse {
  evidenceId: string;
  status: EvidenceStatus;
  matchedPaymentId?: string;
  paymentStatusAfterMatch?: PaymentStatus;
}

/** Device Companion Pairing */
export interface PairDeviceInput {
  pairingCode: string;
  deviceName: string;
  deviceFingerprint: string;
}

export interface PairDeviceResponse {
  deviceId: string;
  deviceToken: string;
  merchantId: string;
  merchantName: string;
  merchantVpa?: string;
}

export interface GeneratePairingCodeResponse {
  pairingCode: string;
  expiresAt: string;
  merchantName: string;
}

export interface DeviceListResponse {
  devices: AndroidDevice[];
}

/** Phase 2A: Template Management DTOs */
export interface EvidenceTemplateDto {
  id: string;
  _id?: string;
  merchantId: string;
  bankAccountId?: string | null;
  channel: EvidenceChannel;
  provider?: EvidenceProvider;
  senderIdentifier: string;
  packageName?: string;
  senderHeader?: string;
  name: string;
  description?: string;
  regexPattern: string;
  fieldsMap: Record<string, string>;
  samplePayload?: string;
  version: number;
  status: TemplateLifecycleStatus;
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  deactivatedAt?: string;
  reactivatedAt?: string;
  isImmutable: boolean;
  approvedByUserId?: string;
  approvedAt?: string;
  historyCount: number;
  history?: any[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  channel: EvidenceChannel;
  provider?: EvidenceProvider;
  senderIdentifier: string;
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
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  regexPattern?: string;
  fieldsMap?: Record<string, string>;
  changeReason?: string;
}

export interface ApproveTemplateInput {
  targetVersion: number;
  approvalNotes?: string;
}

/** Phase 2A: Normalized Evidence DTO */
export interface NormalizedEvidenceDto {
  id: string;
  merchantId: string;
  channel: EvidenceChannel;
  provider: EvidenceProvider;
  providerMessageId: string;
  senderOrPackage: string;
  accountIdentifier: string | null;
  transactionType: TransactionType;
  amountPaise: number;
  amountRupees: number;
  currency: 'INR';
  utr: string | null;
  transactionTimestamp: string | null;
  receivedAt: string;
  status: EvidenceStatus;
  deduplicationHash: string;
  rawPayloadHash: string;
  templateId?: string;
  templateVersion?: number;
  matchedPaymentRequestId?: string;
}

export interface IngestAttemptResult {
  attemptId: string;
  status: 'SUCCESS' | 'DUPLICATE' | 'FAILED';
  evidenceId?: string;
  evidenceStatus?: EvidenceStatus;
  isDuplicate: boolean;
  rejectionReason?: string;
  receivedAt: string;
}

/** Phase 3A: Payment Links DTOs */
export interface CreatePaymentLinkInput {
  title: string;
  description?: string;
  amountPaise?: number | null;
  bankAccountId?: string | null;
  isReusable?: boolean;
  expiresAt?: string | null;
  metadata?: Record<string, any>;
}

export interface PaymentLinkDto {
  id: string;
  merchantId: string;
  linkReference: string;
  title: string;
  description?: string;
  amountPaise: number | null;
  amountRupees: number | null;
  currency: string;
  bankAccountId?: string | null;
  isReusable: boolean;
  status: string;
  expiresAt?: string | null;
  paymentsCount: number;
  totalCollectedPaise: number;
  totalCollectedRupees: number;
  metadata?: Record<string, any>;
  checkoutUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPaymentLinkDetails {
  linkReference: string;
  merchantName: string;
  title: string;
  description?: string;
  amountPaise: number | null;
  amountRupees: number | null;
  isOpenAmount: boolean;
  currency: string;
  isReusable: boolean;
  status: string;
  isExpired: boolean;
  expiresAt?: string | null;
}

export interface InitiatePaymentFromLinkInput {
  amountPaise?: number; // Required if open amount link
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

/** Phase 3A: API Credentials DTOs */
export interface CreateApiKeyInput {
  name: string;
  environment?: 'PRODUCTION' | 'SANDBOX';
  scopes?: string[];
  expiresAt?: string | null;
}

export interface ApiKeyDto {
  id: string;
  merchantId: string;
  name: string;
  keyId: string;
  keyPrefix: string;
  environment: 'PRODUCTION' | 'SANDBOX';
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKeyDto;
  rawSecret: string;
  warning: string;
}

export interface RotateApiKeyResponse {
  apiKey: ApiKeyDto;
  newSecret: string;
  warning: string;
}

/** Phase 3A: Webhook DTOs */
export interface CreateWebhookEndpointInput {
  url: string;
  events?: string[];
  description?: string;
  secret?: string;
}

export interface WebhookEndpointDto {
  id: string;
  merchantId: string;
  url: string;
  secret: string; // masked in responses unless explicitly generated
  events: string[];
  isActive: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryDto {
  id: string;
  merchantId: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  attemptNumber: number;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'DEAD_LETTER';
  deliveredAt: string;
  createdAt: string;
}

export interface TestWebhookEndpointResponse {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  latencyMs: number;
}

/**
 * Phase 3C: Admin Operations DTOs
 */
export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginResponse {
  user: {
    id: string;
    email: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface PlatformOverviewMetricsDto {
  merchants: {
    total: number;
    active: number;
    suspended: number;
  };
  payments: {
    total: number;
    byStatus: Record<string, number>;
    totalRequestedValuePaise: number;
    totalSuccessValuePaise: number;
    partialSuccessCount: number;
    reviewRequiredCount: number;
    reconciliationRequiredCount: number;
  };
  devices: {
    activeCount: number;
  };
  integrations: {
    connectedEmailCount: number;
  };
  reconciliation: {
    openCasesCount: number;
  };
  webhooks: {
    deliveryFailuresCount: number;
  };
}

export interface AdminMerchantSummaryDto {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED';
  defaultVpa?: string;
  bankAccountsCount: number;
  activeDevicesCount: number;
  emailIntegrationConnected: boolean;
  totalPaymentsCount: number;
  successPaymentsCount: number;
  totalRequestedPaise: number;
  totalSuccessPaise: number;
  openReconciliationCasesCount: number;
  createdAt: string;
}

export interface AdminMerchantDetailDto {
  merchant: {
    id: string;
    name: string;
    email: string;
    status: 'ACTIVE' | 'SUSPENDED';
    upiConfig: {
      vpa: string;
      businessName: string;
      mcc?: string;
      isAcceptingPayments: boolean;
    };
    createdAt: string;
  };
  bankAccounts: MerchantBankAccount[];
  integrations: Array<{
    id: string;
    provider: string;
    status: string;
    emailAddress?: string;
    lastSyncAt?: string;
    createdAt: string;
  }>;
  devices: Array<{
    id: string;
    deviceName: string;
    deviceFingerprint: string;
    androidVersion?: string;
    notificationAccessGranted: boolean;
    lastSeenAt?: string;
    pendingUploadCount?: number;
    status: string;
  }>;
  apiKeys: Array<{
    id: string;
    keyId: string;
    name: string;
    environment: string;
    scopes: string[];
    isActive: boolean;
    lastUsedAt?: string;
    createdAt: string;
  }>;
  stats: {
    totalPayments: number;
    successPayments: number;
    partialPayments: number;
    pendingPayments: number;
    expiredPayments: number;
    totalRequestedPaise: number;
    totalSuccessPaise: number;
    reconciliationOpen: number;
    reconciliationResolved: number;
  };
}

export interface AdminTransactionDto {
  id: string;
  paymentReference: string;
  orderId: string;
  merchantId: string;
  merchantName: string;
  amountPaise: number;
  status: string;
  bankAccountId?: string | null;
  bankName?: string;
  accountSuffix?: string;
  upiUri: string;
  evidenceCount: number;
  hasEmailEvidence: boolean;
  hasAndroidEvidence: boolean;
  emailEvidenceStatus?: string;
  androidEvidenceStatus?: string;
  utr?: string;
  createdAt: string;
  matchedAt?: string;
  reviewReason?: string;
}

export interface AdminReconciliationCaseDto {
  id: string;
  merchantId: string;
  merchantName?: string;
  paymentRequestId?: string;
  caseType: string;
  severity: string;
  reason: string;
  status: string;
  expectedAmountPaise?: number;
  receivedAmountPaise?: number;
  utr?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformConfigDto {
  key: string;
  paymentExpirySeconds: number;
  evidenceMatchingWindowSeconds: number;
  reconciliationScheduleIntervalSeconds: number;
  webhookMaxRetries: number;
  webhookBackoffFactor: number;
  evidenceRetentionDays: number;
  rateLimitPerMinute: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface UpdatePlatformConfigRequest {
  paymentExpirySeconds?: number;
  evidenceMatchingWindowSeconds?: number;
  reconciliationScheduleIntervalSeconds?: number;
  webhookMaxRetries?: number;
  webhookBackoffFactor?: number;
  evidenceRetentionDays?: number;
  rateLimitPerMinute?: number;
}

export interface SuspendMerchantRequest {
  reason: string;
}

export interface AdminResolveReconciliationRequest {
  resolutionStatus: 'RESOLVED' | 'DISMISSED';
  resolutionNotes: string;
}

/**
 * Phase 4A: Merchant Analytics & Reporting DTOs
 */
export interface MerchantAnalyticsSummaryDto {
  totalPaymentRequests: number;
  totalAmountRequestedPaise: number;
  totalAmountRequestedRupees: number;
  successCount: number;
  successAmountPaise: number;
  successAmountRupees: number;
  partialSuccessCount: number;
  partialSuccessAmountPaise: number;
  partialSuccessAmountRupees: number;
  pendingCount: number;
  pendingAmountPaise: number;
  pendingAmountRupees: number;
  reviewRequiredCount: number;
  reconciliationRequiredCount: number;
  expiredCount: number;
  cancelledCount: number;
  evidenceMatchingRate: number;
  averageEvidenceMatchingTimeSeconds: number;
  timeframe: string;
  startDate: string;
  endDate: string;
}

export interface MerchantAnalyticsTimeseriesItemDto {
  date: string;
  paymentRequestsCount: number;
  amountRequestedPaise: number;
  amountRequestedRupees: number;
  successCount: number;
  successAmountPaise: number;
  successAmountRupees: number;
  emailEvidenceCount: number;
  androidEvidenceCount: number;
  reconciliationCasesCount: number;
}

export interface MerchantAnalyticsTimeseriesDto {
  items: MerchantAnalyticsTimeseriesItemDto[];
  timeframe: string;
  startDate: string;
  endDate: string;
}

/**
 * Phase 4B: Public Website & Merchant Onboarding DTOs
 */
export interface ContactSubmissionRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactSubmissionDto {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'NEW' | 'RESOLVED' | 'SPAM';
  createdAt: string;
}

export interface OnboardingChecksDto {
  profileComplete: boolean;
  upiConfigured: boolean;
  bankAccountActive: boolean;
  bankAccountCount: number;
  emailConnected: boolean;
  emailProvider?: string | null;
  androidDevicePaired: boolean;
  pairedDeviceCount: number;
  emailTemplateApproved: boolean;
  androidTemplateApproved: boolean;
}

export interface MerchantOnboardingStatusDto {
  currentStep: 'business' | 'upi' | 'email' | 'android' | 'templates' | 'review' | 'completed';
  completedSteps: string[];
  isCompleted: boolean;
  isDismissed: boolean;
  checks: OnboardingChecksDto;
  readinessStatus: 'NOT_READY' | 'PARTIALLY_READY' | 'FULLY_READY';
  readinessMessage: string;
  missingCapabilities: string[];
}

export interface UpdateOnboardingStepRequest {
  currentStep: 'business' | 'upi' | 'email' | 'android' | 'templates' | 'review' | 'completed';
  markStepCompleted?: string;
}

