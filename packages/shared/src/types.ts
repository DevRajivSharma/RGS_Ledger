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
} from './enums';

export interface UserDTO {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  merchantId?: string;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface MerchantDTO {
  id: string;
  businessName: string;
  businessType: BusinessType;
  country: string;
  website?: string;
  kycStatus: KycStatus;
  environmentMode: EnvironmentMode;
  isActive: boolean;
  createdAt: string;
}

export interface OrderDTO {
  id: string;
  merchantId: string;
  amount: number; // in paise
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
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDTO {
  id: string;
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
  errorCode?: string;
  errorDescription?: string;
  providerPaymentId?: string;
  capturedAt?: string;
  createdAt: string;
}

export interface RefundDTO {
  id: string;
  paymentId: string;
  orderId: string;
  merchantId: string;
  amount: number; // in paise
  currency: string;
  status: RefundStatus;
  reason: string;
  providerRefundId?: string;
  createdAt: string;
}

export interface PaymentLinkDTO {
  id: string;
  merchantId: string;
  orderId: string;
  title: string;
  description?: string;
  amount: number; // in paise
  currency: string;
  url: string;
  shortUrl: string;
  status: 'ACTIVE' | 'PAID' | 'EXPIRED' | 'DEACTIVATED';
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  expireBy?: string;
  createdAt: string;
}

export interface CheckoutSessionDTO {
  id: string;
  orderId: string;
  merchantId: string;
  amount: number;
  currency: string;
  businessName: string;
  status: 'OPEN' | 'COMPLETED' | 'EXPIRED';
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
  upiUri?: string;
}

export interface SettlementDTO {
  id: string;
  merchantId: string;
  grossAmount: number; // in paise
  feeAmount: number;   // in paise
  taxAmount: number;   // in paise
  netAmount: number;   // in paise
  currency: string;
  status: SettlementStatus;
  settlementReference: string;
  payoutDate?: string;
  createdAt: string;
}

export interface WebhookEndpointDTO {
  id: string;
  merchantId: string;
  url: string;
  events: WebhookEventName[];
  secretKeyPreview: string;
  isActive: boolean;
  createdAt: string;
}

export interface WebhookDeliveryDTO {
  id: string;
  endpointId: string;
  event: WebhookEventName;
  statusCode?: number;
  responseBody?: string;
  attemptNumber: number;
  isSuccessful: boolean;
  nextRetryAt?: string;
  createdAt: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
