import { Request, Response, NextFunction } from 'express';
import { Merchant } from '../database/models';
import { KycStatus } from '@rgs-ledger/shared';

export class MerchantController {
  static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await Merchant.findById(req.merchantId).exec();
      if (!merchant) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } });
        return;
      }
      res.status(200).json({ success: true, data: merchant });
    } catch (err) {
      next(err);
    }
  }

  static async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await Merchant.findById(req.merchantId).exec();
      if (!merchant) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } });
        return;
      }

      if (req.body.businessName) merchant.businessName = req.body.businessName;
      if (req.body.website !== undefined) merchant.website = req.body.website;
      if (req.body.businessType) merchant.businessType = req.body.businessType;

      await merchant.save();
      res.status(200).json({ success: true, data: merchant });
    } catch (err) {
      next(err);
    }
  }

  static async updateKyc(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await Merchant.findById(req.merchantId).exec();
      if (!merchant) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } });
        return;
      }

      merchant.panNumber = req.body.panNumber;
      merchant.gstin = req.body.gstin;
      merchant.bankAccount = req.body.bankAccount;
      merchant.address = req.body.address;
      merchant.kycStatus = KycStatus.UNDER_REVIEW;

      await merchant.save();
      res.status(200).json({ success: true, data: merchant });
    } catch (err) {
      next(err);
    }
  }

  static async getOnboardingStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchant = await Merchant.findById(req.merchantId).exec();
      if (!merchant) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } });
        return;
      }

      const steps = {
        accountCreated: true,
        emailVerified: true,
        businessInfoSubmitted: !!merchant.businessName && !!merchant.businessType,
        kycSubmitted: merchant.kycStatus !== KycStatus.NOT_STARTED,
        kycApproved: merchant.kycStatus === KycStatus.APPROVED,
        livePaymentsReady: merchant.kycStatus === KycStatus.APPROVED
      };

      res.status(200).json({
        success: true,
        data: {
          kycStatus: merchant.kycStatus,
          environmentMode: merchant.environmentMode,
          steps
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
