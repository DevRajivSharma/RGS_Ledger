import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import { EvidenceProvider } from '@rgs-ledger/shared-types';
import { EvidenceIngestionService } from '../evidence/evidence-ingestion.service.js';

const router = Router();
router.use(requireAuth);

/**
 * POST /v1/email-evidence/ingest - Ingestion endpoint for bank credit email evidence
 */
router.post('/ingest', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      provider,
      providerMessageId,
      senderEmail,
      rawText,
      amountPaise,
      amountRupees,
      utr,
      accountIdentifier,
      transactionTimestamp
    } = req.body;

    const targetProvider = provider === 'OUTLOOK' ? EvidenceProvider.OUTLOOK : EvidenceProvider.GMAIL;

    const result = await EvidenceIngestionService.ingestEvidence({
      merchantId: req.merchantId!,
      provider: targetProvider,
      providerMessageId: providerMessageId || `email_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      senderOrPackage: senderEmail || 'alerts@bank.com',
      rawText: rawText || JSON.stringify(req.body),
      amountPaise,
      amountRupees,
      utr,
      accountIdentifier,
      transactionTimestamp
    });

    if (result.evidenceId && result.evidenceStatus === 'UNMATCHED') {
      try {
        const mongooseMod = await import('mongoose');
        if (mongooseMod.default?.connection?.readyState === 1) {
          const { defaultEvidenceMatchingService } = await import('../evidence-matching/index.js');
          await defaultEvidenceMatchingService.matchEvidenceToPayment(req.merchantId!, result.evidenceId);
        }
      } catch {
        // Non-blocking in test/mock environments
      }
    }

    res.status(result.isDuplicate ? 200 : 201).json({
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
});

export const emailEvidenceRouter = router;
