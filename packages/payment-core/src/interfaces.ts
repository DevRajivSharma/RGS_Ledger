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

export interface ProviderPaymentRequest {
  paymentId: string;
  orderId: string;
  amount: number; // in paise
  currency: string;
  method: PaymentMethodType;
  upiId?: string;
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
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: Record<string, any>;
}

export interface ProviderRefundRequest {
  refundId: string;
  paymentId: string;
  providerPaymentId: string;
  amount: number; // in paise
  currency: string;
  reason: string;
}

export interface ProviderRefundResponse {
  providerRefundId: string;
  status: RefundStatus;
  rawResponse?: Record<string, any>;
}

export interface IPaymentProvider {
  readonly providerId: string;
  readonly isLive: boolean;

  createOrder(req: ProviderOrderRequest): Promise<ProviderOrderResponse>;
  initiatePayment(req: ProviderPaymentRequest): Promise<ProviderPaymentResponse>;
  fetchPayment(providerPaymentId: string): Promise<ProviderPaymentResponse>;
  verifyPayment(providerPaymentId: string): Promise<ProviderPaymentResponse>;
  createRefund(req: ProviderRefundRequest): Promise<ProviderRefundResponse>;
  fetchRefund(providerRefundId: string): Promise<ProviderRefundResponse>;
  verifyWebhook(payload: string, signature: string, secret: string): boolean;
}
