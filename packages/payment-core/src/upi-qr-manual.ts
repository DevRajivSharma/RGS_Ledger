import {
  PaymentMethodType,
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
import { generateUPIQR, buildIntentLinks } from 'upipay';

export interface UpiQrManualConfig {
  vpa: string;
  displayName: string;
  mcc?: string;
}

/**
 * Mechanism A: Raw UPI QR / Intent Provider
 * 
 * Generates an NPCI-compliant fixed-amount UPI QR code using UPIPay's generateUPIQR.
 * 
 * CRITICAL FINTECH SAFETY BOUNDARY:
 * Raw QR generation DOES NOT provide automated server-side payment confirmation.
 * Scanning a QR, clicking a button, or viewing a checkout screen is NOT proof of receipt.
 * Transactions initiated through this provider stay PENDING with
 * manualVerificationStatus = AWAITING_MANUAL_CONFIRMATION until verified via
 * authoritative bank statement/UTR reconciliation.
 */
export class UpiQrManualPaymentProvider implements IPaymentProvider {
  readonly providerId = 'upi_qr_manual';
  readonly isLive = false;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsUpiQr: true,
    supportsUpiIntent: true,
    supportsHostedCheckout: false,
    supportsCards: false,
    supportsNetbanking: false,
    supportsWebhooks: false,
    supportsStatusCheck: false,
    supportsRefunds: false,
    supportsPartialRefunds: false,
    supportsPaymentMethodReporting: true
  };

  private readonly config: UpiQrManualConfig;

  constructor(config: UpiQrManualConfig) {
    if (!config.vpa || !config.vpa.includes('@')) {
      throw new Error(`Invalid merchant VPA: "${config.vpa}". Must be a valid UPI VPA (e.g., merchant@bank)`);
    }
    this.config = config;
  }

  async initiatePayment(req: ProviderPaymentRequest): Promise<ProviderPaymentResponse> {
    const vpa = req.merchantVpa || this.config.vpa;
    const name = req.merchantName || this.config.displayName || 'Merchant';
    const amountRupees = req.amount / 100; // Exact paise to rupees conversion

    // Generate fixed-amount NPCI compliant QR code via UPIPay
    const qrResult = await generateUPIQR({
      vpa,
      name,
      amount: amountRupees,
      orderId: req.orderId,
      note: `Order ${req.orderId}`,
      mode: 'fixed', // mode=04 (fixed amount, non-editable by customer)
      mc: this.config.mcc
    });

    return {
      providerPaymentId: `manual_qr_${req.paymentId}`,
      status: PaymentStatus.PENDING,
      upiUri: qrResult.upiUri,
      qrImage: qrResult.qrImage,
      rawResponse: {
        mechanism: 'RAW_UPI_QR_AWAITING_MANUAL_CONFIRMATION',
        vpa,
        displayName: name,
        amountRupees,
        mode: 'fixed'
      }
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentResponse> {
    return {
      providerPaymentId,
      status: PaymentStatus.PENDING,
      errorMessage: 'Raw UPI QR has no automated status API. Manual bank statement verification required.'
    };
  }

  async verifyPayment(providerPaymentId: string): Promise<ProviderPaymentResponse> {
    return {
      providerPaymentId,
      status: PaymentStatus.PENDING,
      errorMessage: 'Automated verification unavailable for raw QR. Reconcile via UTR / bank confirmation.'
    };
  }

  async createRefund(_req: ProviderRefundRequest): Promise<ProviderRefundResponse> {
    throw new Error('Raw UPI QR does not support automated refunds. Process refund via bank portal.');
  }

  async fetchRefund(_providerRefundId: string): Promise<ProviderRefundResponse> {
    throw new Error('Raw UPI QR does not support automated refund inquiry.');
  }

  verifyWebhook(_payload: any, _signature: string): WebhookVerificationResult {
    return {
      verified: false,
      rawPayload: { error: 'Raw UPI QR does not support server webhooks.' }
    };
  }
}
