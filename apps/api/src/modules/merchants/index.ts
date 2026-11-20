import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { MerchantModel, MerchantBankAccountModel, findMerchantByIdDefensive, flexibleIdQuery } from '../../database/models.js';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import {
  UpdateMerchantProfileSchema,
  UpiConfigSchema,
  CreateMerchantBankAccountSchema,
  normalizeAccountIdentifier
} from '@rgs-ledger/validation';
import { ApiResponse } from '@rgs-ledger/api-contracts';
import { merchantAnalyticsRouter } from './merchant-analytics.router.js';
import { merchantOnboardingRouter } from './merchant-onboarding.router.js';

export interface IMerchantRepository {
  findById(merchantId: string): Promise<any>;
  updateProfile(merchantId: string, data: { name?: string }): Promise<any>;
  updateUpiConfig(merchantId: string, upiConfig: any): Promise<any>;
  listBankAccounts(merchantId: string): Promise<any[]>;
  createBankAccount(merchantId: string, data: any): Promise<any>;
  findBankAccountById(merchantId: string, accountId: string): Promise<any>;
  findDuplicateBankAccount(merchantId: string, upiId: string, accountSuffix: string): Promise<any>;
  updateBankAccount(merchantId: string, accountId: string, data: any): Promise<any>;
}

export class MongoMerchantRepository implements IMerchantRepository {
  async findById(merchantId: string) {
    return findMerchantByIdDefensive(merchantId);
  }

  async updateProfile(merchantId: string, data: { name?: string }) {
    const updated = await MerchantModel.findByIdAndUpdate(
      merchantId,
      { $set: data },
      { new: true }
    ).lean();
    if (updated) return updated;
    await mongoose.connection.collection('merchants').updateOne(
      flexibleIdQuery(merchantId),
      { $set: data }
    );
    return findMerchantByIdDefensive(merchantId);
  }

  async updateUpiConfig(merchantId: string, upiConfig: any) {
    const updated = await MerchantModel.findByIdAndUpdate(
      merchantId,
      { $set: { upiConfig } },
      { new: true }
    ).lean();
    if (updated) return updated;
    await mongoose.connection.collection('merchants').updateOne(
      flexibleIdQuery(merchantId),
      { $set: { upiConfig } }
    );
    return findMerchantByIdDefensive(merchantId);
  }

  async listBankAccounts(merchantId: string) {
    const docs = await MerchantBankAccountModel.find({ merchantId }).sort({ isDefault: -1, createdAt: -1 }).lean();
    return docs.map((d: any) => ({
      ...d,
      id: (d._id || d.id).toString()
    }));
  }

  async createBankAccount(merchantId: string, data: any) {
    if (data.isDefault) {
      await MerchantBankAccountModel.updateMany({ merchantId }, { $set: { isDefault: false } });
    }
    const doc = await MerchantBankAccountModel.create({ ...data, merchantId });
    const obj = (doc.toObject ? doc.toObject() : doc) as any;
    return {
      ...obj,
      id: (obj._id || obj.id).toString()
    };
  }

  async findBankAccountById(merchantId: string, accountId: string) {
    if (!mongoose.isValidObjectId(accountId) || accountId === 'undefined') return null;
    const doc = await MerchantBankAccountModel.findOne({ _id: accountId, merchantId }).lean() as any;
    if (!doc) return null;
    return { ...doc, id: (doc._id || doc.id).toString() };
  }

  async findDuplicateBankAccount(merchantId: string, upiId: string, accountSuffix: string) {
    const escapedUpi = upiId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const doc = await MerchantBankAccountModel.findOne({
      merchantId,
      $or: [
        { upiId: { $regex: new RegExp(`^${escapedUpi}$`, 'i') } },
        { accountSuffix }
      ]
    }).lean() as any;
    if (!doc) return null;
    return { ...doc, id: (doc._id || doc.id).toString() };
  }

  async updateBankAccount(merchantId: string, accountId: string, data: any) {
    if (!mongoose.isValidObjectId(accountId) || accountId === 'undefined') return null;
    if (data.isDefault) {
      await MerchantBankAccountModel.updateMany({ merchantId }, { $set: { isDefault: false } });
    }
    const doc = await MerchantBankAccountModel.findOneAndUpdate(
      { _id: accountId, merchantId },
      { $set: data },
      { new: true }
    ).lean() as any;
    if (!doc) return null;
    return { ...doc, id: (doc._id || doc.id).toString() };
  }
}

export class MerchantService {
  constructor(private repo: IMerchantRepository) {}

  async getProfile(merchantId: string) {
    const merchant = await this.repo.findById(merchantId);
    if (!merchant) {
      const err: any = new Error('Merchant profile not found');
      err.code = 'NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }
    return merchant;
  }

  async updateProfile(merchantId: string, input: any) {
    const validated = UpdateMerchantProfileSchema.parse(input);
    const updated = await this.repo.updateProfile(merchantId, validated);
    if (!updated) {
      const err: any = new Error('Merchant profile not found');
      err.code = 'NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }

  async getUpiConfig(merchantId: string) {
    const merchant = await this.getProfile(merchantId);
    return merchant.upiConfig;
  }

  async updateUpiConfig(merchantId: string, input: any) {
    const validated = UpiConfigSchema.parse(input);
    const updated = await this.repo.updateUpiConfig(merchantId, validated);
    if (!updated) {
      const err: any = new Error('Merchant profile not found');
      err.code = 'NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }
    return updated.upiConfig;
  }

  async listBankAccounts(merchantId: string) {
    return this.repo.listBankAccounts(merchantId);
  }

  async createBankAccount(merchantId: string, input: any) {
    const validated = CreateMerchantBankAccountSchema.parse(input);
    const rawIdentifier = validated.accountSuffix || validated.accountNumberMasked || '';
    const { accountSuffix, accountNumberMasked } = normalizeAccountIdentifier(rawIdentifier);
    const upiId = validated.upiId.trim();

    const existing = await this.repo.findDuplicateBankAccount(merchantId, upiId, accountSuffix);
    if (existing) {
      const isSameUpi = existing.upiId.toLowerCase() === upiId.toLowerCase();
      const err: any = new Error(
        isSameUpi
          ? `A bank account with UPI ID '${upiId}' is already registered.`
          : `A bank account ending in '${accountSuffix}' is already registered.`
      );
      err.code = 'DUPLICATE_BANK_ACCOUNT';
      err.statusCode = 409;
      throw err;
    }

    return this.repo.createBankAccount(merchantId, {
      bankName: validated.bankName.trim(),
      upiId,
      accountNumberMasked,
      accountSuffix,
      accountHolderName: validated.accountHolderName?.trim() || undefined,
      notes: validated.notes?.trim() || undefined,
      emailEvidenceConfig: {
        expectedSenderEmails: validated.expectedSenderEmails || [],
        expectedSenderDomains: validated.expectedSenderDomains || []
      },
      androidEvidenceConfig: {
        expectedPackageNames: validated.expectedPackageNames || [],
        appNames: validated.appNames || []
      },
      isActive: true,
      isDefault: validated.isDefault ?? false
    });
  }

  async toggleBankAccount(merchantId: string, accountId: string, isActive?: boolean) {
    const existing = await this.repo.findBankAccountById(merchantId, accountId);
    if (!existing) {
      const err: any = new Error('Bank account not found or access denied');
      err.code = 'NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }
    const newStatus = typeof isActive === 'boolean' ? isActive : !existing.isActive;
    return this.repo.updateBankAccount(merchantId, accountId, { isActive: newStatus });
  }
}

const merchantRepo = new MongoMerchantRepository();
export const merchantService = new MerchantService(merchantRepo);

const router = Router();

// Enforce authentication on all merchant routes
router.use(requireAuth);

router.get('/profile', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const merchantId = req.merchantId!;
    const merchant = await merchantService.getProfile(merchantId);
    const response: ApiResponse = {
      success: true,
      data: { merchant },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const merchantId = req.merchantId!;
    const merchant = await merchantService.updateProfile(merchantId, req.body);
    const response: ApiResponse = {
      success: true,
      data: { merchant },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.get('/upi', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const merchantId = req.merchantId!;
    const upiConfig = await merchantService.getUpiConfig(merchantId);
    const response: ApiResponse = {
      success: true,
      data: { upiConfig },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.put('/upi', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const merchantId = req.merchantId!;
    const upiConfig = await merchantService.updateUpiConfig(merchantId, req.body);
    const response: ApiResponse = {
      success: true,
      data: { upiConfig },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/merchant/bank-accounts - List all collection bank accounts
 */
router.get('/bank-accounts', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const merchantId = req.merchantId!;
    const accounts = await merchantService.listBankAccounts(merchantId);
    res.json({
      success: true,
      data: { accounts },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/merchant/bank-accounts - Add new collection bank account
 */
router.post('/bank-accounts', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const merchantId = req.merchantId!;
    const created = await merchantService.createBankAccount(merchantId, req.body);
    res.status(201).json({
      success: true,
      data: { account: created },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /v1/merchant/bank-accounts/:id/toggle - Enable or disable an account independently
 */
router.patch('/bank-accounts/:id/toggle', async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const merchantId = req.merchantId!;
    const accountId = String(req.params.id);
    const updated = await merchantService.toggleBankAccount(merchantId, accountId, req.body?.isActive);
    res.json({
      success: true,
      data: { account: updated },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Phase 4A: Merchant Analytics & Reporting Router
 */
router.use('/analytics', merchantAnalyticsRouter);

/**
 * Phase 4B: Merchant Guided Onboarding Router
 */
router.use('/onboarding', merchantOnboardingRouter);

export const merchantsRouter = router;
export * from './merchant-analytics.service.js';
export * from './merchant-analytics.router.js';
export * from './merchant-onboarding.service.js';
export * from './merchant-onboarding.router.js';
