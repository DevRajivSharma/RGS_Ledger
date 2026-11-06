import {
  PaymentMethodType,
  PaymentStatus,
  RefundStatus
} from '@rgs-ledger/shared';
import {
  IPaymentProvider,
  PaymentProviderCapabilities,
  ProviderOrderRequest,
  ProviderOrderResponse,
  ProviderPaymentRequest,
  ProviderPaymentResponse,
  ProviderRefundRequest,
  ProviderRefundResponse
} from './interfaces';
import { GenericUPIIntentProvider } from './upi-intent';

export class SandboxPaymentProvider implements IPaymentProvider {
  readonly providerId = 'sandbox_provider';
  readonly isLive = false;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsUpiQr: true,
    supportsUpiIntent: true,
    supportsHostedCheckout: true,
    supportsCards: true,
    supportsNetbanking: true,
    supportsWebhooks: true,
    supportsStatusCheck: true,
    supportsRefunds: true,
    supportsPartialRefunds: true,
    supportsPaymentMethodReporting: true
  };

  async createOrder(req: ProviderOrderRequest): Promise<ProviderOrderResponse> {
    return {
      providerOrderId: `sbx_ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: 'created',
      rawResponse: {
        amount: req.amount,
        currency: req.currency,
        environment: 'SANDBOX'
      }
    };
  }

  async initiatePayment(req: ProviderPaymentRequest): Promise<ProviderPaymentResponse> {
    const providerPaymentId = `sbx_pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Check deterministic scenarios based on amount paise or input values
    const amountStr = req.amount.toString();
    const lastTwo = amountStr.slice(-2);

    // Explicit test UPI ID scenarios
    if (req.method === PaymentMethodType.UPI_INTENT || req.method === PaymentMethodType.UPI_QR) {
      if (req.upiId === 'fail@rgs' || lastTwo === '01') {
        return {
          providerPaymentId,
          status: PaymentStatus.FAILED,
          errorCode: 'PAYMENT_FAILED_USER_DECLINED',
          errorMessage: 'Transaction declined by user in UPI App (Simulated Sandbox)'
        };
      }

      if (req.upiId === 'pending@rgs' || lastTwo === '02') {
        const intentUri = GenericUPIIntentProvider.generateIntentUri({
          payeeVpa: 'sandbox-merchant@rgsbank',
          payeeName: 'Sandbox Merchant',
          transactionRef: req.paymentId,
          amountPaise: req.amount,
          currency: req.currency
        });

        return {
          providerPaymentId,
          status: PaymentStatus.PENDING,
          upiUri: intentUri
        };
      }

      // Default UPI success simulation
      const intentUri = GenericUPIIntentProvider.generateIntentUri({
        payeeVpa: 'sandbox-merchant@rgsbank',
        payeeName: 'Sandbox Merchant',
        transactionRef: req.paymentId,
        amountPaise: req.amount,
        currency: req.currency
      });

      return {
        providerPaymentId,
        status: PaymentStatus.SUCCESS,
        upiUri: intentUri,
        rawResponse: {
          simulated: true,
          vpa: req.upiId || 'test@upi'
        }
      };
    }

    // Card Simulation
    if (req.method === PaymentMethodType.CARD) {
      const cardNum = req.cardDetails?.cardNumber?.replace(/\s/g, '');
      if (cardNum === '4000000000000002' || lastTwo === '01') {
        return {
          providerPaymentId,
          status: PaymentStatus.FAILED,
          errorCode: 'INSUFFICIENT_FUNDS',
          errorMessage: 'Simulated Card Failure: Insufficient funds'
        };
      }

      return {
        providerPaymentId,
        status: PaymentStatus.SUCCESS,
        rawResponse: {
          simulated: true,
          network: cardNum?.startsWith('4') ? 'VISA' : 'MASTERCARD'
        }
      };
    }

    // Netbanking & Wallets default
    if (lastTwo === '01') {
      return {
        providerPaymentId,
        status: PaymentStatus.FAILED,
        errorCode: 'BANK_DOWNTIME',
        errorMessage: 'Simulated bank system downtime'
      };
    }

    return {
      providerPaymentId,
      status: PaymentStatus.SUCCESS,
      rawResponse: { simulated: true }
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentResponse> {
    return {
      providerPaymentId,
      status: PaymentStatus.SUCCESS,
      rawResponse: { simulated: true, verifiedAt: new Date().toISOString() }
    };
  }

  async verifyPayment(providerPaymentId: string): Promise<ProviderPaymentResponse> {
    return {
      providerPaymentId,
      status: PaymentStatus.SUCCESS,
      rawResponse: { simulated: true, reconciled: true }
    };
  }

  async createRefund(req: ProviderRefundRequest): Promise<ProviderRefundResponse> {
    return {
      providerRefundId: `sbx_ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: RefundStatus.PROCESSED,
      rawResponse: {
        amount: req.amount,
        currency: req.currency,
        simulated: true
      }
    };
  }

  async fetchRefund(providerRefundId: string): Promise<ProviderRefundResponse> {
    return {
      providerRefundId,
      status: RefundStatus.PROCESSED,
      rawResponse: { simulated: true }
    };
  }

  verifyWebhook(_payload: string, _signature: string, _secret: string): boolean {
    return true;
  }
}
