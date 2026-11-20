/**
 * Payment lifecycle statuses as defined in RGS Ledger Dual-Source Architecture.
 */
export enum PaymentStatus {
  /** Initial state: QR created, awaiting payment and incoming evidence */
  PENDING = 'PENDING',
  /** Exactly one valid evidence source received and matched (e.g., Email OR Android) */
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
  /** Both email and Android evidence matched against the same underlying transaction */
  SUCCESS = 'SUCCESS',
  /** Conflicting evidence received (e.g., amount mismatch, wrong reference, duplicate UTR) */
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  /** Payment request window expired without sufficient matching evidence */
  EXPIRED = 'EXPIRED',
  /** Payment request manually cancelled by merchant */
  CANCELLED = 'CANCELLED',
  /** Evidence arrived after expiry or manual intervention required to resolve */
  RECONCILIATION_REQUIRED = 'RECONCILIATION_REQUIRED',
}

/**
 * Sources from which payment-credit evidence is captured.
 */
export enum EvidenceSource {
  EMAIL_GMAIL = 'EMAIL_GMAIL',
  EMAIL_OUTLOOK = 'EMAIL_OUTLOOK',
  ANDROID_COMPANION = 'ANDROID_COMPANION',
}

/**
 * Underlying evidence providers.
 */
export enum EvidenceProvider {
  GMAIL = 'GMAIL',
  OUTLOOK = 'OUTLOOK',
  ANDROID_COMPANION = 'ANDROID_COMPANION',
}

/**
 * Evidence Channel grouping (Gmail + Outlook count as ONE logical EMAIL channel)
 */
export enum EvidenceChannel {
  EMAIL = 'EMAIL',
  ANDROID = 'ANDROID',
}

/**
 * Processing lifecycle statuses of an ingested evidence record.
 * Separate from PaymentRequest status.
 */
export enum EvidenceStatus {
  /** Raw evidence payload received and persisted */
  RECEIVED = 'RECEIVED',
  /** Extracted and validated into normalized domain model */
  NORMALIZED = 'NORMALIZED',
  /** Successfully matched against a payment request */
  MATCHED = 'MATCHED',
  /** Normalized and valid, awaiting matching payment */
  UNMATCHED = 'UNMATCHED',
  /** Duplicate payload, UTR, or event ID detected */
  DUPLICATE = 'DUPLICATE',
  /** Invalid payload, unparseable, or non-credit transaction */
  REJECTED = 'REJECTED',
  /** Conflicting evidence, amount discrepancy, or dispute requiring review */
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
}

/**
 * Transaction type classification
 */
export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

/**
 * Merchant Evidence Template Lifecycle States
 */
export enum TemplateLifecycleStatus {
  /** Newly discovered pattern from incoming unknown notification */
  DISCOVERED = 'DISCOVERED',
  /** Submitted or revised template awaiting merchant user authorization */
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  /** Authorized by merchant, active and immutable */
  APPROVED = 'APPROVED',
  /** Decommissioned or disabled by merchant */
  DISABLED = 'DISABLED',
  /** Archived template preserved for audit and historical record */
  ARCHIVED = 'ARCHIVED',
}

/**
 * Map evidence provider or source to higher-level logical evidence channel.
 */
export function getEvidenceChannel(sourceOrProvider: EvidenceSource | EvidenceProvider): EvidenceChannel {
  if (
    sourceOrProvider === EvidenceProvider.ANDROID_COMPANION ||
    (sourceOrProvider as string) === 'ANDROID_COMPANION'
  ) {
    return EvidenceChannel.ANDROID;
  }
  return EvidenceChannel.EMAIL;
}

/**
 * Provider-Independent Normalized Payment Evidence Domain Entity
 */
export interface NormalizedEvidence {
  id: string;
  merchantId: string;
  channel: EvidenceChannel;
  provider: EvidenceProvider;
  providerMessageId: string;
  senderOrPackage: string;
  accountIdentifier: string | null;
  transactionType: TransactionType;
  amountPaise: number;
  currency: 'INR';
  utr: string | null;
  transactionTimestamp: Date | null;
  receivedAt: Date;
  status: EvidenceStatus;
  rejectionReason?: string;
  deduplicationHash: string;
  rawPayloadHash: string;
  encryptedRawPayload?: string;
  templateId?: string;
  templateVersion?: number;
  bankAccountId?: string | null;
  matchedPaymentRequestId?: string;
  matchedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Template Audit History Entry (Immutable historical record)
 */
export interface TemplateVersionHistory {
  version: number;
  regexPattern: string;
  fieldsMap: Record<string, string>;
  status: TemplateLifecycleStatus;
  isActive?: boolean;
  modifiedByUserId?: string;
  changeReason?: string;
  createdAt: Date;
}

/**
 * Merchant-Scoped Message / Notification Template Entity
 */
export interface EvidenceTemplate {
  id: string;
  _id?: string;
  merchantId: string;
  bankAccountId?: string | null;
  channel: EvidenceChannel;
  provider?: EvidenceProvider;
  senderIdentifier: string; // email address or android package name
  packageName?: string; // specific android package name (e.g. com.google.android.apps.messaging)
  senderHeader?: string; // specific SMS sender header (e.g. VM-UNIONB)
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
  samplePayload?: string;
  version: number;
  status: TemplateLifecycleStatus;
  isActive?: boolean;
  isArchived?: boolean;
  archivedAt?: Date;
  deactivatedAt?: Date;
  reactivatedAt?: Date;
  isImmutable: boolean;
  approvedByUserId?: string;
  approvedAt?: Date;
  history: TemplateVersionHistory[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Dedicated Merchant Bank Account Configuration for UPI collections and evidence matching.
 */
export interface MerchantBankAccount {
  id: string;
  _id?: string;
  merchantId: string;
  bankName: string;
  upiId: string;
  accountNumberMasked: string;
  accountSuffix: string;
  accountHolderName?: string;
  notes?: string;
  emailEvidenceConfig?: {
    expectedSenderEmails?: string[];
    expectedSenderDomains?: string[];
  };
  androidEvidenceConfig?: {
    expectedPackageNames?: string[];
    appNames?: string[];
  };
  isActive: boolean;
  isDefault: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/**
 * Evidence Ingestion Attempt Record
 */
export interface EvidenceIngestionAttempt {
  id: string;
  merchantId: string;
  channel: EvidenceChannel;
  provider: EvidenceProvider;
  providerMessageId: string;
  idempotencyKey?: string;
  ipAddress?: string;
  status: 'SUCCESS' | 'DUPLICATE' | 'FAILED';
  evidenceId?: string;
  errorMessage?: string;
  attemptedAt: Date;
}

/**
 * Payment Evidence Association Record
 */
export interface PaymentEvidenceAssociation {
  id: string;
  merchantId: string;
  paymentRequestId: string;
  evidenceId: string;
  channel: EvidenceChannel;
  provider: EvidenceProvider;
  matchedUtr?: string;
  matchedAmountPaise: number;
  associatedAt: Date;
  associatedBy: 'AUTO_MATCH' | 'MANUAL_RECONCILIATION';
}

/**
 * Evidence Record representing a single raw piece of proof.
 */
export interface PaymentEvidence {
  id: string;
  merchantId: string;
  channel: EvidenceChannel;
  provider: EvidenceProvider;
  source: EvidenceSource;
  providerMessageId: string;
  
  // Financial transaction details
  senderOrPackage: string;
  accountIdentifier: string | null;
  transactionType: TransactionType;
  amountPaise: number;
  currency: 'INR';
  utr: string | null;
  payerVpa?: string;
  payerName?: string;
  receiverVpa?: string;
  bankReference?: string;
  transactionTimestamp: Date | null;
  receivedAt: Date;
  
  // Status and deduplication
  status: EvidenceStatus;
  rejectionReason?: string;
  deduplicationHash: string;
  rawPayloadHash: string;
  
  // Raw metadata (redacted of personal identifiers)
  capturedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Core Payment Request entity.
 */
export interface PaymentRequest {
  id: string;
  merchantId: string;
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  description?: string;
  
  // UPI and Bank configuration used for this payment
  merchantVpa: string;
  merchantName: string;
  bankAccountId?: string | null;
  bankName?: string;
  accountSuffix?: string;
  upiUri: string;
  qrDataUrl: string;
  checkoutReference: string;
  idempotencyKey?: string;
  
  // Status and dual-source evidence verification
  status: PaymentStatus;
  reviewReason?: string;
  evidenceSummary: {
    hasEmailEvidence: boolean;
    hasAndroidEvidence: boolean;
    emailEvidenceId?: string;
    androidEvidenceId?: string;
    utr?: string;
    matchedAmountPaise?: number;
    verifiedAt?: Date;
  };

  // Expiry and lifecycle timestamps
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Merchant Account
 */
export interface Merchant {
  id: string;
  name: string;
  email: string;
  upiConfig: {
    vpa: string;
    businessName: string;
    mcc?: string;
    isAcceptingPayments: boolean;
  };
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Android Companion Device Registration
 */
export interface AndroidDevice {
  id: string;
  merchantId: string;
  deviceName: string;
  deviceFingerprint: string;
  fcmToken?: string;
  androidVersion?: string;
  notificationAccessGranted?: boolean;
  pendingUploadCount?: number;
  lastSyncAt?: Date | string;
  lastError?: string;
  lastHeartbeatAt: Date | string;
  pairedAt: Date | string;
  status: 'PAIRED' | 'UNPAIRED' | 'SUSPENDED';
}

/**
 * Webhook delivery record
 */
export interface WebhookDelivery {
  id: string;
  merchantId: string;
  endpointUrl: string;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatusCode?: number;
  attempts: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'DEAD_LETTER';
  nextRetryAt?: Date;
  createdAt: Date;
}

/**
 * Background Leased Job Record (MongoDB-backed durability)
 */
export interface BackgroundJob {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  leaseToken?: string;
  leasedUntil?: Date;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  runAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Transactional Outbox Event
 */
export interface OutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  createdAt: Date;
  publishedAt?: Date;
}

/**
 * Security Audit Log Entry
 */
export interface AuditLog {
  id: string;
  merchantId?: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Reconciliation Case Types for exception and dispute lifecycle
 */
export enum ReconciliationCaseType {
  LATE_EVIDENCE = 'LATE_EVIDENCE',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  DUPLICATE_UTR = 'DUPLICATE_UTR',
  MISSING_UTR = 'MISSING_UTR',
  ACCOUNT_MISMATCH = 'ACCOUNT_MISMATCH',
  EVIDENCE_DISAGREEMENT = 'EVIDENCE_DISAGREEMENT',
  DUPLICATE_PAYLOAD = 'DUPLICATE_PAYLOAD',
  MISSING_SECOND_SOURCE = 'MISSING_SECOND_SOURCE',
  CANCELLED_PAYMENT_EVIDENCE = 'CANCELLED_PAYMENT_EVIDENCE',
  MANUAL_FLAG = 'MANUAL_FLAG',
}

/**
 * Reconciliation Case Severity Levels
 */
export enum ReconciliationCaseSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Reconciliation Case Resolution Statuses
 */
export enum ReconciliationCaseStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

/**
 * Audit history entry for reconciliation case actions
 */
export interface ReconciliationHistoryEntry {
  action: string;
  performedByUserId?: string;
  notes?: string;
  previousStatus?: ReconciliationCaseStatus;
  newStatus?: ReconciliationCaseStatus;
  timestamp: Date;
}

/**
 * Reconciliation Case for exception and manual intervention
 */
export interface ReconciliationCase {
  id: string;
  _id?: string;
  merchantId: string;
  paymentRequestId?: string;
  evidenceId?: string;
  evidenceIds?: string[];
  caseType: ReconciliationCaseType;
  severity: ReconciliationCaseSeverity;
  reason: string;
  status: ReconciliationCaseStatus;
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
  history?: ReconciliationHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Merchant Webhook Event Types
 */
export enum WebhookEventType {
  PAYMENT_CREATED = 'payment.created',
  PAYMENT_PARTIAL_SUCCESS = 'payment.partial_success',
  PAYMENT_SUCCESS = 'payment.success',
  PAYMENT_REVIEW_REQUIRED = 'payment.review_required',
  PAYMENT_RECONCILIATION_REQUIRED = 'payment.reconciliation_required',
  PAYMENT_EXPIRED = 'payment.expired',
  PAYMENT_LINK_CREATED = 'payment_link.created',
  PAYMENT_LINK_PAID = 'payment_link.paid',
  PAYMENT_LINK_REVOKED = 'payment_link.revoked',
  RECONCILIATION_CASE_CREATED = 'reconciliation.case_created',
  RECONCILIATION_CASE_UPDATED = 'reconciliation.case_updated',
  RECONCILIATION_CASE_RESOLVED = 'reconciliation.case_resolved',
}

/**
 * Payment Link Status
 */
export enum PaymentLinkStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

/**
 * Payment Link Entity
 */
export interface PaymentLink {
  id: string;
  _id?: string;
  merchantId: string;
  linkReference: string; // e.g. "plink_..."
  title: string;
  description?: string;
  amountPaise: number | null; // null => open / customer-defined amount
  currency: string; // 'INR'
  bankAccountId?: string | null;
  isReusable: boolean; // true = multiple payments allowed, false = single-use
  status: PaymentLinkStatus;
  expiresAt?: Date | string | null;
  paymentsCount: number;
  totalCollectedPaise: number;
  metadata?: Record<string, any>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * API Key Environment
 */
export enum ApiKeyEnvironment {
  PRODUCTION = 'PRODUCTION',
  SANDBOX = 'SANDBOX',
}

/**
 * API Key Scopes
 */
export enum ApiKeyScope {
  PAYMENTS_READ = 'payments:read',
  PAYMENTS_WRITE = 'payments:write',
  LINKS_READ = 'links:read',
  LINKS_WRITE = 'links:write',
  WEBHOOKS_READ = 'webhooks:read',
  WEBHOOKS_WRITE = 'webhooks:write',
  RECONCILIATION_READ = 'reconciliation:read',
  ALL = '*',
}

/**
 * API Key Entity (Stored redacted, raw secret NEVER persisted)
 */
export interface ApiKey {
  id: string;
  _id?: string;
  merchantId: string;
  name: string;
  keyId: string; // Public identifier: "rgs_live_..." or "rgs_test_..."
  keyPrefix: string;
  environment: ApiKeyEnvironment;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Webhook Endpoint Entity
 */
export interface WebhookEndpoint {
  id: string;
  _id?: string;
  merchantId: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  description?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * System and Merchant User Roles
 */
export enum UserRole {
  MERCHANT_ADMIN = 'MERCHANT_ADMIN',
  MERCHANT_STAFF = 'MERCHANT_STAFF',
  SYSTEM_ADMIN = 'SYSTEM_ADMIN'
}

/**
 * Platform Operations Configuration Entity
 */
export interface PlatformConfig {
  key: string;
  paymentExpirySeconds: number;
  evidenceMatchingWindowSeconds: number;
  reconciliationScheduleIntervalSeconds: number;
  webhookMaxRetries: number;
  webhookBackoffFactor: number;
  evidenceRetentionDays: number;
  rateLimitPerMinute: number;
  updatedBy?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/**
 * Immutable Audit Log Record
 */
export interface AuditLogEntry {
  id: string;
  _id?: string;
  merchantId?: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  createdAt: Date | string;
}

/**
 * Platform Overview Aggregate Metrics
 */
export interface PlatformOverviewMetrics {
  merchants: {
    total: number;
    active: number;
    suspended: number;
  };
  payments: {
    total: number;
    byStatus: Record<PaymentStatus, number>;
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



