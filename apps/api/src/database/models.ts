import mongoose, { Schema } from 'mongoose';
import {
  PaymentStatus,
  EvidenceSource,
  EvidenceProvider,
  EvidenceChannel,
  EvidenceStatus,
  TransactionType,
  TemplateLifecycleStatus,
  ReconciliationCaseType,
  ReconciliationCaseSeverity,
  ReconciliationCaseStatus
} from '@rgs-ledger/shared-types';

/**
 * 1. Users Schema
 */
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', index: true },
    role: { type: String, enum: ['MERCHANT_ADMIN', 'MERCHANT_STAFF', 'SYSTEM_ADMIN'], default: 'MERCHANT_ADMIN' },
    status: { type: String, enum: ['ACTIVE', 'INVITED', 'SUSPENDED'], default: 'ACTIVE' },
    refreshTokenHash: { type: String },
    tokenFamily: { type: String }
  },
  { timestamps: true }
);

/**
 * 2. Merchants Schema
 */
const MerchantSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    upiConfig: {
      vpa: { type: String, required: true, index: true },
      businessName: { type: String, required: true },
      mcc: { type: String },
      isAcceptingPayments: { type: Boolean, default: true }
    },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'], default: 'ACTIVE' },
    disabledNotificationPackages: [{ type: String }],
    onboarding: {
      completed: { type: Boolean, default: false },
      currentStep: { type: String, default: 'business' },
      completedSteps: [{ type: String }],
      dismissedAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

/**
 * 2b. Merchant Bank Accounts Schema
 */
const MerchantBankAccountSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    bankName: { type: String, required: true },
    upiId: { type: String, required: true, index: true },
    accountNumberMasked: { type: String, required: true },
    accountSuffix: { type: String, required: true, index: true },
    accountHolderName: { type: String },
    notes: { type: String },
    emailEvidenceConfig: {
      expectedSenderEmails: [{ type: String }],
      expectedSenderDomains: [{ type: String }]
    },
    androidEvidenceConfig: {
      expectedPackageNames: [{ type: String }],
      appNames: [{ type: String }]
    },
    isActive: { type: Boolean, default: true, index: true },
    isDefault: { type: Boolean, default: false }
  },
  { timestamps: true }
);
MerchantBankAccountSchema.index({ merchantId: 1, upiId: 1 });
MerchantBankAccountSchema.index({ merchantId: 1, accountSuffix: 1 });
MerchantBankAccountSchema.index({ merchantId: 1, isActive: 1 });

/**
 * 3. Merchant Integrations Schema
 */
const MerchantIntegrationSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    type: { type: String, enum: ['GMAIL', 'OUTLOOK', 'SHOPIFY', 'WOOCOMMERCE', 'CUSTOM_API'], required: true, index: true },
    connectedEmail: { type: String },
    encryptedAccessToken: { type: String },
    encryptedRefreshToken: { type: String },
    tokenExpiresAt: { type: Date },
    scope: { type: String },
    status: {
      type: String,
      enum: ['CONNECTED', 'DISCONNECTED', 'ERROR', 'REVOKED'],
      default: 'CONNECTED',
      index: true
    },
    lastSyncAt: { type: Date },
    lastSyncStatus: {
      type: String,
      enum: ['NEVER', 'SUCCESS', 'FAILED', 'IN_PROGRESS'],
      default: 'NEVER'
    },
    lastSyncError: { type: String },
    lastHistoryId: { type: String },
    syncStats: {
      totalProcessed: { type: Number, default: 0 },
      newEvidenceCount: { type: Number, default: 0 },
      duplicatesCount: { type: Number, default: 0 }
    },
    config: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);
MerchantIntegrationSchema.index({ merchantId: 1, type: 1 }, { unique: true });

/**
 * 4. Payment Requests Schema
 */
const PaymentRequestSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    orderId: { type: String, required: true, index: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    description: { type: String },
    merchantVpa: { type: String, required: true },
    merchantName: { type: String, required: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'merchant_bank_accounts', index: true },
    bankName: { type: String },
    accountSuffix: { type: String },
    upiUri: { type: String, required: true },
    qrDataUrl: { type: String, required: true },
    checkoutReference: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      index: true
    },
    reviewReason: { type: String },
    evidenceSummary: {
      hasEmailEvidence: { type: Boolean, default: false },
      hasAndroidEvidence: { type: Boolean, default: false },
      emailEvidenceId: { type: Schema.Types.ObjectId, ref: 'payment_evidence' },
      androidEvidenceId: { type: Schema.Types.ObjectId, ref: 'payment_evidence' },
      utr: { type: String, index: true },
      matchedAmountPaise: { type: Number },
      verifiedAt: { type: Date }
    },
    paymentLinkRef: { type: String, index: true },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);
PaymentRequestSchema.index({ merchantId: 1, orderId: 1 }, { unique: true });
PaymentRequestSchema.index(
  { merchantId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } }
  }
);

/**
 * 5. Payment Evidence Schema
 */
const PaymentEvidenceSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    channel: { type: String, enum: Object.values(EvidenceChannel), required: true, index: true },
    provider: { type: String, enum: Object.values(EvidenceProvider), required: true, index: true },
    source: { type: String, enum: Object.values(EvidenceSource), required: true, index: true },
    providerMessageId: { type: String, required: true, index: true },
    senderOrPackage: { type: String, required: true, index: true },
    accountIdentifier: { type: String, default: null },
    transactionType: {
      type: String,
      enum: Object.values(TransactionType),
      default: TransactionType.CREDIT,
      index: true
    },
    amountPaise: { type: Number, required: true, index: true },
    currency: { type: String, default: 'INR' },
    utr: { type: String, index: true, default: null },
    payerVpa: { type: String },
    payerName: { type: String },
    receiverVpa: { type: String },
    bankReference: { type: String },
    transactionTimestamp: { type: Date, default: null },
    receivedAt: { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: Object.values(EvidenceStatus),
      default: EvidenceStatus.UNMATCHED,
      index: true
    },
    rejectionReason: { type: String },
    deduplicationHash: { type: String, required: true, index: true },
    rawPayloadHash: { type: String, required: true, index: true },
    encryptedRawPayload: { type: String },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'merchant_bank_accounts', index: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'evidence_templates' },
    templateVersion: { type: Number },
    matchedPaymentRequestId: { type: Schema.Types.ObjectId, ref: 'payment_requests' },
    matchedAt: { type: Date },
    capturedAt: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);
PaymentEvidenceSchema.index({ merchantId: 1, deduplicationHash: 1 }, { unique: true });
PaymentEvidenceSchema.index({ merchantId: 1, rawPayloadHash: 1 });
PaymentEvidenceSchema.index({ merchantId: 1, status: 1 });
PaymentEvidenceSchema.index({ merchantId: 1, utr: 1 });
PaymentEvidenceSchema.index({ merchantId: 1, amountPaise: 1, status: 1 });
PaymentEvidenceSchema.index({ merchantId: 1, provider: 1, providerMessageId: 1 });

/**
 * 6. Evidence Templates Schema (with Immutable Version History)
 */
const TemplateVersionHistorySchema = new Schema(
  {
    version: { type: Number, required: true },
    regexPattern: { type: String, required: true },
    fieldsMap: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: Object.values(TemplateLifecycleStatus), required: true },
    modifiedByUserId: { type: Schema.Types.ObjectId, ref: 'users' },
    changeReason: { type: String },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const EvidenceTemplateSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'merchant_bank_accounts', index: true },
    channel: { type: String, enum: Object.values(EvidenceChannel), required: true, index: true },
    provider: { type: String, enum: Object.values(EvidenceProvider) },
    senderIdentifier: { type: String, required: true, index: true },
    packageName: { type: String, index: true },
    senderHeader: { type: String, index: true },
    name: { type: String, required: true },
    description: { type: String },
    regexPattern: { type: String, required: true },
    fieldsMap: {
      amountPaiseExtractor: { type: String },
      utrExtractor: { type: String },
      accountExtractor: { type: String },
      transactionTimestampExtractor: { type: String },
      transactionTypeExtractor: { type: String }
    },
    samplePayload: { type: String },
    version: { type: Number, default: 1 },
    status: {
      type: String,
      enum: Object.values(TemplateLifecycleStatus),
      default: TemplateLifecycleStatus.DISCOVERED,
      index: true
    },
    isActive: { type: Boolean, default: false, index: true },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date },
    deactivatedAt: { type: Date },
    reactivatedAt: { type: Date },
    isImmutable: { type: Boolean, default: false },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: 'users' },
    approvedAt: { type: Date },
    history: [TemplateVersionHistorySchema]
  },
  { timestamps: true }
);
EvidenceTemplateSchema.index({ merchantId: 1, senderIdentifier: 1, channel: 1 });
EvidenceTemplateSchema.index({ merchantId: 1, status: 1 });
EvidenceTemplateSchema.index({ merchantId: 1, channel: 1, bankAccountId: 1, status: 1, isActive: 1 });
EvidenceTemplateSchema.index({ merchantId: 1, isArchived: 1 });

/**
 * 7. Evidence Ingestion Attempts Schema
 */
const EvidenceIngestionAttemptSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    channel: { type: String, enum: Object.values(EvidenceChannel), required: true },
    provider: { type: String, enum: Object.values(EvidenceProvider), required: true },
    providerMessageId: { type: String, required: true, index: true },
    idempotencyKey: { type: String, index: true },
    ipAddress: { type: String },
    status: { type: String, enum: ['SUCCESS', 'DUPLICATE', 'FAILED'], required: true, index: true },
    evidenceId: { type: Schema.Types.ObjectId, ref: 'payment_evidence' },
    errorMessage: { type: String },
    attemptedAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);
EvidenceIngestionAttemptSchema.index({ merchantId: 1, provider: 1, providerMessageId: 1 });
EvidenceIngestionAttemptSchema.index({ merchantId: 1, attemptedAt: -1 });

/**
 * 8. Payment Evidence Association Schema
 */
const PaymentEvidenceAssociationSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    paymentRequestId: { type: Schema.Types.ObjectId, ref: 'payment_requests', required: true, index: true },
    evidenceId: { type: Schema.Types.ObjectId, ref: 'payment_evidence', required: true, index: true },
    channel: { type: String, enum: Object.values(EvidenceChannel), required: true },
    provider: { type: String, enum: Object.values(EvidenceProvider), required: true },
    matchedUtr: { type: String, index: true },
    matchedAmountPaise: { type: Number, required: true },
    associatedAt: { type: Date, default: Date.now },
    associatedBy: { type: String, enum: ['AUTO_MATCH', 'MANUAL_RECONCILIATION'], default: 'AUTO_MATCH' }
  },
  { timestamps: true }
);
PaymentEvidenceAssociationSchema.index({ merchantId: 1, paymentRequestId: 1 });
PaymentEvidenceAssociationSchema.index({ merchantId: 1, evidenceId: 1 }, { unique: true });
PaymentEvidenceAssociationSchema.index({ paymentRequestId: 1, channel: 1 }, { unique: true });
PaymentEvidenceAssociationSchema.index({ merchantId: 1, matchedUtr: 1 });

/**
 * 9. Android Devices Schema
 */
const AndroidDeviceSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    deviceName: { type: String, required: true },
    deviceFingerprint: { type: String, required: true, unique: true },
    deviceTokenHash: { type: String, required: true, index: true },
    fcmToken: { type: String },
    androidVersion: { type: String },
    notificationAccessGranted: { type: Boolean, default: false },
    pendingUploadCount: { type: Number, default: 0 },
    lastSyncAt: { type: Date },
    lastError: { type: String },
    lastHeartbeatAt: { type: Date, default: Date.now },
    pairedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['PAIRED', 'UNPAIRED', 'SUSPENDED'], default: 'PAIRED', index: true }
  },
  { timestamps: true }
);
AndroidDeviceSchema.index({ merchantId: 1, status: 1 });
AndroidDeviceSchema.index({ deviceTokenHash: 1, status: 1 });

/**
 * 9b. Device Pairing Codes Schema (Rotating 8-character codes with expiration)
 */
const DevicePairingCodeSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    code: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    used: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

/**
 * 10. API Credentials Schema
 */
const ApiCredentialSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    name: { type: String, required: true },
    keyId: { type: String, required: true, unique: true, index: true },
    keyPrefix: { type: String, required: true },
    keyHash: { type: String }, // Legacy optional
    secretHash: { type: String, required: true },
    environment: { type: String, enum: ['PRODUCTION', 'SANDBOX'], default: 'PRODUCTION', index: true },
    scopes: [{ type: String }],
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);
ApiCredentialSchema.index({ merchantId: 1, isActive: 1 });

/**
 * 10b. Payment Links Schema
 */
const PaymentLinkSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    linkReference: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    amountPaise: { type: Number, default: null }, // null => open amount
    currency: { type: String, default: 'INR' },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'merchant_bank_accounts', index: true },
    isReusable: { type: Boolean, default: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'EXPIRED', 'REVOKED'], default: 'ACTIVE', index: true },
    expiresAt: { type: Date },
    paymentsCount: { type: Number, default: 0 },
    totalCollectedPaise: { type: Number, default: 0 },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);
PaymentLinkSchema.index({ merchantId: 1, status: 1 });
PaymentLinkSchema.index({ merchantId: 1, createdAt: -1 });

/**
 * 11. Webhook Endpoints Schema
 */
const WebhookEndpointSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    url: { type: String, required: true },
    secret: { type: String, required: true },
    events: [{ type: String }],
    description: { type: String },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

/**
 * 12. Webhook Events Schema
 */
const WebhookEventSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    eventType: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'DISPATCHED'], default: 'PENDING' }
  },
  { timestamps: true }
);

/**
 * 13. Webhook Deliveries Schema
 */
const WebhookDeliverySchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    endpointId: { type: Schema.Types.ObjectId, ref: 'webhook_endpoints', required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'webhook_events', required: true },
    eventType: { type: String },
    statusCode: { type: Number },
    responseStatusCode: { type: Number },
    responseBody: { type: String },
    errorMessage: { type: String },
    latencyMs: { type: Number },
    attempts: { type: Number, default: 1 },
    status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'DEAD_LETTER'], default: 'PENDING', index: true },
    nextRetryAt: { type: Date }
  },
  { timestamps: true }
);
WebhookDeliverySchema.index({ merchantId: 1, createdAt: -1 });

/**
 * 14. Reconciliation Cases Schema
 */
const ReconciliationHistoryEntrySchema = new Schema(
  {
    action: { type: String, required: true },
    performedByUserId: { type: Schema.Types.ObjectId, ref: 'users' },
    notes: { type: String },
    previousStatus: { type: String },
    newStatus: { type: String },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ReconciliationCaseSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', required: true, index: true },
    paymentRequestId: { type: Schema.Types.ObjectId, ref: 'payment_requests', index: true },
    evidenceId: { type: Schema.Types.ObjectId, ref: 'payment_evidence' },
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: 'payment_evidence' }],
    caseType: {
      type: String,
      enum: Object.values(ReconciliationCaseType),
      required: true,
      index: true
    },
    severity: {
      type: String,
      enum: Object.values(ReconciliationCaseSeverity),
      default: ReconciliationCaseSeverity.MEDIUM,
      index: true
    },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(ReconciliationCaseStatus),
      default: ReconciliationCaseStatus.OPEN,
      index: true
    },
    expectedAmountPaise: { type: Number },
    receivedAmountPaise: { type: Number },
    utr: { type: String, index: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'merchant_bank_accounts' },
    accountSuffix: { type: String },
    orderId: { type: String },
    checkoutReference: { type: String },
    hasEmailEvidence: { type: Boolean, default: false },
    hasAndroidEvidence: { type: Boolean, default: false },
    resolvedByUserId: { type: Schema.Types.ObjectId, ref: 'users' },
    resolutionNotes: { type: String },
    history: [ReconciliationHistoryEntrySchema]
  },
  { timestamps: true }
);
ReconciliationCaseSchema.index({ merchantId: 1, paymentRequestId: 1, caseType: 1, status: 1 });
ReconciliationCaseSchema.index({ merchantId: 1, status: 1 });
ReconciliationCaseSchema.index({ merchantId: 1, createdAt: -1 });

/**
 * 15. Background Jobs Schema (Durable Leases & Retries)
 */
const BackgroundJobSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    leaseToken: { type: String },
    leasedUntil: { type: Date, index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    lastError: { type: String },
    runAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

/**
 * 16. Transactional Outbox Events Schema
 */
const OutboxEventSchema = new Schema(
  {
    aggregateType: { type: String, required: true, index: true },
    aggregateId: { type: String, required: true, index: true },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['PENDING', 'PUBLISHED', 'FAILED'], default: 'PENDING', index: true }
  },
  { timestamps: true }
);

/**
 * 17. Audit Logs Schema
 */
const AuditLogSchema = new Schema(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'merchants', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'users', index: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    details: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

/**
 * 18. Platform Configuration Schema
 */
const PlatformConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    paymentExpirySeconds: { type: Number, default: 900 },
    evidenceMatchingWindowSeconds: { type: Number, default: 1800 },
    reconciliationScheduleIntervalSeconds: { type: Number, default: 60 },
    webhookMaxRetries: { type: Number, default: 5 },
    webhookBackoffFactor: { type: Number, default: 4 },
    evidenceRetentionDays: { type: Number, default: 90 },
    rateLimitPerMinute: { type: Number, default: 120 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'users' }
  },
  { timestamps: true }
);

// Exports
export const UserModel: mongoose.Model<any> = (mongoose.models.users as mongoose.Model<any>) || mongoose.model('users', UserSchema);
export const MerchantModel: mongoose.Model<any> = (mongoose.models.merchants as mongoose.Model<any>) || mongoose.model('merchants', MerchantSchema);
export const MerchantBankAccountModel: mongoose.Model<any> = (mongoose.models.merchant_bank_accounts as mongoose.Model<any>) || mongoose.model('merchant_bank_accounts', MerchantBankAccountSchema);
export const MerchantIntegrationModel: mongoose.Model<any> = (mongoose.models.merchant_integrations as mongoose.Model<any>) || mongoose.model('merchant_integrations', MerchantIntegrationSchema);
export const PaymentRequestModel: mongoose.Model<any> = (mongoose.models.payment_requests as mongoose.Model<any>) || mongoose.model('payment_requests', PaymentRequestSchema);
export const PaymentLinkModel: mongoose.Model<any> = (mongoose.models.payment_links as mongoose.Model<any>) || mongoose.model('payment_links', PaymentLinkSchema);
export const PaymentEvidenceModel: mongoose.Model<any> = (mongoose.models.payment_evidence as mongoose.Model<any>) || mongoose.model('payment_evidence', PaymentEvidenceSchema);
export const EvidenceTemplateModel: mongoose.Model<any> = (mongoose.models.evidence_templates as mongoose.Model<any>) || mongoose.model('evidence_templates', EvidenceTemplateSchema);
export const MessageTemplateModel: mongoose.Model<any> = EvidenceTemplateModel; // Backward compatibility alias
export const EvidenceIngestionAttemptModel: mongoose.Model<any> = (mongoose.models.evidence_ingestion_attempts as mongoose.Model<any>) || mongoose.model('evidence_ingestion_attempts', EvidenceIngestionAttemptSchema);
export const PaymentEvidenceAssociationModel: mongoose.Model<any> = (mongoose.models.payment_evidence_associations as mongoose.Model<any>) || mongoose.model('payment_evidence_associations', PaymentEvidenceAssociationSchema);
export const AndroidDeviceModel: mongoose.Model<any> = (mongoose.models.android_devices as mongoose.Model<any>) || mongoose.model('android_devices', AndroidDeviceSchema);
export const DevicePairingCodeModel: mongoose.Model<any> = (mongoose.models.device_pairing_codes as mongoose.Model<any>) || mongoose.model('device_pairing_codes', DevicePairingCodeSchema);
export const ApiCredentialModel: mongoose.Model<any> = (mongoose.models.api_credentials as mongoose.Model<any>) || mongoose.model('api_credentials', ApiCredentialSchema);
export const WebhookEndpointModel: mongoose.Model<any> = (mongoose.models.webhook_endpoints as mongoose.Model<any>) || mongoose.model('webhook_endpoints', WebhookEndpointSchema);
export const WebhookEventModel: mongoose.Model<any> = (mongoose.models.webhook_events as mongoose.Model<any>) || mongoose.model('webhook_events', WebhookEventSchema);
export const WebhookDeliveryModel: mongoose.Model<any> = (mongoose.models.webhook_deliveries as mongoose.Model<any>) || mongoose.model('webhook_deliveries', WebhookDeliverySchema);
export const ReconciliationCaseModel: mongoose.Model<any> = (mongoose.models.reconciliation_cases as mongoose.Model<any>) || mongoose.model('reconciliation_cases', ReconciliationCaseSchema);
export const BackgroundJobModel: mongoose.Model<any> = (mongoose.models.background_jobs as mongoose.Model<any>) || mongoose.model('background_jobs', BackgroundJobSchema);
export const OutboxEventModel: mongoose.Model<any> = (mongoose.models.outbox_events as mongoose.Model<any>) || mongoose.model('outbox_events', OutboxEventSchema);
export const AuditLogModel: mongoose.Model<any> = (mongoose.models.audit_logs as mongoose.Model<any>) || mongoose.model('audit_logs', AuditLogSchema);
export const PlatformConfigModel: mongoose.Model<any> = (mongoose.models.platform_configs as mongoose.Model<any>) || mongoose.model('platform_configs', PlatformConfigSchema);

/**
 * 16. Contact Submissions Schema (Support & Inquiries)
 */
const ContactSubmissionSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['NEW', 'RESOLVED', 'SPAM'], default: 'NEW', index: true },
    ipAddress: { type: String }
  },
  { timestamps: true }
);

export const ContactSubmissionModel: mongoose.Model<any> =
  (mongoose.models.contact_submissions as mongoose.Model<any>) ||
  mongoose.model('contact_submissions', ContactSubmissionSchema);

/**
 * Defensive query builder for MongoDB documents supporting both BSON ObjectId
 * and BSON UTF-8 String representations of `_id`.
 */
export function flexibleIdQuery(id: any) {
  if (!id) return { _id: null };
  const str = id.toString();
  if (mongoose.Types.ObjectId.isValid(str)) {
    return {
      $or: [
        { _id: str },
        { _id: new mongoose.Types.ObjectId(str) }
      ]
    };
  }
  return { _id: str };
}

/**
 * Defensively retrieves a merchant profile by ID, matching either ObjectId or String `_id`.
 */
export async function findMerchantByIdDefensive(merchantId: string): Promise<any> {
  if (!merchantId) return null;
  try {
    const fromModel = await MerchantModel.findById(merchantId).lean();
    if (fromModel) return fromModel;
  } catch {}
  return mongoose.connection.collection('merchants').findOne(flexibleIdQuery(merchantId));
}

/**
 * Defensively retrieves a user record by ID, matching either ObjectId or String `_id`.
 */
export async function findUserByIdDefensive(userId: string): Promise<any> {
  if (!userId) return null;
  try {
    const fromModel = await UserModel.findById(userId).lean();
    if (fromModel) return fromModel;
  } catch {}
  return mongoose.connection.collection('users').findOne(flexibleIdQuery(userId));
}
