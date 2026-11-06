import {
  PaymentMethodType,
  PaymentStatus,
  RefundStatus
} from '@rgs-ledger/shared';

export interface ProviderOrderRequest {
  orderId: string;
  amount: number; // in paise
  currency: string;
  receipt?: string;
  merchantName: string;
}

export interface ProviderOrderResponse {
  providerOrderId: string;
  status: string;
  rawResponse?: Record<string, any>;
}

export interface PaymentProviderCapabilities {
  supportsUpiQr: boolean;
  supportsUpiIntent: boolean;
  supportsHostedCheckout: boolean;
  supportsCards: boolean;
  supportsNetbanking: boolean;
  supportsWebhooks: boolean;
  supportsStatusCheck: boolean;
  supportsRefunds: boolean;
  supportsPartialRefunds: boolean;
  supportsPaymentMethodReporting: boolean;
}

export interface ProviderPaymentRequest {
  paymentId: string;
  orderId: string;
  merchantId?: string;
  amount: number; // in paise
  currency: string;
  method: PaymentMethodType;
  upiId?: string;
  merchantVpa?: string;
  merchantName?: string;
  callbackUrl?: string;
  redirectUrl?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
  idempotencyKey?: string;
  cardDetails?: {
    cardNumber: string;
    expMonth: number;
    expYear: number;
    cvv: string;
    holderName: string;
  };
  bankCode?: string;
  customerIp?: string;
  metadata?: Record<string, any>;
}

export interface ProviderPaymentResponse {
  providerPaymentId: string;
  status: PaymentStatus;
  paymentUrl?: string;
  upiUri?: string;
  qrImage?: string;
  providerTransactionId?: string;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: Record<string, any>;
}

export interface ProviderRefundRequest {
  refundId: string;
  paymentId: string;
  providerPaymentId?: string;
  amount: number; // in paise
  currency: string;
  reason: string;
}

export interface ProviderRefundResponse {
  providerRefundId: string;
  status: RefundStatus;
  rawResponse?: Record<string, any>;
}

export interface WebhookVerificationResult {
  verified: boolean;
  status?: PaymentStatus;
  orderId?: string;
  transactionId?: string;
  amount?: number; // in paise
  rawPayload?: any;
}

export interface IPaymentProvider {
  readonly providerId: string;
  readonly isLive: boolean;
  readonly capabilities: PaymentProviderCapabilities;

  createOrder?(req: ProviderOrderRequest): Promise<ProviderOrderResponse>;
  initiatePayment(req: ProviderPaymentRequest): Promise<ProviderPaymentResponse>;
  fetchPayment(providerPaymentId: string): Promise<ProviderPaymentResponse>;
  verifyPayment(providerPaymentId: string, expectedAmountPaise?: number): Promise<ProviderPaymentResponse>;
  createRefund(req: ProviderRefundRequest): Promise<ProviderRefundResponse>;
  fetchRefund(providerRefundId: string): Promise<ProviderRefundResponse>;
  verifyWebhook(payload: string | Buffer | Record<string, any>, signature: string, secret?: string, options?: any): WebhookVerificationResult | boolean;
}
