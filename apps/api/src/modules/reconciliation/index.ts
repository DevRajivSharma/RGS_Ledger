import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import { defaultReconciliationService } from './reconciliation.service.js';
import { ReconciliationCaseStatus, ReconciliationCaseType } from '@rgs-ledger/shared-types';

export * from './reconciliation.service.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /cases - List open and historical reconciliation cases for the merchant
 */
router.get('/cases', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, severity, caseType, bankAccountId, search, dateFrom, dateTo, limit, skip } = req.query;

    const result = await defaultReconciliationService.listCases(req.merchantId!, {
      status: typeof status === 'string' ? status.trim() : undefined,
      severity: typeof severity === 'string' ? severity.trim() : undefined,
      caseType: typeof caseType === 'string' ? caseType.trim() : undefined,
      bankAccountId: typeof bankAccountId === 'string' ? bankAccountId.trim() : undefined,
      search: typeof search === 'string' ? search.trim() : undefined,
      dateFrom: typeof dateFrom === 'string' ? dateFrom.trim() : undefined,
      dateTo: typeof dateTo === 'string' ? dateTo.trim() : undefined,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : 50,
      skip: typeof skip === 'string' ? parseInt(skip, 10) : 0
    });

    res.json({
      success: true,
      data: {
        cases: result.cases,
        total: result.total
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_RECONCILIATION_CASES_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * GET /cases/:id - Retrieve single case with audit history
 */
router.get('/cases/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const reconCase = await defaultReconciliationService.getCaseById(req.merchantId!, req.params.id!);
    if (!reconCase) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Reconciliation case not found' }
      });
      return;
    }

    res.json({
      success: true,
      data: { case: reconCase },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_CASE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /cases - Open a manual reconciliation case
 */
router.post('/cases', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { paymentRequestId, evidenceId, caseType, reason, notes, expectedAmountPaise, receivedAmountPaise, utr } = req.body;

    const reconCase = await defaultReconciliationService.createOrUpdateCase(req.merchantId!, {
      paymentRequestId,
      evidenceId,
      caseType: caseType || ReconciliationCaseType.MANUAL_FLAG,
      reason: reason || 'Manual merchant flag for review',
      notes,
      userId: (req as any).user?.id,
      expectedAmountPaise,
      receivedAmountPaise,
      utr
    });

    res.status(201).json({
      success: true,
      data: { case: reconCase },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'CREATE_CASE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /cases/:id/status - Update case workflow status (OPEN -> INVESTIGATING -> DISMISSED)
 */
router.post('/cases/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, notes } = req.body;
    if (!status || !Object.values(ReconciliationCaseStatus).includes(status)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Valid status is required (OPEN, INVESTIGATING, RESOLVED, DISMISSED)' }
      });
      return;
    }

    const updated = await defaultReconciliationService.updateCaseStatus(
      req.merchantId!,
      req.params.id!,
      status,
      notes,
      (req as any).user?.id
    );

    res.json({
      success: true,
      data: { case: updated },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'UPDATE_STATUS_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /cases/:id/resolve - Resolve case adhering strictly to dual-source rules
 */
router.post('/cases/:id/resolve', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { action, resolutionNotes } = req.body;

    if (!resolutionNotes || !resolutionNotes.trim()) {
      res.status(400).json({
        success: false,
        error: { code: 'NOTES_REQUIRED', message: 'Resolution notes are required' }
      });
      return;
    }

    const resolved = await defaultReconciliationService.resolveCase(
      req.merchantId!,
      req.params.id!,
      {
        action: action || 'CONFIRM_PAYMENT',
        resolutionNotes: resolutionNotes.trim(),
        userId: (req as any).user?.id
      }
    );

    res.json({
      success: true,
      data: { case: resolved },
      message: 'Reconciliation case resolved successfully',
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'RECONCILIATION_RESOLUTION_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /cases/:id/notes - Add notes to case audit history without changing status
 */
router.post('/cases/:id/notes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notes } = req.body;
    if (!notes || !notes.trim()) {
      res.status(400).json({
        success: false,
        error: { code: 'NOTES_REQUIRED', message: 'Notes text is required' }
      });
      return;
    }

    const updated = await defaultReconciliationService.addCaseNotes(
      req.merchantId!,
      req.params.id!,
      notes.trim(),
      (req as any).user?.id
    );

    res.json({
      success: true,
      data: { case: updated },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'ADD_NOTES_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /auto-reconcile - Trigger automated reconciliation runner
 */
router.post('/auto-reconcile', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await defaultReconciliationService.autoReconcile(req.merchantId!);
    res.json({
      success: true,
      data: result,
      message: `Auto-reconciliation completed. Created ${result.newCasesCreated} cases, auto-resolved ${result.autoResolvedCases}.`,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'AUTO_RECONCILE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

export const reconciliationRouter = router;
