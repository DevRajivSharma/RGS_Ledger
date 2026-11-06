import { Request, Response } from 'express';
import { MerchantProviderService } from '../services/merchant-provider.service';
import { PaymentService } from '../services/payment.service';
import { ProviderType, EnvironmentMode, ProviderAccountModel } from '@rgs-ledger/shared';
import { MerchantProviderAccount } from '../database/models';

export class MerchantProviderController {
  /**
   * GET /api/v1/merchant/providers
   * Returns list of configured providers with masked credentials
   */
  static async getProviders(req: Request, res: Response) {
    try {
      // Strict tenant isolation: Use req.merchantId assigned by enforceTenantIsolation
      const merchantId = req.merchantId || (req as any).user?.merchantId;
      if (!merchantId) {
        return res.status(403).json({ success: false, message: 'No authorized merchant context found' });
      }

      const env = req.query.environment as EnvironmentMode | undefined;
      const providers = await MerchantProviderService.getMerchantProviderAccounts(merchantId, env);

      return res.status(200).json({
        success: true,
        data: providers
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/merchant/providers
   * Safely configures provider credentials with AES-256-GCM encryption
   */
  static async saveProvider(req: Request, res: Response) {
    try {
      // Strict tenant isolation: Use req.merchantId assigned by enforceTenantIsolation
      const merchantId = req.merchantId || (req as any).user?.merchantId;
      if (!merchantId) {
        return res.status(403).json({ success: false, message: 'No authorized merchant context found' });
      }

      const actorId = (req as any).user?.id || 'system';
      const actorEmail = (req as any).user?.email || 'admin@rgsledger.com';

      const {
        providerType,
        accountModel,
        environment,
        isEnabled,
        credentials,
        vpaConfig,
        subMerchantId
      } = req.body;

      if (!providerType || !Object.values(ProviderType).includes(providerType)) {
        return res.status(400).json({ success: false, message: `Invalid providerType. Expected one of: ${Object.values(ProviderType).join(', ')}` });
      }

      const account = await MerchantProviderService.saveProviderAccount({
        merchantId,
        providerType,
        accountModel: accountModel || ProviderAccountModel.MERCHANT_DIRECT,
        environment: environment || EnvironmentMode.SANDBOX,
        isEnabled: isEnabled ?? true,
        credentials: credentials || {},
        vpaConfig,
        subMerchantId,
        actorId,
        actorEmail
      });

      return res.status(200).json({
        success: true,
        message: `Provider ${providerType} configured successfully`,
        data: {
          _id: account._id,
          merchantId: account.merchantId,
          providerType: account.providerType,
          status: account.status,
          isEnabled: account.isEnabled,
          credentialsMasked: account.credentialsMasked,
          vpaConfig: account.vpaConfig,
          environment: account.environment
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * DELETE /api/v1/merchant/providers/:providerType
   * Disables or deletes a provider account
   */
  static async deleteProvider(req: Request, res: Response) {
    try {
      const merchantId = req.merchantId || (req as any).user?.merchantId;
      if (!merchantId) {
        return res.status(403).json({ success: false, message: 'No authorized merchant context found' });
      }
      const { providerType } = req.params;
      const env = (req.query.environment as EnvironmentMode) || EnvironmentMode.SANDBOX;

      await MerchantProviderAccount.deleteOne({
        merchantId,
        providerType,
        environment: env
      }).exec();

      return res.status(200).json({
        success: true,
        message: `Provider ${providerType} removed successfully`
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/v1/payments/:id/confirm-manual
   * Authoritatively confirms a raw UPI QR payment after independent bank UTR verification
   */
  static async confirmManualPayment(req: Request, res: Response) {
    try {
      const paymentId = req.params.id;
      const { utr, notes } = req.body;
      const verifiedBy = (req as any).user?.email || (req as any).user?.id || 'finance_ops';
      const merchantId = req.merchantId || (req as any).user?.merchantId;

      const result = await PaymentService.confirmManualPayment({
        paymentId,
        utr,
        verifiedBy,
        merchantId,
        notes
      });

      return res.status(200).json({
        success: true,
        message: 'Payment confirmed authoritatively via UTR verification and captured in ledger.',
        data: {
          payment: result.payment,
          order: result.order
        }
      });
    } catch (err: any) {
      return res.status(err.status || 500).json({
        success: false,
        code: err.code || 'CONFIRM_MANUAL_FAILED',
        message: err.message
      });
    }
  }

  /**
   * POST /api/v1/payments/:id/reconcile
   * Triggers authoritative server-side status check against provider API
   */
  static async reconcilePayment(req: Request, res: Response) {
    try {
      const paymentId = req.params.id;
      const merchantId = req.merchantId || (req as any).user?.merchantId;
      const result = await PaymentService.reconcilePayment(paymentId, merchantId);

      return res.status(200).json({
        success: true,
        reconciled: result.reconciled,
        data: {
          payment: result.payment,
          order: result.order
        }
      });
    } catch (err: any) {
      return res.status(err.status || 500).json({
        success: false,
        code: err.code || 'RECONCILE_FAILED',
        message: err.message
      });
    }
  }
}
