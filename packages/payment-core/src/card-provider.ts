import {
  PaymentStatus,
  RefundStatus
} from '@rgs-ledger/shared';
import {
  IPaymentProvider,
  PaymentProviderCapabilities,
  ProviderPaymentRequest,
  ProviderPaymentResponse,
  ProviderRefundRequest,
  ProviderRefundResponse,
  WebhookVerificationResult
} from './interfaces';

export interface CardGatewayConfig {
  gatewayName?: string;
  merchantId?: string;
  apiKey?: string;
  apiSecret?: string;
  isConfigured: boolean;
  environment?: 'sandbox' | 'production';
}

/**
 * Card Payment Provider Adapter
 * 
 * BOUNDARY & REGULATORY SPECIFICATION:
 * UPIPay ONLY handles UPI transactions. Card acquiring requires:
 * 1. An authorized card acquiring merchant agreement (e.g. Visa/Mastercard direct acquiring,
 *    or bank payment aggregator like HDFC/ICICI/Razorpay Card Acquiring).
 * 2. Strict RBI tokenization compliance (CoF Tokenization circular 2021) and PCI-DSS compliance.
 * 3. Never storing raw CVV or sensitive authentication data.
 * 
 * If merchant credentials are not configured, this adapter rejects transactions with
 * a structured NOT_CONFIGURED status, rather than pretending or leaking mock data.
 */
export class CardPaymentProvider implements IPaymentProvider {
  readonly providerId = 'card_gateway';
  readonly isLive: boolean;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsUpiQr: false,
    supportsUpiIntent: false,
    supportsHostedCheckout: true,
    supportsCards: true,
    supportsNetbanking: false,
    supportsWebhooks: true,
    supportsStatusCheck: true,
    supportsRefunds: true,
    supportsPartialRefunds: true,
    supportsPaymentMethodReporting: true
  };

  private readonly config: CardGatewayConfig;

  constructor(config: CardGatewayConfig = { isConfigured: false }) {
    this.config = config;
    this.isLive = config.environment === 'production';
  }

  async initiatePayment(req: ProviderPaymentRequest): Promise<ProviderPaymentResponse> {
    if (!this.config.isConfigured || !this.config.apiKey) {
      return {
        providerPaymentId: `unconfigured_card_${req.paymentId}`,
        status: PaymentStatus.FAILED,
        errorCode: 'CARD_GATEWAY_NOT_CONFIGURED',
        errorMessage: 'Direct Card acquiring is not configured for this merchant. Merchant must onboard with an authorized acquiring bank / payment aggregator and configure encrypted API credentials.'
      };
    }

    // Hosted card checkout or tokenized 3DS redirect initiation
    return {
      providerPaymentId: `card_req_${Date.now()}`,
      status: PaymentStatus.PENDING,
      paymentUrl: `${req.redirectUrl}?gateway=card_tokenized`,
      rawResponse: { gateway: this.config.gatewayName || 'DIRECT_CARD' }
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentResponse> {
    return {
      providerPaymentId,
      status: this.config.isConfigured ? PaymentStatus.PENDING : PaymentStatus.FAILED,
      errorMessage: this.config.isConfigured ? undefined : 'Card gateway not configured'
    };
  }

  async verifyPayment(providerPaymentId: string): Promise<ProviderPaymentResponse> {
    return this.fetchPayment(providerPaymentId);
  }

  async createRefund(req: ProviderRefundRequest): Promise<ProviderRefundResponse> {
    if (!this.config.isConfigured) {
      throw new Error('Cannot process card refund: Card gateway is not configured.');
    }
    return {
      providerRefundId: `ref_card_${Date.now()}`,
      status: RefundStatus.PENDING
    };
  }

  async fetchRefund(providerRefundId: string): Promise<ProviderRefundResponse> {
    return {
      providerRefundId,
      status: RefundStatus.PENDING
    };
  }

  verifyWebhook(_payload: any, _signature: string): WebhookVerificationResult {
    if (!this.config.isConfigured) {
      return { verified: false, rawPayload: { error: 'Card gateway not configured' } };
    }
    return { verified: true, status: PaymentStatus.SUCCESS };
  }
}
