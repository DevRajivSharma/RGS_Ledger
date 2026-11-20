import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import { PaymentEvidenceModel } from '../../database/models.js';
import {
  EvidenceStatus,
  TransactionType,
  TemplateLifecycleStatus
} from '@rgs-ledger/shared-types';
import { EvidenceSecurity } from './evidence-security.js';
import { BankEmailCandidateFilter } from '../integrations/bank-email-filter.js';
import { defaultTemplateManager, TemplateManager } from '../templates/template-manager.js';

export * from './evidence-security.js';
export * from './evidence-normalizer.js';
export * from './evidence-ingestion.service.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /v1/evidence - Retrieves paginated normalized evidence records for the authenticated merchant
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = { merchantId: req.merchantId! };

    if (typeof req.query.channel === 'string' && req.query.channel.trim()) query.channel = req.query.channel.trim();
    if (typeof req.query.provider === 'string' && req.query.provider.trim()) query.provider = req.query.provider.trim();
    if (typeof req.query.status === 'string' && req.query.status.trim()) query.status = req.query.status.trim();
    if (typeof req.query.transactionType === 'string' && req.query.transactionType.trim()) query.transactionType = req.query.transactionType.trim();
    if (typeof req.query.utr === 'string' && req.query.utr.trim()) query.utr = req.query.utr.trim();

    const [docs, total] = await Promise.all([
      PaymentEvidenceModel.find(query)
        .sort({ receivedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-encryptedRawPayload') // Never leak raw payload by default
        .lean(),
      PaymentEvidenceModel.countDocuments(query)
    ]);

    const items = docs.map((doc: any) => ({
      id: doc._id.toString(),
      merchantId: doc.merchantId.toString(),
      channel: doc.channel,
      provider: doc.provider,
      providerMessageId: doc.providerMessageId,
      senderOrPackage: doc.senderOrPackage,
      bankAccountId: doc.bankAccountId ? doc.bankAccountId.toString() : null,
      accountIdentifier: doc.accountIdentifier,
      transactionType: doc.transactionType,
      amountPaise: doc.amountPaise,
      amountRupees: (doc.amountPaise / 100).toFixed(2),
      currency: doc.currency || 'INR',
      utr: doc.utr,
      transactionTimestamp: doc.transactionTimestamp,
      receivedAt: doc.receivedAt,
      status: doc.status,
      rejectionReason: doc.rejectionReason,
      templateId: doc.templateId ? doc.templateId.toString() : null,
      templateVersion: doc.templateVersion || null,
      matchedPaymentRequestId: doc.matchedPaymentRequestId ? doc.matchedPaymentRequestId.toString() : null,
      matchedAt: doc.matchedAt,
      metadata: doc.metadata ? {
        subject: doc.metadata.subject,
        snippet: doc.metadata.snippet || doc.metadata.notificationText,
        notificationText: doc.metadata.notificationText,
        notificationTitle: doc.metadata.notificationTitle,
        senderHeader: doc.metadata.senderHeader || doc.metadata.notificationTitle,
        packageName: doc.metadata.packageName,
        appName: doc.metadata.appName,
        postTime: doc.metadata.postTime
      } : undefined,
      createdAt: doc.createdAt
    }));

    res.json({
      success: true,
      data: {
        items,
        evidence: items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_EVIDENCE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/evidence/reclassify - Re-evaluates historical un-matched evidence against candidate filter and approved templates.
 * Never deletes evidence records or modifies already matched payment requests.
 */
router.post('/reclassify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchantId!;
    const approvedTemplates = await defaultTemplateManager.listTemplates(merchantId, {
      status: TemplateLifecycleStatus.APPROVED
    });

    const docs = await PaymentEvidenceModel.find({
      merchantId,
      status: { $ne: EvidenceStatus.MATCHED }
    });

    let reclassifiedCount = 0;
    let rejectedCount = 0;
    let reviewCount = 0;
    let unmatchedCount = 0;

    for (const doc of docs) {
      let rawText = '';
      if (doc.encryptedRawPayload) {
        try {
          rawText = EvidenceSecurity.decryptPayload(doc.encryptedRawPayload);
        } catch {
          rawText = '';
        }
      }

      const evaluation = BankEmailCandidateFilter.evaluateCandidate({
        sender: doc.senderOrPackage,
        subject: doc.metadata?.subject || '',
        bodyText: rawText,
        customSenderIdentifiers: approvedTemplates.map((t) => t.senderIdentifier)
      });

      let updated = false;

      if (!evaluation.isCandidate && !evaluation.isDebit) {
        // Excluded category (Indeed recruitment, Amazon shopping, promos)
        if (doc.status !== EvidenceStatus.REJECTED || doc.rejectionReason !== evaluation.rejectionReason) {
          doc.status = EvidenceStatus.REJECTED;
          doc.rejectionReason = evaluation.rejectionReason || 'EXCLUDED_NON_FINANCIAL_EMAIL';
          updated = true;
          rejectedCount++;
        }
      } else if (evaluation.isDebit) {
        if (doc.status !== EvidenceStatus.REJECTED || doc.rejectionReason !== 'DEBIT_TRANSACTION_IGNORED') {
          doc.status = EvidenceStatus.REJECTED;
          doc.transactionType = TransactionType.DEBIT;
          doc.rejectionReason = 'DEBIT_TRANSACTION_IGNORED';
          updated = true;
          rejectedCount++;
        }
      } else {
        // Candidate email: check if an approved template matches
        let matchedTemplate: any = null;
        let extractedFields: any = null;

        for (const tmpl of approvedTemplates) {
          if (
            !tmpl.senderIdentifier ||
            (doc.senderOrPackage || '').toLowerCase().includes(tmpl.senderIdentifier.toLowerCase())
          ) {
            const extracted = TemplateManager.matchAndExtract(tmpl, rawText);
            if (extracted && (extracted.amountPaise || extracted.amountRupees)) {
              matchedTemplate = tmpl;
              extractedFields = extracted;
              break;
            }
          }
        }

        if (matchedTemplate) {
          doc.status = EvidenceStatus.UNMATCHED;
          doc.templateId = (matchedTemplate._id || matchedTemplate.id) as any;
          doc.templateVersion = matchedTemplate.version;
          doc.rejectionReason = undefined;
          if (extractedFields.amountPaise) doc.amountPaise = extractedFields.amountPaise;
          if (extractedFields.utr) doc.utr = extractedFields.utr;
          if (extractedFields.accountIdentifier) {
            doc.accountIdentifier = EvidenceSecurity.maskAccountNumber(extractedFields.accountIdentifier);
          }
          updated = true;
          unmatchedCount++;
        } else {
          // No approved template: check if from standard bank with high score
          const isStandardBank = BankEmailCandidateFilter.KNOWN_BANK_PATTERNS.some((p) =>
            p.senderDomains.some((d) => (doc.senderOrPackage || '').toLowerCase().includes(d))
          );
          if (isStandardBank && evaluation.score >= 80 && doc.utr) {
            doc.status = EvidenceStatus.UNMATCHED;
            doc.rejectionReason = undefined;
            updated = true;
            unmatchedCount++;
          } else {
            if (doc.status !== EvidenceStatus.REVIEW_REQUIRED) {
              doc.status = EvidenceStatus.REVIEW_REQUIRED;
              doc.rejectionReason = 'UNKNOWN_FORMAT_REQUIRES_TEMPLATE_REVIEW';
              updated = true;
              reviewCount++;
            }
          }
        }
      }

      if (updated) {
        await doc.save();
        reclassifiedCount++;
      }
    }

    res.json({
      success: true,
      data: {
        totalEvaluated: docs.length,
        reclassifiedCount,
        rejectedCount,
        reviewCount,
        unmatchedCount
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'RECLASSIFICATION_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

export const evidenceRouter = router;
