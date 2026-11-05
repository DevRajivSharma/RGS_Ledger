import mongoose, { Schema } from 'mongoose';
import {
  UserRole,
  KycStatus,
  BusinessType,
  OrderStatus,
  PaymentStatus,
  PaymentMethodType,
  RefundStatus,
  SettlementStatus,
  ReconciliationStatus,
  EnvironmentMode,
  WebhookEventName,
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerTransactionType,
  DisputeStatus
} from '@rgs-ledger/shared';

// -----------------------------------------------------------------------------
// USER MODEL
// -----------------------------------------------------------------------------
export interface IUser {
  _id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string;
  role: UserRole;
  merchantId?: string;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  role: { type: String, enum: Object.values(UserRole), default: UserRole.MERCHANT_OWNER, index: true },
  merchantId: { type: String, index: true },
  isEmailVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date }
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);

// -----------------------------------------------------------------------------
// MERCHANT MODEL
// -----------------------------------------------------------------------------
export interface IMerchant {
  _id: string;
  businessName: string;
  businessType: BusinessType;
  country: string;
  website?: string;
  kycStatus: KycStatus;
  environmentMode: EnvironmentMode;
  isActive: boolean;
  panNumber?: string;
  gstin?: string;
  bankAccount?: {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    bankName: string;
  };
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  kycReviewNote?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const MerchantSchema = new Schema<IMerchant>({
  _id: { type: String, required: true },
  businessName: { type: String, required: true, trim: true },
  businessType: { type: String, enum: Object.values(BusinessType), default: BusinessType.PROPRIETORSHIP },
  country: { type: String, default: 'IN' },
  website: { type: String },
  kycStatus: { type: String, enum: Object.values(KycStatus), default: KycStatus.NOT_STARTED, index: true },
  environmentMode: { type: String, enum: Object.values(EnvironmentMode), default: EnvironmentMode.SANDBOX },
  isActive: { type: Boolean, default: true },
  panNumber: { type: String },
  gstin: { type: String },
  bankAccount: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String
  },
  address: {
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'IN' }
  },
  kycReviewNote: { type: String }
}, { timestamps: true });

export const Merchant = mongoose.model<IMerchant>('Merchant', MerchantSchema);

// -----------------------------------------------------------------------------
// API KEY MODEL
// -----------------------------------------------------------------------------
export interface IApiKey {
  _id: string;
  merchantId: string;
  name: string;
  keyId: string; // rl_test_pk_...
  hashedSecret: string; // sha256 hash of rl_test_sk_...
  prefix: string; // rl_test_sk_xxxx
  environment: EnvironmentMode;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt?: Date;
}

const ApiKeySchema = new Schema<IApiKey>({
  _id: { type: String, required: true },
  merchantId: { type: String, required: true, index: true },
  name: { type: String, default: 'Default API Key' },
  keyId: { type: String, required: true, unique: true, index: true },
  hashedSecret: { type: String, required: true, index: true },
  prefix: { type: String, required: true },
  environment: { type: String, enum: Object.values(EnvironmentMode), default: EnvironmentMode.SANDBOX },
  isActive: { type: Boolean, default: true },
  lastUsedAt: { type: Date }
}, { timestamps: true });

export const ApiKey = mongoose.model<IApiKey>('ApiKey', ApiKeySchema);

// -----------------------------------------------------------------------------
// ORDER MODEL
// -----------------------------------------------------------------------------
export interface IOrder {
  _id: string;
  merchantId: string;
  amount: number; // in paise (integer)
  currency: string;
  status: OrderStatus;
  receipt?: string;
  notes?: Record<string, string>;
  customer?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  attemptsCount: number;
  amountPaid: number;
  amountRefunded: number;
  environment: EnvironmentMode;
  createdAt?: Date;
  updatedAt?: Date;
}

const OrderSchema = new Schema<IOrder>({
  _id: { type: String, required: true },
  merchantId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 100 },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: Object.values(OrderStatus), default: OrderStatus.CREATED, index: true },
  receipt: { type: String },
  notes: { type: Map, of: String },
  customer: {
    id: String,
    name: String,
    email: String,
    phone: String
  },
  attemptsCount: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  amountRefunded: { type: Number, default: 0 },
  environment: { type: String, enum: Object.values(EnvironmentMode), default: EnvironmentMode.SANDBOX, index: true }
}, { timestamps: true });

OrderSchema.index({ merchantId: 1, createdAt: -1 });

export const Order = mongoose.model<IOrder>('Order', OrderSchema);

// -----------------------------------------------------------------------------
// PAYMENT MODEL
// -----------------------------------------------------------------------------
export interface IPayment {
  _id: string;
  orderId: string;
  merchantId: string;
  amount: number; // in paise
  currency: string;
  status: PaymentStatus;
  method: PaymentMethodType;
  upiId?: string;
  cardNetwork?: string;
  cardLast4?: string;
  bankCode?: string;
  providerPaymentId?: string;
  errorCode?: string;
  errorDescription?: string;
  environment: EnvironmentMode;
  capturedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const PaymentSchema = new Schema<IPayment>({
  _id: { type: String, required: true },
  orderId: { type: String, required: true, index: true },
  merchantId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.CREATED, index: true },
  method: { type: String, enum: Object.values(PaymentMethodType), required: true },
  upiId: { type: String },
  cardNetwork: { type: String },
  cardLast4: { type: String },
  bankCode: { type: String },
  providerPaymentId: { type: String, index: true },
  errorCode: { type: String },
  errorDescription: { type: String },
  environment: { type: String, enum: Object.values(EnvironmentMode), default: EnvironmentMode.SANDBOX, index: true },
  capturedAt: { type: Date }
}, { timestamps: true });

PaymentSchema.index({ merchantId: 1, createdAt: -1 });
PaymentSchema.index({ merchantId: 1, status: 1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);

// -----------------------------------------------------------------------------
// REFUND MODEL
// -----------------------------------------------------------------------------
export interface IRefund {
  _id: string;
  paymentId: string;
  orderId: string;
  merchantId: string;
  amount: number; // in paise
  currency: string;
  status: RefundStatus;
  reason: string;
  providerRefundId?: string;
  notes?: Record<string, string>;
  environment: EnvironmentMode;
  createdAt?: Date;
  updatedAt?: Date;
}

const RefundSchema = new Schema<IRefund>({
  _id: { type: String, required: true },
  paymentId: { type: String, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  merchantId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: Object.values(RefundStatus), default: RefundStatus.CREATED, index: true },
  reason: { type: String, required: true },
  providerRefundId: { type: String },
  notes: { type: Map, of: String },
  environment: { type: String, enum: Object.values(EnvironmentMode), default: EnvironmentMode.SANDBOX }
}, { timestamps: true });

RefundSchema.index({ merchantId: 1, createdAt: -1 });

export const Refund = mongoose.model<IRefund>('Refund', RefundSchema);

// -----------------------------------------------------------------------------
// CHECKOUT SESSION MODEL
// -----------------------------------------------------------------------------
export interface ICheckoutSession {
  _id: string;
  orderId: string;
  merchantId: string;
  paymentId?: string;
  amount: number;
  currency: string;
  status: 'OPEN' | 'COMPLETED' | 'EXPIRED';
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  createdAt?: Date;
}

const CheckoutSessionSchema = new Schema<ICheckoutSession>({
  _id: { type: String, required: true },
  orderId: { type: String, required: true, index: true },
  merchantId: { type: String, required: true, index: true },
  paymentId: { type: String, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['OPEN', 'COMPLETED', 'EXPIRED'], default: 'OPEN', index: true },
  successUrl: { type: String, required: true },
  cancelUrl: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

export const CheckoutSession = mongoose.model<ICheckoutSession>('CheckoutSession', CheckoutSessionSchema);

// -----------------------------------------------------------------------------
// PAYMENT LINK MODEL
// -----------------------------------------------------------------------------
export interface IPaymentLink {
  _id: string;
  merchantId: string;
  orderId: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  status: 'ACTIVE' | 'PAID' | 'EXPIRED' | 'DEACTIVATED';
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  expireBy?: Date;
  createdAt?: Date;
}

const PaymentLinkSchema = new Schema<IPaymentLink>({
  _id: { type: String, required: true },
  merchantId: { type: String, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['ACTIVE', 'PAID', 'EXPIRED', 'DEACTIVATED'], default: 'ACTIVE', index: true },
  customer: {
    name: String,
    email: String,
    phone: String
  },
  expireBy: { type: Date }
}, { timestamps: true });

PaymentLinkSchema.index({ merchantId: 1, createdAt: -1 });

export const PaymentLink = mongoose.model<IPaymentLink>('PaymentLink', PaymentLinkSchema);

// -----------------------------------------------------------------------------
// CUSTOMER MODEL
// -----------------------------------------------------------------------------
export interface ICustomer {
  _id: string;
  merchantId: string;
  name: string;
  email?: string;
  phone?: string;
  totalPaymentsPaise: number;
  paymentsCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const CustomerSchema = new Schema<ICustomer>({
  _id: { type: String, required: true },
  merchantId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  totalPaymentsPaise: { type: Number, default: 0 },
  paymentsCount: { type: Number, default: 0 }
}, { timestamps: true });

CustomerSchema.index({ merchantId: 1, email: 1 });
CustomerSchema.index({ merchantId: 1, createdAt: -1 });

export const Customer = mongoose.model<ICustomer>('Customer', CustomerSchema);

// -----------------------------------------------------------------------------
// WEBHOOK ENDPOINT & DELIVERIES
// -----------------------------------------------------------------------------
export interface IWebhookEndpoint {
  _id: string;
  merchantId: string;
  url: string;
  events: WebhookEventName[];
  secretKey: string;
  isActive: boolean;
  createdAt?: Date;
}

const WebhookEndpointSchema = new Schema<IWebhookEndpoint>({
  _id: { type: String, required: true },
  merchantId: { type: String, required: true, index: true },
  url: { type: String, required: true },
  events: [{ type: String, enum: Object.values(WebhookEventName) }],
  secretKey: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const WebhookEndpoint = mongoose.model<IWebhookEndpoint>('WebhookEndpoint', WebhookEndpointSchema);

export interface IWebhookDelivery {
  _id: string;
  merchantId: string;
  endpointId: string;
  event: WebhookEventName;
  payload: Record<string, any>;
  statusCode?: number;
  responseBody?: string;
  attemptNumber: number;
  isSuccessful: boolean;
  nextRetryAt?: Date;
  createdAt?: Date;
}

const WebhookDeliverySchema = new Schema<IWebhookDelivery>({
  _id: { type: String, required: true },
  merchantId: { type: String, required: true, index: true },
  endpointId: { type: String, required: true, index: true },
  event: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  statusCode: { type: Number },
  responseBody: { type: String },
  attemptNumber: { type: Number, default: 1 },
  isSuccessful: { type: Boolean, default: false, index: true },
  nextRetryAt: { type: Date }
}, { timestamps: true });

WebhookDeliverySchema.index({ endpointId: 1, createdAt: -1 });

export const WebhookDelivery = mongoose.model<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema);

// -----------------------------------------------------------------------------
// FINANCIAL LEDGER MODELS (Double Entry)
// -----------------------------------------------------------------------------
export interface ILedgerAccount {
  code: string;
  merchantId?: string;
  name: string;
  type: LedgerAccountType;
  currency: string;
  balanceMinor: number;
  isActive: boolean;
  createdAt?: Date;
}

const LedgerAccountSchema = new Schema<ILedgerAccount>({
  code: { type: String, required: true, unique: true, index: true },
  merchantId: { type: String, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: Object.values(LedgerAccountType), required: true },
  currency: { type: String, default: 'INR' },
  balanceMinor: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const LedgerAccount = mongoose.model<ILedgerAccount>('LedgerAccount', LedgerAccountSchema);

export interface ILedgerTransaction {
  _id: string;
  merchantId: string;
  type: LedgerTransactionType;
  referenceId: string;
  currency: string;
  description: string;
  createdAt?: Date;
}

const LedgerTransactionSchema = new Schema<ILedgerTransaction>({
  _id: { type: String, required: true },
  merchantId: { type: String, required: true, index: true },
  type: { type: String, enum: Object.values(LedgerTransactionType), required: true, index: true },
  referenceId: { type: String, required: true, index: true },
  currency: { type: String, default: 'INR' },
  description: { type: String, required: true }
}, { timestamps: true });

export const LedgerTransaction = mongoose.model<ILedgerTransaction>('LedgerTransaction', LedgerTransactionSchema);

export interface ILedgerEntry {
  _id: string;
  transactionId: string;
  accountCode: string;
  direction: LedgerEntryDirection;
  amountMinor: number; // in paise
  description: string;
  createdAt?: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>({
  _id: { type: String, required: true },
  transactionId: { type: String, required: true, index: true },
  accountCode: { type: String, required: true, index: true },
  direction: { type: String, enum: Object.values(LedgerEntryDirection), required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  description: { type: String, required: true }
}, { timestamps: true });

export const LedgerEntry = mongoose.model<ILedgerEntry>('LedgerEntry', LedgerEntrySchema);

// -----------------------------------------------------------------------------
// SETTLEMENT MODEL
// -----------------------------------------------------------------------------
export interface ISettlement {
  _id: string;
  merchantId: string;
  grossAmount: number;
  feeAmount: number;
  taxAmount: number;
  netAmount: number;
  currency: string;
  status: SettlementStatus;
  settlementReference: string;
  payoutDate?: Date;
  bankAccountLast4?: string;
  createdAt?: Date;
}

const SettlementSchema = new Schema<ISettlement>({
  _id: { type: String, required: true },
  merchantId: { type: String, required: true, index: true },
  grossAmount: { type: Number, required: true },
  feeAmount: { type: Number, required: true },
  taxAmount: { type: Number, required: true },
  netAmount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: Object.values(SettlementStatus), default: SettlementStatus.PENDING, index: true },
  settlementReference: { type: String, required: true, unique: true },
  payoutDate: { type: Date },
  bankAccountLast4: { type: String }
}, { timestamps: true });

SettlementSchema.index({ merchantId: 1, createdAt: -1 });

export const Settlement = mongoose.model<ISettlement>('Settlement', SettlementSchema);

// -----------------------------------------------------------------------------
// AUDIT LOG MODEL
// -----------------------------------------------------------------------------
export interface IAuditLog {
  _id: string;
  actorId: string;
  actorEmail: string;
  actorRole: UserRole;
  merchantId?: string;
  action: string;
  targetEntity: string;
  targetId: string;
  ipAddress?: string;
  userAgent?: string;
  changes?: Record<string, any>;
  createdAt?: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  _id: { type: String, required: true },
  actorId: { type: String, required: true, index: true },
  actorEmail: { type: String, required: true },
  actorRole: { type: String, required: true },
  merchantId: { type: String, index: true },
  action: { type: String, required: true, index: true },
  targetEntity: { type: String, required: true },
  targetId: { type: String, required: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  changes: { type: Schema.Types.Mixed }
}, { timestamps: true });

AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

// -----------------------------------------------------------------------------
// IDEMPOTENCY RECORD MODEL
// -----------------------------------------------------------------------------
export interface IIdempotencyRecord {
  key: string;
  merchantId: string;
  endpoint: string;
  requestHash: string;
  statusCode: number;
  responseBody: Record<string, any>;
  createdAt?: Date;
}

const IdempotencyRecordSchema = new Schema<IIdempotencyRecord>({
  key: { type: String, required: true },
  merchantId: { type: String, required: true },
  endpoint: { type: String, required: true },
  requestHash: { type: String, required: true },
  statusCode: { type: Number, required: true },
  responseBody: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // 24h TTL
});

IdempotencyRecordSchema.index({ key: 1, merchantId: 1 }, { unique: true });

export const IdempotencyRecord = mongoose.model<IIdempotencyRecord>('IdempotencyRecord', IdempotencyRecordSchema);

// -----------------------------------------------------------------------------
// PROVIDER CONFIG MODEL
// -----------------------------------------------------------------------------
export interface IProviderConfig {
  providerId: string;
  name: string;
  isEnabled: boolean;
  isSandbox: boolean;
  priority: number;
  config: Record<string, any>;
}

const ProviderConfigSchema = new Schema<IProviderConfig>({
  providerId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  isEnabled: { type: Boolean, default: true },
  isSandbox: { type: Boolean, default: true },
  priority: { type: Number, default: 1 },
  config: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export const ProviderConfig = mongoose.model<IProviderConfig>('ProviderConfig', ProviderConfigSchema);
