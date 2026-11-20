import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import { requireDeviceAuth, AuthenticatedDeviceRequest } from '../../middleware/device-auth.js';
import {
  EvidenceProvider,
  EvidenceChannel,
  EvidenceStatus,
  TransactionType,
  TemplateLifecycleStatus
} from '@rgs-ledger/shared-types';
import {
  PairDeviceSchema,
  DeviceHeartbeatSchema,
  IngestAndroidEvidenceSchema
} from '@rgs-ledger/validation';
import {
  AndroidDeviceModel,
  DevicePairingCodeModel,
  MerchantModel,
  EvidenceTemplateModel,
  MerchantBankAccountModel,
  PaymentEvidenceModel,
  findMerchantByIdDefensive,
  flexibleIdQuery
} from '../../database/models.js';
import { EvidenceIngestionService } from '../evidence/evidence-ingestion.service.js';
import { TemplateManager } from '../templates/template-manager.js';

const router = Router();

/**
 * Helper to authenticate either merchant JWT session or device token
 */
async function authenticateMerchantOrDevice(req: any, res: Response, next: any) {
  const authHeader = req.headers['authorization'];
  const deviceHeader = req.headers['x-device-token'] as string;

  // If device token header present, or Bearer starts with dev_
  if (deviceHeader || (authHeader && authHeader.startsWith('Bearer dev_'))) {
    return requireDeviceAuth(req, res, next);
  }

  // Otherwise, use merchant session JWT
  return requireAuth(req, res, next);
}

// -------------------------------------------------------------
// 1. DEVICE PAIRING & MANAGEMENT ENDPOINTS
// -------------------------------------------------------------

/**
 * POST /devices/generate-pairing-code
 * Merchant generates an 8-character rotating pairing code to bind a new companion device.
 */
router.post(['/devices/generate-pairing-code', '/generate-pairing-code'], requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const merchantId = req.merchantId!;
    const merchant = (await findMerchantByIdDefensive(merchantId)) as any;
    if (!merchant) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Merchant not found' }
      });
      return;
    }

    // Invalidate existing unused codes for this merchant
    await DevicePairingCodeModel.updateMany(
      { merchantId, used: false },
      { $set: { used: true } }
    );

    // Generate 8-character uppercase alphanumeric code (e.g. 7K9F2M4X)
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await DevicePairingCodeModel.create({
      merchantId,
      code,
      expiresAt,
      used: false
    });

    res.status(201).json({
      success: true,
      data: {
        pairingCode: code,
        expiresAt: expiresAt.toISOString(),
        merchantName: merchant.name
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'PAIRING_CODE_GEN_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /devices/pair
 * Android Companion submits pairing code and device fingerprint to securely pair.
 */
router.post(['/devices/pair', '/pair'], async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = PairDeviceSchema.parse(req.body);

    const pairingRecord = await DevicePairingCodeModel.findOne({
      code: validated.pairingCode.toUpperCase(),
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!pairingRecord) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAIRING_CODE',
          message: 'The pairing code is invalid, expired, or has already been used.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const merchant = (await findMerchantByIdDefensive(pairingRecord.merchantId)) as any;
    if (!merchant) {
      res.status(404).json({
        success: false,
        error: { code: 'MERCHANT_NOT_FOUND', message: 'Associated merchant no longer exists.' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // Mark pairing code as used
    pairingRecord.used = true;
    await pairingRecord.save();

    // Generate secure device token
    const deviceToken = `dev_${crypto.randomBytes(32).toString('hex')}`;
    const deviceTokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');

    // Upsert device registration
    const device = await AndroidDeviceModel.findOneAndUpdate(
      { deviceFingerprint: validated.deviceFingerprint },
      {
        $set: {
          merchantId: merchant._id,
          deviceName: validated.deviceName,
          deviceFingerprint: validated.deviceFingerprint,
          deviceTokenHash,
          androidVersion: validated.androidVersion,
          status: 'PAIRED',
          pairedAt: new Date(),
          lastHeartbeatAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      data: {
        deviceId: device._id.toString(),
        deviceToken,
        merchantId: merchant._id.toString(),
        merchantName: merchant.name,
        merchantVpa: merchant.upiConfig?.vpa || ''
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'PAIRING_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * GET /devices
 * Merchant lists all connected/paired Android companion devices.
 */
router.get(['/devices', '/'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchantId!;
    const devices = await AndroidDeviceModel.find({ merchantId })
      .sort({ pairedAt: -1 })
      .lean();

    const formatted = devices.map((d: any) => ({
      id: d._id.toString(),
      merchantId: d.merchantId.toString(),
      deviceName: d.deviceName,
      deviceFingerprint: d.deviceFingerprint,
      androidVersion: d.androidVersion,
      notificationAccessGranted: d.notificationAccessGranted ?? false,
      pendingUploadCount: d.pendingUploadCount ?? 0,
      lastSyncAt: d.lastSyncAt,
      lastError: d.lastError,
      lastHeartbeatAt: d.lastHeartbeatAt,
      pairedAt: d.pairedAt,
      status: d.status
    }));

    res.json({
      success: true,
      data: { devices: formatted },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_DEVICES_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * DELETE /devices/:id or POST /devices/:id/revoke
 * Merchant unpairs or revokes a device.
 */
async function revokeDeviceHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchantId!;
    const deviceId = req.params.id;

    if (!mongoose.isValidObjectId(deviceId)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid device ID.' }
      });
      return;
    }

    const updated = await AndroidDeviceModel.findOneAndUpdate(
      { _id: deviceId, merchantId },
      {
        $set: {
          status: 'UNPAIRED',
          deviceTokenHash: `REVOKED_${Date.now()}`
        }
      },
      { new: true }
    );

    if (!updated) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Device not found or access denied.' }
      });
      return;
    }

    res.json({
      success: true,
      message: 'Companion device unpaired and revoked successfully.',
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'REVOKE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
}

router.delete(['/devices/:id', '/:id'], requireAuth, revokeDeviceHandler);
router.post(['/devices/:id/revoke', '/:id/revoke'], requireAuth, revokeDeviceHandler);

/**
 * GET /devices/notification-sources
 * Returns all detected and known Android notification source packages and their active/disabled toggle state.
 */
router.get(['/devices/notification-sources', '/notification-sources'], requireAuth, async (req: Request, res: Response) => {
  try {
    const merchantId = (req as any).user?.merchantId || (req as any).merchantId;
    const merchant = await findMerchantByIdDefensive(merchantId) as any;
    const disabledList = new Set<string>(merchant?.disabledNotificationPackages || []);

    // Aggregate detected packages from ingested evidence
    const stats = await PaymentEvidenceModel.aggregate([
      {
        $match: {
          merchantId: new mongoose.Types.ObjectId(merchantId),
          channel: EvidenceChannel.ANDROID
        }
      },
      {
        $group: {
          _id: '$senderOrPackage',
          count: { $sum: 1 },
          lastCapturedAt: { $max: '$capturedAt' }
        }
      }
    ]);

    const statsMap = new Map<string, { count: number; lastCapturedAt: Date }>();
    for (const s of stats) {
      if (s._id) {
        // Strip any appended parenthetical title e.g. "com.pkg (TITLE)"
        const cleanPkg = s._id.split(' ')[0];
        statsMap.set(cleanPkg, { count: s.count, lastCapturedAt: s.lastCapturedAt });
      }
    }

    const defaultKnownSources = [
      { packageName: 'com.google.android.apps.messaging', appName: 'Google Messages', category: 'SMS' },
      { packageName: 'com.samsung.android.messaging', appName: 'Samsung Messages', category: 'SMS' },
      { packageName: 'com.oneplus.mms', appName: 'OnePlus Messages', category: 'SMS' },
      { packageName: 'com.coloros.mms', appName: 'OPPO / Realme Messages', category: 'SMS' },
      { packageName: 'com.truecaller', appName: 'Truecaller', category: 'SMS / Caller' },
      { packageName: 'com.infrasofttech.uboi', appName: 'Union Bank (Vyom)', category: 'BANKING' },
      { packageName: 'com.snapwork.hdfc', appName: 'HDFC MobileBanking', category: 'BANKING' },
      { packageName: 'com.sbi.lotusintouch', appName: 'YONO SBI', category: 'BANKING' },
      { packageName: 'com.csam.icici.bank.imobile', appName: 'ICICI iMobile', category: 'BANKING' },
      { packageName: 'com.google.android.apps.nbu.paisa.user', appName: 'Google Pay', category: 'UPI' },
      { packageName: 'com.phonepe.app', appName: 'PhonePe', category: 'UPI' },
      { packageName: 'net.one97.paytm', appName: 'Paytm', category: 'UPI' }
    ];

    const seenPackages = new Set<string>();
    const sources = defaultKnownSources.map((item) => {
      seenPackages.add(item.packageName);
      const stat = statsMap.get(item.packageName);
      return {
        packageName: item.packageName,
        appName: item.appName,
        category: item.category,
        totalEvidenceCount: stat?.count || 0,
        lastDetectedAt: stat?.lastCapturedAt || null,
        isEnabled: !disabledList.has(item.packageName)
      };
    });

    // Append any extra packages that arrived from device
    for (const [pkg, stat] of statsMap.entries()) {
      if (!seenPackages.has(pkg)) {
        sources.push({
          packageName: pkg,
          appName: pkg,
          category: 'CUSTOM',
          totalEvidenceCount: stat.count,
          lastDetectedAt: stat.lastCapturedAt,
          isEnabled: !disabledList.has(pkg)
        });
      }
    }

    res.json({
      success: true,
      data: { sources },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_SOURCES_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /devices/notification-sources/:packageName/toggle
 * Enables or disables a specific notification source package for the merchant.
 */
router.post(['/devices/notification-sources/:packageName/toggle', '/notification-sources/:packageName/toggle'], requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as any).user?.merchantId || (req as any).merchantId;
    const packageName = req.params.packageName;
    if (!packageName) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PACKAGE_NAME', message: 'Package name is required in url' }
      });
      return;
    }

    const merchant = (await findMerchantByIdDefensive(merchantId)) as any;
    if (!merchant) {
      res.status(404).json({
        success: false,
        error: { code: 'MERCHANT_NOT_FOUND', message: 'Merchant account not found' }
      });
      return;
    }

    const currentDisabled: string[] = merchant.disabledNotificationPackages || [];
    const idx = currentDisabled.indexOf(packageName);
    let isNowEnabled: boolean;

    if (idx >= 0) {
      currentDisabled.splice(idx, 1);
      isNowEnabled = true;
    } else {
      currentDisabled.push(packageName);
      isNowEnabled = false;
    }

    await mongoose.connection.collection('merchants').updateOne(
      flexibleIdQuery(merchantId),
      { $set: { disabledNotificationPackages: currentDisabled } }
    );

    res.json({
      success: true,
      data: {
        packageName,
        isEnabled: isNowEnabled
      },
      message: `Notification source ${packageName} is now ${isNowEnabled ? 'enabled' : 'disabled'}.`,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'TOGGLE_SOURCE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /devices/heartbeat
 * Companion device reports status, Android version, and permission state.
 */
router.post(['/devices/heartbeat', '/heartbeat'], requireDeviceAuth, async (req: AuthenticatedDeviceRequest, res: Response) => {
  try {
    const validated = DeviceHeartbeatSchema.parse(req.body);
    const device = req.device;

    if (validated.androidVersion !== undefined) device.androidVersion = validated.androidVersion;
    if (validated.notificationAccessGranted !== undefined) device.notificationAccessGranted = validated.notificationAccessGranted;
    if (validated.pendingUploadCount !== undefined) device.pendingUploadCount = validated.pendingUploadCount;
    if (validated.lastError !== undefined) device.lastError = validated.lastError;
    device.lastHeartbeatAt = new Date();

    await device.save();

    res.json({
      success: true,
      message: 'Heartbeat acknowledged.',
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'HEARTBEAT_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

// -------------------------------------------------------------
// 2. ANDROID NOTIFICATION EVIDENCE INGESTION
// -------------------------------------------------------------

/**
 * Ingests a single Android notification payload.
 */
async function processNotificationIngestion(
  merchantId: string,
  payload: any,
  deviceId?: string
) {
  const {
    packageName,
    appName,
    notificationTitle,
    notificationText,
    providerMessageId,
    postTime
  } = payload;

  const rawText = TemplateManager.normalizeNotificationText(
    (notificationText || `${notificationTitle || ''} ${notificationText || ''}`).trim()
  );

  // 1. Check if merchant disabled this notification source package
  const merchant = await findMerchantByIdDefensive(merchantId) as any;
  const disabledPackages: string[] = merchant?.disabledNotificationPackages || [];
  if (packageName && disabledPackages.includes(packageName)) {
    return {
      isIgnored: true,
      status: 'IGNORED',
      reason: 'PACKAGE_DISABLED_BY_MERCHANT'
    };
  }

  // 2. Check for sensitive OTP / PIN patterns (prevent storing confidential content)
  if (/\b(?:otp|one\s*time\s*password|login\s*pin|cvv\s*is|secret\s*code)\b/i.test(rawText) && !/\bcredited\b/i.test(rawText)) {
    return {
      isIgnored: true,
      status: 'IGNORED',
      reason: 'SENSITIVE_CONFIDENTIAL_CONTENT_FILTERED'
    };
  }

  // 3. Check for irrelevant or promotional notification
  const isCreditWording = /\b(credited|received|deposited|refund)\b/i.test(rawText);
  const isDebitWording = /\b(debited|withdrawn|spent|transferred to|paid to)\b/i.test(rawText);

  if (!isCreditWording && !isDebitWording && !payload.amountPaise) {
    return {
      isIgnored: true,
      status: 'IGNORED',
      reason: 'NON_TRANSACTIONAL_NOTIFICATION_IGNORED'
    };
  }

  // 4. Pre-resolve candidate bank account if account suffix is present in text or payload
  let candidateBankAccountId: string | null = payload.bankAccountId || null;
  if (!candidateBankAccountId) {
    const previewStructured = TemplateManager.extractStructuredLabels(rawText);
    if (previewStructured.accountIdentifier) {
      const digits = previewStructured.accountIdentifier.replace(/\D/g, '');
      if (digits.length >= 2) {
        const suffix = digits.slice(-4);
        const matchedBank = await MerchantBankAccountModel.findOne({
          merchantId,
          $or: [{ accountSuffix: suffix }, { accountNumberMasked: `XX${suffix}` }]
        }).lean() as any;
        if (matchedBank) {
          candidateBankAccountId = (matchedBank._id || matchedBank.id).toString();
        }
      }
    }
  }

  // 5. Template Resolution: Search merchant's active approved Android templates
  const approvedTemplates = await EvidenceTemplateModel.find({
    merchantId,
    channel: EvidenceChannel.ANDROID,
    status: TemplateLifecycleStatus.APPROVED,
    isActive: { $ne: false },
    isArchived: { $ne: true }
  }).lean();

  const resolution = TemplateManager.resolveTemplate(
    approvedTemplates as any,
    packageName || '',
    notificationTitle || '',
    rawText,
    candidateBankAccountId
  );

  let matchedTemplate: any = resolution?.matchedTemplate || null;
  let extractedFields: any = resolution?.extractedFields || null;

  // 6. Fallback structured extraction if no approved template matched (for review display only)
  if (!extractedFields) {
    extractedFields = TemplateManager.extractStructuredLabels(rawText);
  }

  const amountPaise = payload.amountPaise || extractedFields?.amountPaise;
  const utr = payload.utr || extractedFields?.utr || null;
  const transactionType = isDebitWording && !isCreditWording
    ? TransactionType.DEBIT
    : (extractedFields?.transactionType || (isCreditWording ? TransactionType.CREDIT : TransactionType.DEBIT));

  // Resolved Bank Account ID (prioritize matched template bankAccountId, then pre-resolved)
  let bankAccountId: string | null = matchedTemplate?.bankAccountId?.toString() || candidateBankAccountId || null;
  const accountIdentifier = extractedFields?.accountIdentifier || null;

  if (!bankAccountId && accountIdentifier) {
    const digits = accountIdentifier.replace(/\D/g, '');
    if (digits.length >= 2) {
      const suffix = digits.slice(-4);
      const matchedBank = await MerchantBankAccountModel.findOne({
        merchantId,
        $or: [{ accountSuffix: suffix }, { accountNumberMasked: `XX${suffix}` }]
      }).lean() as any;
      if (matchedBank) {
        bankAccountId = (matchedBank._id || matchedBank.id).toString();
      }
    }
  }

  // 7. Determine initial status:
  // If debit -> REJECTED
  // If matched approved template -> UNMATCHED
  // If unknown format (generic fallback) -> REVIEW_REQUIRED
  // If missing critical fields (UTR or Account) -> REVIEW_REQUIRED
  let initialStatus: EvidenceStatus = EvidenceStatus.UNMATCHED;
  let rejectionReason: string | undefined = undefined;

  if (transactionType === TransactionType.DEBIT) {
    initialStatus = EvidenceStatus.REJECTED;
    rejectionReason = 'DEBIT_TRANSACTION_IGNORED';
  } else if (!matchedTemplate) {
    initialStatus = EvidenceStatus.REVIEW_REQUIRED;
    rejectionReason = 'UNAPPROVED_ANDROID_NOTIFICATION_TEMPLATE';
  } else if (!utr) {
    initialStatus = EvidenceStatus.REVIEW_REQUIRED;
    rejectionReason = 'MISSING_UTR_REFERENCE';
  } else if (!accountIdentifier && !bankAccountId) {
    initialStatus = EvidenceStatus.REVIEW_REQUIRED;
    rejectionReason = 'UNIDENTIFIED_BANK_ACCOUNT';
  }

  const stableContentDigest = payload.rawPayloadHash ||
    crypto.createHash('sha256').update(`${packageName}:${notificationTitle || ''}:${rawText}`).digest('hex');
  const generatedMsgId = providerMessageId || `android_${packageName}_${stableContentDigest}`;

  // 8. Persist via unified EvidenceIngestionService
  const result = await EvidenceIngestionService.ingestEvidence({
    merchantId,
    bankAccountId,
    provider: EvidenceProvider.ANDROID_COMPANION,
    providerMessageId: generatedMsgId,
    senderOrPackage: packageName || 'com.rgsledger.companion',
    rawText: rawText || JSON.stringify(payload),
    amountPaise,
    amountRupees: extractedFields?.amountRupees,
    utr,
    accountIdentifier,
    transactionType,
    transactionTimestamp: extractedFields?.transactionTimestamp || (postTime ? new Date(postTime) : null),
    templateId: matchedTemplate?._id?.toString(),
    templateVersion: matchedTemplate?.version,
    initialStatus,
    rejectionReason,
    metadata: {
      deviceId,
      packageName,
      appName,
      notificationTitle,
      senderHeader: notificationTitle,
      notificationText,
      snippet: notificationText,
      postTime
    }
  });

  // 9. Auto-match evidence against open payments if UNMATCHED
  if (result.evidenceId && result.evidenceStatus === EvidenceStatus.UNMATCHED) {
    try {
      if (mongoose.connection.readyState === 1) {
        const { defaultEvidenceMatchingService } = await import('../evidence-matching/index.js');
        await defaultEvidenceMatchingService.matchEvidenceToPayment(merchantId, result.evidenceId);
      }
    } catch {
      // Non-blocking in test/mock environments
    }
  }

  // Update device lastSyncAt if deviceId present
  if (deviceId) {
    AndroidDeviceModel.findByIdAndUpdate(deviceId, {
      $set: { lastSyncAt: new Date() }
    }).catch(() => {});
  }

  return result;
}

/**
 * POST /ingest & POST /devices/evidence
 * Ingest single Android notification. Authenticated via device token or merchant session.
 */
async function handleIngestEvidence(req: any, res: Response) {
  try {
    const merchantId = req.merchantId!;
    const deviceId = req.deviceId;

    const validated = IngestAndroidEvidenceSchema.parse(req.body);

    const result = await processNotificationIngestion(merchantId, validated, deviceId);

    res.status((result as any).isDuplicate ? 200 : 201).json({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'INGESTION_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
}

router.post('/ingest', authenticateMerchantOrDevice, handleIngestEvidence);
router.post(['/devices/evidence', '/evidence'], authenticateMerchantOrDevice, handleIngestEvidence);

/**
 * POST /devices/sync
 * Batch sync offline queued notifications from Room SQLite queue.
 */
router.post(['/devices/sync', '/sync'], authenticateMerchantOrDevice, async (req: any, res: Response) => {
  try {
    const merchantId = req.merchantId!;
    const deviceId = req.deviceId;
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    const results = [];
    for (const item of items) {
      try {
        const validated = IngestAndroidEvidenceSchema.parse(item);
        const resItem = await processNotificationIngestion(merchantId, validated, deviceId);
        results.push({ success: true, item: resItem });
      } catch (itemErr: any) {
        results.push({ success: false, error: itemErr.message });
      }
    }

    res.json({
      success: true,
      data: {
        totalProcessed: items.length,
        results
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'SYNC_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

export const androidEvidenceRouter = router;
export const devicesRouter = router;
