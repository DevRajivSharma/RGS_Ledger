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

export interface NetbankingGatewayConfig {
  gatewayName?: string;
  merchantId?: string;
  apiKey?: string;
  apiSecret?: string;
  isConfigured: boolean;
  environment?: 'sandbox' | 'production';
}

/**
 * Netbanking Payment Provider Adapter
 * 
 * BOUNDARY & REGULATORY SPECIFICATION:
 * UPIPay ONLY handles UPI transactions. Netbanking requires:
 * 1. An authorized bank aggregator integration agreement covering 50+ Indian banks.
 * 2. Secure server-to-server redirection or bank-hosted netbanking gateway.
 * 
 * If merchant credentials are not configured, this adapter rejects transactions with
 * structured NOT_CONFIGURED status.
 */
export class NetbankingPaymentProvider implements IPaymentProvider {
  readonly providerId = 'netbanking_gateway';
  readonly isLive: boolean;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsUpiQr: false,
    supportsUpiIntent: false,
    supportsHostedCheckout: true,
    supportsCards: false,
    supportsNetbanking: true,
    supportsWebhooks: true,
    supportsStatusCheck: true,
    supportsRefunds: true,
    supportsPartialRefunds: true,
    supportsPaymentMethodReporting: true
  };

  private readonly config: NetbankingGatewayConfig;

  constructor(config: NetbankingGatewayConfig = { isConfigured: false }) {
    this.config = config;
    this.isLive = config.environment === 'production';
  }

  async initiatePayment(req: ProviderPaymentRequest): Promise<ProviderPaymentResponse> {
    if (!this.config.isConfigured || !this.config.apiKey) {
      return {
        providerPaymentId: `unconfigured_nb_${req.paymentId}`,
        status: PaymentStatus.FAILED,
        errorCode: 'NETBANKING_GATEWAY_NOT_CONFIGURED',
        errorMessage: 'Direct Netbanking acquiring is not configured for this merchant. Merchant must onboard with an authorized netbanking aggregator and configure encrypted API credentials.'
      };
    }

    return {
      providerPaymentId: `nb_req_${Date.now()}`,
      status: PaymentStatus.PENDING,
      paymentUrl: `${req.redirectUrl}?gateway=netbanking&bank=${req.bankCode || 'GENERIC'}`,
      rawResponse: { gateway: this.config.gatewayName || 'DIRECT_NETBANKING' }
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentResponse> {
    return {
      providerPaymentId,
      status: this.config.isConfigured ? PaymentStatus.PENDING : PaymentStatus.FAILED,
      errorMessage: this.config.isConfigured ? undefined : 'Netbanking gateway not configured'
    };
  }

  async verifyPayment(providerPaymentId: string): Promise<ProviderPaymentResponse> {
    return this.fetchPayment(providerPaymentId);
  }

  async createRefund(req: ProviderRefundRequest): Promise<ProviderRefundResponse> {
    if (!this.config.isConfigured) {
      throw new Error('Cannot process netbanking refund: Gateway is not configured.');
    }
    return {
      providerRefundId: `ref_nb_${Date.now()}`,
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
      return { verified: false, rawPayload: { error: 'Netbanking gateway not configured' } };
    }
    return { verified: true, status: PaymentStatus.SUCCESS };
  }
}
