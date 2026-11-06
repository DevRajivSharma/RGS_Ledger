import { Request, Response, NextFunction } from 'express';
import { Merchant, User, AuditLog, ProviderConfig, MerchantProviderAccount } from '../database/models';
import { ReportService } from '../services/report.service';
import { KycStatus, UserRole, generateRandomId } from '@rgs-ledger/shared';

export class AdminController {
  static async getPlatformStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await ReportService.getPlatformAnalytics();
      res.status(200).json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  static async listMerchants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20', 10)));
      const skip = (page - 1) * limit;

      const query: any = {};
      if (req.query.kycStatus) query.kycStatus = req.query.kycStatus;

      const [merchants, total] = await Promise.all([
        Merchant.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
        Merchant.countDocuments(query).exec()
      ]);

      res.status(200).json({
        success: true,
        data: merchants,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateMerchantKyc(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, reviewNote } = req.body;
      const merchant = await Merchant.findById(req.params.merchantId).exec();
      if (!merchant) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } });
        return;
      }

      const previousStatus = merchant.kycStatus;
      merchant.kycStatus = status as KycStatus;
      merchant.kycReviewNote = reviewNote;
      await merchant.save();

      // Log audit action
      await AuditLog.create({
        _id: generateRandomId('aud'),
        actorId: req.user?.id || 'admin',
        actorEmail: req.user?.email || 'admin@rgsledger.com',
        actorRole: req.user?.role || UserRole.SUPER_ADMIN,
        merchantId: merchant._id,
        action: 'UPDATE_KYC_STATUS',
        targetEntity: 'Merchant',
        targetId: merchant._id,
        changes: { previousStatus, newStatus: status, reviewNote }
      }).catch(() => {});

      res.status(200).json({ success: true, data: merchant });
    } catch (err) {
      next(err);
    }
  }

  static async listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).exec();
      res.status(200).json({ success: true, data: logs });
    } catch (err) {
      next(err);
    }
  }

  static async listProviderConfigs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let configs = await ProviderConfig.find().exec();
      if (configs.length === 0) {
        // Seed default configs
        await ProviderConfig.create([
          {
            providerId: 'sandbox_provider',
            name: 'RGS Sandbox Payment Engine',
            isEnabled: true,
            isSandbox: true,
            priority: 1
          },
          {
            providerId: 'razorpay_partner_adapter',
            name: 'Authorized Partner: Razorpay Adapter',
            isEnabled: false,
            isSandbox: false,
            priority: 2,
            config: { note: 'Requires authorized acquiring partnership and RBI PA license approval' }
          },
          {
            providerId: 'cashfree_partner_adapter',
            name: 'Authorized Partner: Cashfree Adapter',
            isEnabled: false,
            isSandbox: false,
            priority: 3,
            config: { note: 'Requires authorized acquiring partnership and RBI PA license approval' }
          }
        ]);
        configs = await ProviderConfig.find().exec();
      }

      res.status(200).json({ success: true, data: configs });
    } catch (err) {
      next(err);
    }
  }

  static async toggleProvider(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { providerId } = req.params;
      const { isEnabled } = req.body;

      const updated = await ProviderConfig.findOneAndUpdate(
        { providerId },
        { $set: { isEnabled } },
        { new: true }
      ).exec();

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async listMerchantProviderAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query: any = {};
      if (req.query.merchantId) query.merchantId = req.query.merchantId;
      if (req.query.providerType) query.providerType = req.query.providerType;
      if (req.query.environment) query.environment = req.query.environment;

      const accounts = await MerchantProviderAccount.find(query).sort({ createdAt: -1 }).exec();

      // Return strictly safe view with masked credentials, never exposing encrypted or raw secrets
      const safeAccounts = accounts.map(acc => ({
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

      res.status(200).json({ success: true, data: safeAccounts });
    } catch (err) {
      next(err);
    }
  }
}
