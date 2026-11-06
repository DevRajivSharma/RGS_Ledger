import { PaymentMethodType, ProviderType } from '@rgs-ledger/shared';
import { IPaymentProvider } from './interfaces';
import { SandboxPaymentProvider } from './sandbox-provider';
import { UpiQrManualPaymentProvider, UpiQrManualConfig } from './upi-qr-manual';
import { UPIPayPhonePeProvider, PhonePeProviderConfig } from './upipay-phonepe';
import { UPIPayPaytmProvider, PaytmProviderConfig } from './upipay-paytm';
import { CardPaymentProvider, CardGatewayConfig } from './card-provider';
import { NetbankingPaymentProvider, NetbankingGatewayConfig } from './netbanking-provider';

export interface ProviderResolutionParams {
  providerType: ProviderType;
  method?: PaymentMethodType;
  environment?: 'sandbox' | 'production';
  phonepeConfig?: PhonePeProviderConfig;
  paytmConfig?: PaytmProviderConfig;
  upiQrConfig?: UpiQrManualConfig;
  cardConfig?: CardGatewayConfig;
  netbankingConfig?: NetbankingGatewayConfig;
}

export class PaymentProviderRegistry {
  private static defaultSandboxProvider = new SandboxPaymentProvider();

  /**
   * Resolves the appropriate concrete IPaymentProvider instance
   */
  static getProvider(params: ProviderResolutionParams): IPaymentProvider {
    switch (params.providerType) {
      case ProviderType.PHONEPE:
        if (!params.phonepeConfig) {
          throw new Error('PhonePe configuration required to instantiate UPIPayPhonePeProvider');
        }
        return new UPIPayPhonePeProvider(params.phonepeConfig);

      case ProviderType.PAYTM:
        if (!params.paytmConfig) {
          throw new Error('Paytm configuration required to instantiate UPIPayPaytmProvider');
        }
        return new UPIPayPaytmProvider(params.paytmConfig);

      case ProviderType.UPI_QR_MANUAL:
        if (!params.upiQrConfig) {
          throw new Error('UPI QR configuration (VPA & Name) required to instantiate UpiQrManualPaymentProvider');
        }
        return new UpiQrManualPaymentProvider(params.upiQrConfig);

      case ProviderType.CARD_GATEWAY:
        return new CardPaymentProvider(params.cardConfig || { isConfigured: false });

      case ProviderType.NETBANKING_GATEWAY:
        return new NetbankingPaymentProvider(params.netbankingConfig || { isConfigured: false });

      case ProviderType.SANDBOX:
      default:
        return this.defaultSandboxProvider;
    }
  }

  static getSandboxProvider(): SandboxPaymentProvider {
    return this.defaultSandboxProvider;
  }
}
