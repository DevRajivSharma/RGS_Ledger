import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { config } from '../../config/index.js';
import { platformConfigService } from './platform-config.service.js';
import {
  UserModel,
  MerchantModel,
  MerchantBankAccountModel,
  MerchantIntegrationModel,
  PaymentRequestModel,
  AndroidDeviceModel,
  ApiCredentialModel,
  WebhookDeliveryModel,
  ReconciliationCaseModel,
  BackgroundJobModel,
  PlatformConfigModel
} from '../../database/models.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middleware/auth.js';
import { security } from '../../utils/security.js';
import { authRateLimiter } from '../../middleware/rate-limiter.js';
import { auditService } from '../audit/index.js';
import {
  AdminLoginSchema,
  AdminBootstrapSchema,
  SuspendMerchantSchema,
  ReactivateMerchantSchema,
  UpdatePlatformConfigSchema,
  AdminResolveReconciliationSchema
} from '@rgs-ledger/validation';
import { ApiResponse, PlatformOverviewMetricsDto } from '@rgs-ledger/api-contracts';
import { PaymentStatus } from '@rgs-ledger/shared-types';

const router = Router();

// ============================================================================
// 1. ADMIN AUTHENTICATION
// ============================================================================

/**
 * Bootstrap the initial System Administrator.
 * REQUIRES server-side ADMIN_BOOTSTRAP_SECRET and runs with atomic race-condition lock.
 * Only callable when exactly ZERO system administrators exist in the database.
 */
router.post('/auth/bootstrap', authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = AdminBootstrapSchema.parse(req.body);

    // 1. Verify Server-Side Bootstrap Secret
    const serverSecret = config.ADMIN_BOOTSTRAP_SECRET || process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!serverSecret || serverSecret.length < 8) {
      res.status(503).json({
        success: false,
        error: {
          code: 'BOOTSTRAP_UNAVAILABLE',
          message: 'Server ADMIN_BOOTSTRAP_SECRET is not configured. Bootstrap is disabled.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const providedSecret = validated.bootstrapSecret || (req.headers['x-admin-bootstrap-secret'] as string);
    if (!providedSecret) {
      res.status(401).json({
        success: false,
        error: {
          code: 'BOOTSTRAP_SECRET_REQUIRED',
          message: 'Valid server bootstrap secret is required to initialize the primary administrator.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // Timing-safe secret comparison
    const hashServer = crypto.createHash('sha256').update(serverSecret).digest();
    const hashProvided = crypto.createHash('sha256').update(providedSecret).digest();
    if (!crypto.timingSafeEqual(hashServer, hashProvided)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INVALID_BOOTSTRAP_SECRET',
          message: 'Invalid administrator bootstrap secret provided.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // 2. Pre-check email existence before acquiring atomic lock
    const email = validated.email.toLowerCase().trim();
    const existingUser = (await UserModel.findOne({ email }).lean()) as any;
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: { code: 'EMAIL_ALREADY_EXISTS', message: 'A user with this email already exists' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // 3. Race-Safe Atomic Verification: Check existing admins & initialize lock
    const existingAdminCount = await UserModel.countDocuments({ role: 'SYSTEM_ADMIN' });
    const isLocked = await PlatformConfigModel.findOne({ key: 'system_admin_initialized' });
    if (existingAdminCount > 0 || isLocked) {
      res.status(403).json({
        success: false,
        error: {
          code: 'BOOTSTRAP_DISABLED',
          message: 'System administrator already exists. Bootstrap is permanently locked.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // Atomic lock insertion to prevent race condition during concurrent bootstrap calls
    try {
      await PlatformConfigModel.create({
        key: 'system_admin_initialized',
        paymentExpirySeconds: 900,
        evidenceMatchingWindowSeconds: 1800,
        reconciliationScheduleIntervalSeconds: 60,
        webhookMaxRetries: 5,
        webhookBackoffFactor: 4,
        evidenceRetentionDays: 90,
        rateLimitPerMinute: 120
      });
    } catch (lockErr: any) {
      if (lockErr.code === 11000) {
        res.status(403).json({
          success: false,
          error: {
            code: 'BOOTSTRAP_DISABLED',
            message: 'System administrator already exists or concurrent bootstrap lock acquired.'
          },
          meta: { timestamp: new Date().toISOString() }
        });
        return;
      }
      throw lockErr;
    }

    let user: any;
    try {
      const passwordHash = await security.hashPassword(validated.password);
      user = await UserModel.create({
        email,
        passwordHash,
        role: 'SYSTEM_ADMIN',
        status: 'ACTIVE'
      });
    } catch (userCreateErr) {
      // Revert lock if admin creation failed so platform is not incorrectly locked
      await PlatformConfigModel.deleteOne({ key: 'system_admin_initialized' }).catch(() => {});
      throw userCreateErr;
    }

    const accessToken = security.generateAccessToken({
      userId: user._id.toString(),
      role: 'SYSTEM_ADMIN',
      email: user.email
    });

    const { token: refreshToken, hash: refreshHash } = security.generateRefreshToken();
    await UserModel.findByIdAndUpdate(user._id, { refreshTokenHash: refreshHash });

    await auditService.recordLog({
      userId: user._id.toString(),
      action: 'ADMIN_BOOTSTRAP',
      resource: 'users',
      resourceId: user._id.toString(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { email: user.email }
    });

    const response: ApiResponse = {
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900
        }
      },
      meta: { timestamp: new Date().toISOString() }
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * Dedicated System Administrator Login.
 * Rejects non-admin users (merchants) with 403 Forbidden.
 */
router.post('/auth/login', authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = AdminLoginSchema.parse(req.body);
    const email = validated.email.toLowerCase().trim();

    const user = (await UserModel.findOne({ email }).lean()) as any;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid admin email or password' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const isMatch = await security.verifyPassword(validated.password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid admin email or password' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // Role check: Only SYSTEM_ADMIN allowed
    if (user.role !== 'SYSTEM_ADMIN') {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ADMIN_ONLY',
          message: 'Access restricted to system administrators. Merchant credentials rejected.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({
        success: false,
        error: { code: 'ADMIN_SUSPENDED', message: 'Admin account is inactive or suspended' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const accessToken = security.generateAccessToken({
      userId: user._id.toString(),
      role: 'SYSTEM_ADMIN',
      email: user.email
    });

    const { token: refreshToken, hash: refreshHash } = security.generateRefreshToken();
    await UserModel.findByIdAndUpdate(user._id, { refreshTokenHash: refreshHash });

    await auditService.recordLog({
      userId: user._id.toString(),
      action: 'ADMIN_LOGIN',
      resource: 'users',
      resourceId: user._id.toString(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { email: user.email }
    });

    const response: ApiResponse = {
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900
        }
      },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * Get current admin session info
 */
router.get('/auth/me', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      id: req.user?.userId,
      email: req.user?.email,
      role: req.user?.role
    },
    meta: { timestamp: new Date().toISOString() }
  });
});

/**
 * Admin Logout
 */
router.post('/auth/logout', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.userId) {
      await UserModel.findByIdAndUpdate(req.user.userId, { refreshTokenHash: null });
      await auditService.recordLog({
        userId: req.user.userId,
        action: 'ADMIN_LOGOUT',
        resource: 'users',
        resourceId: req.user.userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }
    res.json({
      success: true,
      data: { message: 'Admin logged out successfully' },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. PLATFORM OVERVIEW & AGGREGATE METRICS
// ============================================================================

router.get('/metrics', requireAuth as any, requireAdmin as any, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [
      totalMerchants,
      activeMerchants,
      suspendedMerchants,
      paymentsSummary,
      activeDevicesCount,
      connectedEmailCount,
      openReconciliationCasesCount,
      deliveryFailuresCount
    ] = await Promise.all([
      MerchantModel.countDocuments(),
      MerchantModel.countDocuments({ status: 'ACTIVE' }),
      MerchantModel.countDocuments({ status: 'SUSPENDED' }),
      PaymentRequestModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmountPaise: { $sum: '$amountPaise' }
          }
        }
      ]),
      AndroidDeviceModel.countDocuments({ status: 'PAIRED' }),
      MerchantIntegrationModel.countDocuments({ status: 'CONNECTED' }),
      ReconciliationCaseModel.countDocuments({ status: { $in: ['OPEN', 'INVESTIGATING'] } }),
      WebhookDeliveryModel.countDocuments({ status: { $in: ['FAILED', 'DEAD_LETTER'] } })
    ]);

    // Build status distribution map and total value
    const byStatus: Record<string, number> = {
      [PaymentStatus.PENDING]: 0,
      [PaymentStatus.PARTIAL_SUCCESS]: 0,
      [PaymentStatus.SUCCESS]: 0,
      [PaymentStatus.REVIEW_REQUIRED]: 0,
      [PaymentStatus.EXPIRED]: 0,
      [PaymentStatus.CANCELLED]: 0,
      [PaymentStatus.RECONCILIATION_REQUIRED]: 0
    };

    let totalPayments = 0;
    let totalRequestedValuePaise = 0;
    let totalSuccessValuePaise = 0;

    for (const group of paymentsSummary) {
      const status = group._id as string;
      const count = group.count || 0;
      const amountPaise = group.totalAmountPaise || 0;

      byStatus[status] = count;
      totalPayments += count;
      totalRequestedValuePaise += amountPaise;

      if (status === PaymentStatus.SUCCESS) {
        totalSuccessValuePaise += amountPaise;
      }
    }

    const metricsData: PlatformOverviewMetricsDto = {
      merchants: {
        total: totalMerchants,
        active: activeMerchants,
        suspended: suspendedMerchants
      },
      payments: {
        total: totalPayments,
        byStatus,
        totalRequestedValuePaise,
        totalSuccessValuePaise,
        partialSuccessCount: byStatus[PaymentStatus.PARTIAL_SUCCESS] || 0,
        reviewRequiredCount: byStatus[PaymentStatus.REVIEW_REQUIRED] || 0,
        reconciliationRequiredCount: byStatus[PaymentStatus.RECONCILIATION_REQUIRED] || 0
      },
      devices: {
        activeCount: activeDevicesCount
      },
      integrations: {
        connectedEmailCount: connectedEmailCount
      },
      reconciliation: {
        openCasesCount: openReconciliationCasesCount
      },
      webhooks: {
        deliveryFailuresCount: deliveryFailuresCount
      }
    };

    const response: ApiResponse<PlatformOverviewMetricsDto> = {
      success: true,
      data: metricsData,
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. MERCHANT MANAGEMENT & OVERSIGHT
// ============================================================================

/**
 * List all registered merchants with operational statistics
 */
router.get('/merchants', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { search, status, page = '1', limit = '20' } = req.query as any;

    const query: any = {};
    if (status && (status === 'ACTIVE' || status === 'SUSPENDED')) {
      query.status = status;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { 'upiConfig.vpa': searchRegex }
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [merchants, total] = await Promise.all([
      MerchantModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      MerchantModel.countDocuments(query)
    ]);

    // Enrich merchants with operational counts
    const enrichedItems = await Promise.all(
      merchants.map(async (m: any) => {
        const mId = m._id.toString();
        const [
          bankAccountsCount,
          activeDevicesCount,
          emailConnected,
          paymentsAgg,
          openReconciliationCount
        ] = await Promise.all([
          MerchantBankAccountModel.countDocuments({ merchantId: m._id }),
          AndroidDeviceModel.countDocuments({ merchantId: m._id, status: 'PAIRED' }),
          MerchantIntegrationModel.exists({ merchantId: m._id, status: 'CONNECTED' }),
          PaymentRequestModel.aggregate([
            { $match: { merchantId: m._id } },
            {
              $group: {
                _id: null,
                totalCount: { $sum: 1 },
                successCount: {
                  $sum: { $cond: [{ $eq: ['$status', PaymentStatus.SUCCESS] }, 1, 0] }
                },
                totalPaise: { $sum: '$amountPaise' },
                successPaise: {
                  $sum: {
                    $cond: [
                      { $eq: ['$status', PaymentStatus.SUCCESS] },
                      '$amountPaise',
                      0
                    ]
                  }
                }
              }
            }
          ]),
          ReconciliationCaseModel.countDocuments({
            merchantId: m._id,
            status: { $in: ['OPEN', 'INVESTIGATING'] }
          })
        ]);

        const agg = paymentsAgg[0] || {
          totalCount: 0,
          successCount: 0,
          totalPaise: 0,
          successPaise: 0
        };

        return {
          id: mId,
          name: m.name,
          email: m.email,
          status: m.status,
          defaultVpa: m.upiConfig?.vpa,
          bankAccountsCount,
          activeDevicesCount,
          emailIntegrationConnected: Boolean(emailConnected),
          totalPaymentsCount: agg.totalCount,
          successPaymentsCount: agg.successCount,
          totalRequestedPaise: agg.totalPaise,
          totalSuccessPaise: agg.successPaise,
          openReconciliationCasesCount: openReconciliationCount,
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString()
        };
      })
    );

    res.json({
      success: true,
      data: {
        items: enrichedItems,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get detailed merchant profile
 */
router.get('/merchants/:id', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const merchantId = req.params.id;
    const merchant = (await MerchantModel.findById(merchantId).lean()) as any;
    if (!merchant) {
      res.status(404).json({
        success: false,
        error: { code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const [bankAccounts, integrations, devices, apiKeys, paymentsSummary, reconciliationSummary] = await Promise.all([
      MerchantBankAccountModel.find({ merchantId }).lean(),
      MerchantIntegrationModel.find({ merchantId }).select('-credentials.accessToken -credentials.refreshToken').lean(),
      AndroidDeviceModel.find({ merchantId }).select('-deviceTokenHash').lean(),
      ApiCredentialModel.find({ merchantId }).select('-secretHash').lean(),
      PaymentRequestModel.aggregate([
        { $match: { merchantId: merchant._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            amountPaise: { $sum: '$amountPaise' }
          }
        }
      ]),
      ReconciliationCaseModel.aggregate([
        { $match: { merchantId: merchant._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const stats: any = {
      totalPayments: 0,
      successPayments: 0,
      partialPayments: 0,
      pendingPayments: 0,
      expiredPayments: 0,
      totalRequestedPaise: 0,
      totalSuccessPaise: 0,
      reconciliationOpen: 0,
      reconciliationResolved: 0
    };

    for (const g of paymentsSummary) {
      stats.totalPayments += g.count;
      stats.totalRequestedPaise += g.amountPaise;
      if (g._id === PaymentStatus.SUCCESS) {
        stats.successPayments = g.count;
        stats.totalSuccessPaise = g.amountPaise;
      } else if (g._id === PaymentStatus.PARTIAL_SUCCESS) {
        stats.partialPayments = g.count;
      } else if (g._id === PaymentStatus.PENDING) {
        stats.pendingPayments = g.count;
      } else if (g._id === PaymentStatus.EXPIRED) {
        stats.expiredPayments = g.count;
      }
    }

    for (const r of reconciliationSummary) {
      if (r._id === 'OPEN' || r._id === 'INVESTIGATING') {
        stats.reconciliationOpen += r.count;
      } else if (r._id === 'RESOLVED') {
        stats.reconciliationResolved += r.count;
      }
    }

    res.json({
      success: true,
      data: {
        merchant: {
          id: merchant._id.toString(),
          name: merchant.name,
          email: merchant.email,
          status: merchant.status,
          upiConfig: merchant.upiConfig,
          createdAt: merchant.createdAt ? new Date(merchant.createdAt).toISOString() : new Date().toISOString()
        },
        bankAccounts: bankAccounts.map((b: any) => ({
          id: b._id.toString(),
          merchantId: b.merchantId.toString(),
          bankName: b.bankName,
          upiId: b.upiId,
          accountSuffix: b.accountSuffix,
          isActive: b.isActive,
          isDefault: b.isDefault,
          createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString()
        })),
        integrations: integrations.map((i: any) => ({
          id: i._id.toString(),
          provider: i.provider,
          status: i.status,
          emailAddress: i.emailAddress,
          lastSyncAt: i.lastSyncAt ? new Date(i.lastSyncAt).toISOString() : undefined,
          createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : new Date().toISOString()
        })),
        devices: devices.map((d: any) => ({
          id: d._id.toString(),
          deviceName: d.deviceName,
          deviceFingerprint: d.deviceFingerprint,
          androidVersion: d.androidVersion,
          notificationAccessGranted: Boolean(d.notificationAccessGranted),
          lastSeenAt: d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : undefined,
          pendingUploadCount: d.pendingUploadCount || 0,
          status: d.status
        })),
        apiKeys: apiKeys.map((k: any) => ({
          id: k._id.toString(),
          keyId: k.keyId,
          name: k.name,
          environment: k.environment,
          scopes: k.scopes,
          isActive: k.isActive,
          lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : undefined,
          createdAt: k.createdAt ? new Date(k.createdAt).toISOString() : new Date().toISOString()
        })),
        stats
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Suspend a merchant account.
 * INVARIANT: Never deletes merchant records or payment evidence.
 */
router.post('/merchants/:id/suspend', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const merchantId = req.params.id;
    const validated = SuspendMerchantSchema.parse(req.body);

    const merchant = await MerchantModel.findById(merchantId);
    if (!merchant) {
      res.status(404).json({
        success: false,
        error: { code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    merchant.status = 'SUSPENDED';
    await merchant.save();

    // Active session revocation: clear all user refresh tokens for this suspended merchant
    await UserModel.updateMany({ merchantId: merchant._id }, { $set: { refreshTokenHash: null } }).catch(() => {});

    await auditService.recordLog({
      userId: req.user?.userId,
      merchantId: merchant._id.toString(),
      action: 'MERCHANT_SUSPENDED',
      resource: 'merchants',
      resourceId: merchant._id.toString(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { reason: validated.reason }
    });

    res.json({
      success: true,
      data: {
        id: merchant._id.toString(),
        status: 'SUSPENDED',
        reason: validated.reason,
        message: 'Merchant suspended successfully. Historical records preserved.'
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Reactivate a suspended merchant account.
 */
router.post('/merchants/:id/reactivate', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const merchantId = req.params.id;
    const validated = ReactivateMerchantSchema.parse(req.body || {});

    const merchant = await MerchantModel.findById(merchantId);
    if (!merchant) {
      res.status(404).json({
        success: false,
        error: { code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    merchant.status = 'ACTIVE';
    await merchant.save();

    await auditService.recordLog({
      userId: req.user?.userId,
      merchantId: merchant._id.toString(),
      action: 'MERCHANT_REACTIVATED',
      resource: 'merchants',
      resourceId: merchant._id.toString(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { reason: validated.reason }
    });

    res.json({
      success: true,
      data: {
        id: merchant._id.toString(),
        status: 'ACTIVE',
        message: 'Merchant reactivated successfully.'
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. PLATFORM TRANSACTION EXPLORER (READ-ONLY)
// ============================================================================

router.get('/transactions', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { merchantId, status, search, bankAccountId, startDate, endDate, page = '1', limit = '25' } = req.query as any;

    const query: any = {};
    if (merchantId) {
      query.merchantId = merchantId;
    }
    if (status) {
      query.status = status;
    }
    if (bankAccountId) {
      query.bankAccountId = bankAccountId;
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    if (search && typeof search === 'string' && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { orderId: searchRegex },
        { checkoutReference: searchRegex },
        { 'evidenceSummary.utr': searchRegex }
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [payments, total] = await Promise.all([
      PaymentRequestModel.find(query)
        .populate('merchantId', 'name email')
        .populate('bankAccountId', 'bankName accountSuffix upiId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PaymentRequestModel.countDocuments(query)
    ]);

    const items = payments.map((p: any) => {
      const merchant = p.merchantId as any;
      const bank = p.bankAccountId as any;
      const summary = p.evidenceSummary || {};

      return {
        id: p._id.toString(),
        paymentReference: p.checkoutReference || p._id.toString(),
        orderId: p.orderId,
        merchantId: merchant?._id ? merchant._id.toString() : p.merchantId?.toString(),
        merchantName: merchant?.name || 'Unknown Merchant',
        amountPaise: p.amountPaise,
        status: p.status,
        bankAccountId: bank?._id ? bank._id.toString() : null,
        bankName: bank?.bankName,
        accountSuffix: bank?.accountSuffix,
        upiUri: p.upiUri,
        evidenceCount: (summary.hasEmailEvidence ? 1 : 0) + (summary.hasAndroidEvidence ? 1 : 0),
        hasEmailEvidence: Boolean(summary.hasEmailEvidence),
        hasAndroidEvidence: Boolean(summary.hasAndroidEvidence),
        emailEvidenceStatus: summary.hasEmailEvidence ? 'MATCHED' : 'MISSING',
        androidEvidenceStatus: summary.hasAndroidEvidence ? 'MATCHED' : 'MISSING',
        utr: summary.utr,
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
        matchedAt: summary.verifiedAt ? new Date(summary.verifiedAt).toISOString() : undefined,
        reviewReason: p.reviewReason
      };
    });

    res.json({
      success: true,
      data: {
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 5. EVIDENCE & RECONCILIATION OPERATIONS
// ============================================================================

/**
 * List global reconciliation cases across all merchants
 */
router.get('/reconciliation/cases', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { status, severity, search, page = '1', limit = '20' } = req.query as any;

    const query: any = {};
    if (status) {
      query.status = status;
    }
    if (severity) {
      query.severity = severity;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { utr: searchRegex },
        { reason: searchRegex },
        { caseType: searchRegex }
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [cases, total] = await Promise.all([
      ReconciliationCaseModel.find(query)
        .populate('merchantId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ReconciliationCaseModel.countDocuments(query)
    ]);

    const items = cases.map((c: any) => {
      const merchant = c.merchantId as any;
      return {
        id: c._id.toString(),
        merchantId: merchant?._id ? merchant._id.toString() : c.merchantId?.toString(),
        merchantName: merchant?.name || 'Unknown Merchant',
        paymentRequestId: c.paymentRequestId ? c.paymentRequestId.toString() : undefined,
        caseType: c.caseType,
        severity: c.severity,
        reason: c.reason,
        status: c.status,
        expectedAmountPaise: c.expectedAmountPaise,
        receivedAmountPaise: c.receivedAmountPaise,
        utr: c.utr,
        resolutionNotes: c.resolutionNotes,
        resolvedAt: c.resolvedAt ? new Date(c.resolvedAt).toISOString() : undefined,
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString()
      };
    });

    res.json({
      success: true,
      data: {
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Resolve or dismiss a reconciliation case.
 * INVARIANT: Never forces payment to SUCCESS or modifies raw evidence.
 */
router.post('/reconciliation/cases/:id/resolve', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const caseId = req.params.id;
    const validated = AdminResolveReconciliationSchema.parse(req.body);

    const rCase = await ReconciliationCaseModel.findById(caseId);
    if (!rCase) {
      res.status(404).json({
        success: false,
        error: { code: 'CASE_NOT_FOUND', message: 'Reconciliation case not found' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    rCase.status = validated.resolutionStatus;
    rCase.resolutionNotes = validated.resolutionNotes;
    rCase.resolvedAt = new Date();
    await rCase.save();

    await auditService.recordLog({
      userId: req.user?.userId,
      merchantId: rCase.merchantId?.toString(),
      action: 'RECONCILIATION_CASE_RESOLVED',
      resource: 'reconciliation_cases',
      resourceId: rCase._id.toString(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        resolutionStatus: validated.resolutionStatus,
        resolutionNotes: validated.resolutionNotes,
        caseType: rCase.caseType
      }
    });

    res.json({
      success: true,
      data: {
        id: rCase._id.toString(),
        status: rCase.status,
        resolutionNotes: rCase.resolutionNotes,
        resolvedAt: rCase.resolvedAt.toISOString(),
        message: 'Case status updated with immutable audit trail. Payment evidence invariants preserved.'
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 6. DEVICE & INTEGRATION MONITORING
// ============================================================================

router.get('/monitoring/devices', requireAuth as any, requireAdmin as any, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const devices = await AndroidDeviceModel.find()
      .populate('merchantId', 'name email')
      .sort({ lastSeenAt: -1 })
      .limit(100)
      .lean();

    const items = devices.map((d: any) => ({
      id: d._id.toString(),
      merchantId: d.merchantId?._id ? d.merchantId._id.toString() : d.merchantId?.toString(),
      merchantName: (d.merchantId as any)?.name || 'Unknown',
      deviceName: d.deviceName,
      deviceFingerprint: d.deviceFingerprint,
      androidVersion: d.androidVersion,
      notificationAccessGranted: Boolean(d.notificationAccessGranted),
      lastSeenAt: d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : undefined,
      pendingUploadCount: d.pendingUploadCount || 0,
      failedUploadCount: d.failedUploadCount || 0,
      status: d.status
    }));

    res.json({
      success: true,
      data: { items, total: items.length },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/monitoring/integrations', requireAuth as any, requireAdmin as any, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const integrations = await MerchantIntegrationModel.find()
      .populate('merchantId', 'name email')
      .select('-credentials.accessToken -credentials.refreshToken')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const items = integrations.map((i: any) => ({
      id: i._id.toString(),
      merchantId: i.merchantId?._id ? i.merchantId._id.toString() : i.merchantId?.toString(),
      merchantName: (i.merchantId as any)?.name || 'Unknown',
      provider: i.provider,
      status: i.status,
      emailAddress: i.emailAddress,
      lastSyncAt: i.lastSyncAt ? new Date(i.lastSyncAt).toISOString() : undefined,
      lastError: i.lastError,
      createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : new Date().toISOString()
    }));

    res.json({
      success: true,
      data: { items, total: items.length },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/monitoring/webhooks', requireAuth as any, requireAdmin as any, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const failures = await WebhookDeliveryModel.find({ status: { $in: ['FAILED', 'DEAD_LETTER'] } })
      .populate('merchantId', 'name email')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const items = failures.map((f: any) => ({
      id: f._id.toString(),
      merchantId: f.merchantId?._id ? f.merchantId._id.toString() : f.merchantId?.toString(),
      merchantName: (f.merchantId as any)?.name || 'Unknown',
      endpointId: f.endpointId?.toString(),
      eventId: f.eventId?.toString(),
      eventType: f.eventType,
      statusCode: f.statusCode,
      attemptNumber: f.attemptNumber,
      status: f.status,
      errorMessage: f.errorMessage,
      deliveredAt: f.deliveredAt ? new Date(f.deliveredAt).toISOString() : undefined,
      createdAt: f.createdAt ? new Date(f.createdAt).toISOString() : new Date().toISOString()
    }));

    res.json({
      success: true,
      data: { items, total: items.length },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/monitoring/worker', requireAuth as any, requireAdmin as any, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [recentJobs, pendingJobCount, activeLeaseCount] = await Promise.all([
      BackgroundJobModel.find().sort({ updatedAt: -1 }).limit(10).lean(),
      BackgroundJobModel.countDocuments({ status: 'PENDING' }),
      BackgroundJobModel.countDocuments({ status: 'RUNNING', leasedUntil: { $gt: new Date() } })
    ]);

    res.json({
      success: true,
      data: {
        workerStatus: 'HEALTHY',
        activeLeaseCount,
        pendingJobCount,
        recentJobs: recentJobs.map((j: any) => ({
          id: j._id.toString(),
          jobType: j.jobType,
          status: j.status,
          attemptCount: j.attemptCount,
          lastError: j.lastError,
          leasedUntil: j.leasedUntil ? new Date(j.leasedUntil).toISOString() : undefined,
          updatedAt: j.updatedAt ? new Date(j.updatedAt).toISOString() : new Date().toISOString()
        }))
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 7. PLATFORM CONFIGURATION AREA
// ============================================================================

router.get('/config', requireAuth as any, requireAdmin as any, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await platformConfigService.loadSettings();

    res.json({
      success: true,
      data: {
        key: 'default',
        ...settings,
        updatedAt: new Date().toISOString()
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

router.put('/config', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validated = UpdatePlatformConfigSchema.parse(req.body);

    const updated = await platformConfigService.updateSettings(validated, req.user?.userId);

    await auditService.recordLog({
      userId: req.user?.userId,
      action: 'PLATFORM_CONFIG_UPDATED',
      resource: 'platform_configs',
      resourceId: 'default',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: validated
    });

    res.json({
      success: true,
      data: {
        key: 'default',
        ...updated,
        updatedAt: new Date().toISOString(),
        message: 'Platform operational configuration saved and propagated across active services. Invariant payment verification rules preserved.'
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 8. AUDIT LOGS EXPLORER
// ============================================================================

router.get('/audit-logs', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { action, merchantId, userId, startDate, endDate, limit, page } = req.query as any;
    const result = await auditService.listLogs({ action, merchantId, userId, startDate, endDate, limit, page });
    res.json({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err) {
    next(err);
  }
});

export const adminRouter = router;
