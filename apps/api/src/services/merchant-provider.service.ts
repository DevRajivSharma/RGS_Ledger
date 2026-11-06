import {
  MerchantProviderAccount,
  IMerchantProviderAccount,
  AuditLog
} from '../database/models';
import {
  ProviderType,
  ProviderAccountStatus,
  ProviderAccountModel,
  PaymentMethodType,
  EnvironmentMode,
  encryptSecret,
  decryptSecret,
  maskSecret,
  generateRandomId,
  UserRole
} from '@rgs-ledger/shared';
import {
  IPaymentProvider,
  PaymentProviderRegistry,
  PhonePeProviderConfig,
  PaytmProviderConfig,
  UpiQrManualConfig
} from '@rgs-ledger/payment-core';
import { config } from '../config';

export interface SaveProviderAccountDto {
  merchantId: string;
  providerType: ProviderType;
  accountModel?: ProviderAccountModel;
  environment: EnvironmentMode;
  isEnabled: boolean;
  credentials: Record<string, string>;
  vpaConfig?: {
    vpa: string;
    displayName: string;
    mcc?: string;
  };
  subMerchantId?: string;
  actorId?: string;
  actorEmail?: string;
}

export class MerchantProviderService {
  /**
   * Safely persists merchant provider configuration with AES-256-GCM encryption.
   * Never stores plain-text secrets in the database.
   */
  static async saveProviderAccount(dto: SaveProviderAccountDto): Promise<IMerchantProviderAccount> {
    const jsonCredentials = JSON.stringify(dto.credentials || {});
    const encrypted = encryptSecret(jsonCredentials, config.encryptionKey);

    // Create safe masked display values for the UI / logs
    const masked: Record<string, string> = {};
    for (const [key, val] of Object.entries(dto.credentials || {})) {
      if (key.toLowerCase().includes('id') || key.toLowerCase().includes('index') || key.toLowerCase().includes('website')) {
        masked[key] = val; // Public or identifier values kept visible
      } else {
        masked[key] = maskSecret(val);
      }
    }

    let status = ProviderAccountStatus.NOT_CONFIGURED;
    if (dto.isEnabled && Object.keys(dto.credentials || {}).length > 0) {
      status = dto.environment === EnvironmentMode.LIVE
        ? ProviderAccountStatus.PENDING_VERIFICATION
        : ProviderAccountStatus.SANDBOX_CONNECTED;
    }

    const account = await MerchantProviderAccount.findOneAndUpdate(
      {
        merchantId: dto.merchantId,
        providerType: dto.providerType,
        environment: dto.environment
      },
      {
        $set: {
          accountModel: dto.accountModel || ProviderAccountModel.MERCHANT_DIRECT,
          status,
          isEnabled: dto.isEnabled,
          credentialsEncrypted: encrypted,
          credentialsMasked: masked,
          vpaConfig: dto.vpaConfig,
          subMerchantId: dto.subMerchantId,
          lastRotatedAt: new Date()
        },
        $setOnInsert: {
          _id: generateRandomId('mprov')
        }
      },
      { upsert: true, new: true }
    ).exec();

    // Audit trail
    if (dto.actorId) {
      await AuditLog.create({
        _id: generateRandomId('audit'),
        actorId: dto.actorId,
        actorEmail: dto.actorEmail || 'system@rgsledger.com',
        actorRole: UserRole.MERCHANT_OWNER,
        merchantId: dto.merchantId,
        action: 'PROVIDER_ACCOUNT_UPDATED',
        targetEntity: 'MerchantProviderAccount',
        targetId: account._id,
        changes: {
          providerType: dto.providerType,
          environment: dto.environment,
          isEnabled: dto.isEnabled,
          status
        }
      });
    }

    return account;
  }

  /**
   * Returns list of configured provider accounts for a merchant with masked credentials
   */
  static async getMerchantProviderAccounts(merchantId: string, environment?: EnvironmentMode) {
    const query: any = { merchantId };
    if (environment) query.environment = environment;

    const accounts = await MerchantProviderAccount.find(query).exec();
    return accounts.map(acc => ({
      _id: acc._id,
      merchantId: acc.merchantId,
      providerType: acc.providerType,
      accountModel: acc.accountModel,
      environment: acc.environment,
      status: acc.status,
      isEnabled: acc.isEnabled,
      credentialsMasked: acc.credentialsMasked,
      vpaConfig: acc.vpaConfig,
      subMerchantId: acc.subMerchantId,
      verifiedAt: acc.verifiedAt,
      lastRotatedAt: acc.lastRotatedAt,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt
    }));
  }

  /**
   * Decrypts and resolves a provider account's real credentials for authoritative API operations
   */
  static getDecryptedCredentials(account: IMerchantProviderAccount): Record<string, string> {
    if (!account.credentialsEncrypted) return {};
    try {
      const decrypted = decryptSecret(account.credentialsEncrypted, config.encryptionKey);
      return JSON.parse(decrypted);
    } catch (err: any) {
      throw new Error(`Failed to decrypt provider credentials for account ${account._id}: ${err.message}`);
    }
  }

  /**
   * Resolves the appropriate concrete IPaymentProvider instance for a transaction
   */
  static async resolveProviderForPayment(
    merchantId: string,
    method: PaymentMethodType,
    environment: EnvironmentMode
  ): Promise<{
    provider: IPaymentProvider;
    providerType: ProviderType;
    account?: IMerchantProviderAccount;
  }> {
    // 1. Look for merchant-specific enabled accounts
    const activeAccounts = await MerchantProviderAccount.find({
      merchantId,
      environment,
      isEnabled: true
    }).exec();

    // Priority matching based on payment method
    let matchedAccount: IMerchantProviderAccount | undefined;

    if (method === PaymentMethodType.UPI_QR || method === PaymentMethodType.UPI_INTENT) {
      // Check PhonePe first, then Paytm, then UpiQrManual
      matchedAccount = activeAccounts.find(a => a.providerType === ProviderType.PHONEPE) ||
                       activeAccounts.find(a => a.providerType === ProviderType.PAYTM) ||
                       activeAccounts.find(a => a.providerType === ProviderType.UPI_QR_MANUAL);
    } else if (method === PaymentMethodType.CARD) {
      matchedAccount = activeAccounts.find(a => a.providerType === ProviderType.CARD_GATEWAY);
    } else if (method === PaymentMethodType.NETBANKING) {
      matchedAccount = activeAccounts.find(a => a.providerType === ProviderType.NETBANKING_GATEWAY);
    }

    if (matchedAccount) {
      const creds = this.getDecryptedCredentials(matchedAccount);
      const isProd = environment === EnvironmentMode.LIVE;

      if (matchedAccount.providerType === ProviderType.PHONEPE) {
        const phonepeConfig: PhonePeProviderConfig = {
          merchantId: creds.merchantId,
          saltKey: creds.saltKey,
          saltIndex: creds.saltIndex || '1',
          environment: isProd ? 'production' : 'sandbox'
        };
        const provider = PaymentProviderRegistry.getProvider({
          providerType: ProviderType.PHONEPE,
          phonepeConfig
        });
        return { provider, providerType: ProviderType.PHONEPE, account: matchedAccount };
      }

      if (matchedAccount.providerType === ProviderType.PAYTM) {
        const paytmConfig: PaytmProviderConfig = {
          merchantId: creds.merchantId,
          merchantKey: creds.merchantKey,
          website: creds.website || (isProd ? 'DEFAULT' : 'WEBSTAGING'),
          environment: isProd ? 'production' : 'sandbox'
        };
        const provider = PaymentProviderRegistry.getProvider({
          providerType: ProviderType.PAYTM,
          paytmConfig
        });
        return { provider, providerType: ProviderType.PAYTM, account: matchedAccount };
      }

      if (matchedAccount.providerType === ProviderType.UPI_QR_MANUAL) {
        const upiQrConfig: UpiQrManualConfig = {
          vpa: matchedAccount.vpaConfig?.vpa || creds.vpa,
          displayName: matchedAccount.vpaConfig?.displayName || creds.displayName || 'Merchant',
          mcc: matchedAccount.vpaConfig?.mcc || creds.mcc
        };
        const provider = PaymentProviderRegistry.getProvider({
          providerType: ProviderType.UPI_QR_MANUAL,
          upiQrConfig
        });
        return { provider, providerType: ProviderType.UPI_QR_MANUAL, account: matchedAccount };
      }

      if (matchedAccount.providerType === ProviderType.CARD_GATEWAY) {
        const provider = PaymentProviderRegistry.getProvider({
          providerType: ProviderType.CARD_GATEWAY,
          cardConfig: {
            apiKey: creds.apiKey,
            apiSecret: creds.apiSecret,
            isConfigured: true,
            environment: isProd ? 'production' : 'sandbox'
          }
        });
        return { provider, providerType: ProviderType.CARD_GATEWAY, account: matchedAccount };
      }

      if (matchedAccount.providerType === ProviderType.NETBANKING_GATEWAY) {
        const provider = PaymentProviderRegistry.getProvider({
          providerType: ProviderType.NETBANKING_GATEWAY,
          netbankingConfig: {
            apiKey: creds.apiKey,
            apiSecret: creds.apiSecret,
            isConfigured: true,
            environment: isProd ? 'production' : 'sandbox'
          }
        });
        return { provider, providerType: ProviderType.NETBANKING_GATEWAY, account: matchedAccount };
      }
    }

    // Fallbacks if no specific merchant provider account is configured:
    // In LIVE mode, unconfigured card or netbanking returns explicit unconfigured provider
    if (environment === EnvironmentMode.LIVE) {
      if (method === PaymentMethodType.CARD) {
        return {
          provider: PaymentProviderRegistry.getProvider({
            providerType: ProviderType.CARD_GATEWAY,
            cardConfig: { isConfigured: false }
          }),
          providerType: ProviderType.CARD_GATEWAY
        };
      }
      if (method === PaymentMethodType.NETBANKING) {
        return {
          provider: PaymentProviderRegistry.getProvider({
            providerType: ProviderType.NETBANKING_GATEWAY,
            netbankingConfig: { isConfigured: false }
          }),
          providerType: ProviderType.NETBANKING_GATEWAY
        };
      }
      throw new Error(`No active live payment provider account configured for merchant ${merchantId} and method ${method}. Real money collection is disabled.`);
    }

    // Default Sandbox Provider in SANDBOX mode
    return {
      provider: PaymentProviderRegistry.getSandboxProvider(),
      providerType: ProviderType.SANDBOX
    };
  }
}
