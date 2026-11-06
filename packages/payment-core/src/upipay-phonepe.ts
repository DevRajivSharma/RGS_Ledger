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
import { UPIPay, PhonePeAdapter } from 'upipay';

export interface PhonePeProviderConfig {
  merchantId: string;
  saltKey: string;
  saltIndex: string;
  environment: 'sandbox' | 'production';
}

/**
 * Mechanism B: Automated UPI PSP via PhonePe Business
 * 
 * Provides automated server-to-server payments:
 * 1. Initiates hosted UPI payment session via PhonePe API.
 * 2. Authenticates server-to-server webhook callbacks with X-VERIFY checksum.
 * 3. Authoritatively queries PhonePe Status API with expectedAmount check.
 * 4. Initiates full and partial refunds via /pg/v1/refund.
 */
export class UPIPayPhonePeProvider implements IPaymentProvider {
  readonly providerId = 'upipay_phonepe';
  readonly isLive: boolean;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsUpiQr: true,
    supportsUpiIntent: true,
    supportsHostedCheckout: true,
    supportsCards: false, // UPIPay is UPI-only
    supportsNetbanking: false,
    supportsWebhooks: true,
    supportsStatusCheck: true,
    supportsRefunds: true,
    supportsPartialRefunds: true,
    supportsPaymentMethodReporting: true
  };

  private readonly client: UPIPay;
  private readonly adapter: PhonePeAdapter;
  private readonly config: PhonePeProviderConfig;

  constructor(config: PhonePeProviderConfig) {
    if (!config.merchantId || !config.saltKey || !config.saltIndex) {
      throw new Error('PhonePe provider requires merchantId, saltKey, and saltIndex');
    }
    this.config = config;
    this.isLive = config.environment === 'production';

    this.client = new UPIPay({
      provider: 'phonepe',
      environment: config.environment,
      credentials: {
        merchantId: config.merchantId,
        saltKey: config.saltKey,
        saltIndex: config.saltIndex
      }
    });

    this.adapter = new PhonePeAdapter(
      {
        merchantId: config.merchantId,
        saltKey: config.saltKey,
        saltIndex: config.saltIndex
      },
      config.environment
    );
  }

  async initiatePayment(req: ProviderPaymentRequest): Promise<ProviderPaymentResponse> {
    if (!req.callbackUrl || !req.redirectUrl) {
      throw new Error('callbackUrl and redirectUrl are required for PhonePe hosted payment initiation');
    }

    try {
      const resp = await this.client.createPayment({
        amount: req.amount, // in paise
        orderId: req.orderId,
        customerPhone: req.customerPhone || '9999999999',
        customerName: req.customerName,
        customerEmail: req.customerEmail,
        callbackUrl: req.callbackUrl,
        redirectUrl: req.redirectUrl,
        idempotencyKey: req.idempotencyKey
      });

      return {
        providerPaymentId: resp.providerTransactionId || `pp_${req.orderId}`,
        status: PaymentStatus.PENDING,
        paymentUrl: resp.paymentUrl,
        rawResponse: resp.rawResponse as Record<string, any>
      };
    } catch (err: any) {
      return {
        providerPaymentId: `err_${Date.now()}`,
        status: PaymentStatus.FAILED,
        errorCode: err.code || 'PHONEPE_INITIATE_FAILED',
        errorMessage: err.message
      };
    }
  }

  async fetchPayment(orderId: string): Promise<ProviderPaymentResponse> {
    return this.verifyPayment(orderId);
  }

  /**
   * Authoritative status check against PhonePe Status API
   */
  async verifyPayment(orderId: string, expectedAmountPaise?: number): Promise<ProviderPaymentResponse> {
    try {
      const statusResp = await this.client.checkStatus(orderId, {
        expectedAmount: expectedAmountPaise,
        maxRetries: 3,
        retryDelayMs: 1000
      });

      let mappedStatus: PaymentStatus = PaymentStatus.PENDING;
      if (statusResp.status === 'SUCCESS') mappedStatus = PaymentStatus.SUCCESS;
      else if (statusResp.status === 'FAILED') mappedStatus = PaymentStatus.FAILED;

      return {
        providerPaymentId: statusResp.transactionId || orderId,
        providerTransactionId: statusResp.transactionId,
        status: mappedStatus,
        rawResponse: statusResp.rawResponse as Record<string, any>
      };
    } catch (err: any) {
      return {
        providerPaymentId: orderId,
        status: PaymentStatus.FAILED,
        errorCode: err.code || 'PHONEPE_STATUS_CHECK_FAILED',
        errorMessage: err.message
      };
    }
  }

  async createRefund(req: ProviderRefundRequest): Promise<ProviderRefundResponse> {
    try {
      const resp = await this.client.createRefund({
        originalOrderId: req.paymentId, // or orderId mapped
        refundId: req.refundId,
        amount: req.amount,
        providerTransactionId: req.providerPaymentId,
        reason: req.reason
      });

      let status = RefundStatus.PENDING;
      if (resp.status === 'SUCCESS') status = RefundStatus.PROCESSED;
      else if (resp.status === 'FAILED') status = RefundStatus.FAILED;

      return {
        providerRefundId: req.refundId,
        status,
        rawResponse: resp as any
      };
    } catch (err: any) {
      throw new Error(`PhonePe refund failed: ${err.message}`);
    }
  }

  async fetchRefund(providerRefundId: string): Promise<ProviderRefundResponse> {
    return {
      providerRefundId,
      status: RefundStatus.PENDING
    };
  }

  /**
   * Validates PhonePe webhook payload with raw request body and X-VERIFY signature
   */
  verifyWebhook(
    payload: string | Buffer | Record<string, any>,
    signature: string,
    _secret?: string,
    options?: { expectedAmount?: number }
  ): WebhookVerificationResult {
    try {
      const rawBody = typeof payload === 'object' && !Buffer.isBuffer(payload)
        ? JSON.stringify(payload)
        : payload;

      const event = this.client.verifyWebhook(rawBody as any, signature, {
        expectedAmount: options?.expectedAmount,
        enableReplayProtection: false // Use DB-level uniqueness constraint
      });

      let status: PaymentStatus = PaymentStatus.PENDING;
      if (event.status === 'SUCCESS') status = PaymentStatus.SUCCESS;
      else if (event.status === 'FAILED') status = PaymentStatus.FAILED;

      return {
        verified: event.verified,
        status,
        orderId: event.orderId,
        transactionId: event.transactionId,
        amount: event.amount,
        rawPayload: event.rawPayload
      };
    } catch (err: any) {
      return {
        verified: false,
        rawPayload: { error: err.message }
      };
    }
  }
}
