import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  ApproveTemplateSchema,
  ReactivateTemplateSchema,
  ArchiveTemplateSchema,
  CreateTemplateVersionSchema
} from '@rgs-ledger/validation';
import { defaultTemplateManager } from './template-manager.js';

export * from './template-manager.js';

const router = Router();

// All template endpoints require merchant authentication
router.use(requireAuth);

/**
 * GET /v1/templates - List templates for authenticated merchant
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { channel, status, bankAccountId } = req.query;
    const filter: any = {};
    if (channel) filter.channel = channel;
    if (status) filter.status = status;
    if (bankAccountId) filter.bankAccountId = bankAccountId;

    const templates = await defaultTemplateManager.listTemplates(req.merchantId!, filter);
    res.json({
      success: true,
      data: templates,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'TEMPLATE_LIST_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/templates - Create a new merchant template
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = CreateTemplateSchema.parse(req.body);
    const template = await defaultTemplateManager.createTemplate(
      req.merchantId!,
      parsed,
      req.user?.userId
    );

    res.status(201).json({
      success: true,
      data: template,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_TEMPLATE_INPUT', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * GET /v1/templates/:id - Get template by ID
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const template = await defaultTemplateManager.getTemplateById(req.merchantId!, templateId);
    if (!template) {
      res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    res.json({
      success: true,
      data: template,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'TEMPLATE_FETCH_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * PATCH /v1/templates/:id - Update template (creates version n+1 if approved)
 */
router.patch('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const parsed = UpdateTemplateSchema.parse(req.body);
    const updated = await defaultTemplateManager.updateTemplate(
      req.merchantId!,
      templateId,
      parsed,
      req.user?.userId
    );

    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_UPDATE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/templates/:id/approve - Approve a template version
 */
router.post('/:id/approve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const parsed = ApproveTemplateSchema.parse({
      templateId,
      ...req.body
    });

    const approved = await defaultTemplateManager.approveTemplate(
      req.merchantId!,
      templateId,
      parsed.targetVersion,
      req.user!.userId,
      parsed.approvalNotes,
      parsed.samplePayload
    );

    res.json({
      success: true,
      data: approved,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_APPROVAL_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/templates/:id/disable - Disable a template
 */
router.post('/:id/disable', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const disabled = await defaultTemplateManager.disableTemplate(
      req.merchantId!,
      templateId,
      req.user?.userId,
      req.body.reason
    );

    res.json({
      success: true,
      data: disabled,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_DISABLE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/templates/:id/reactivate - Reactivate a previously approved disabled template
 */
router.post('/:id/reactivate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const parsed = ReactivateTemplateSchema.parse(req.body || {});
    const reactivated = await defaultTemplateManager.reactivateTemplate(
      req.merchantId!,
      templateId,
      {
        switchConflicting: parsed.switchConflicting,
        userId: req.user?.userId,
        notes: parsed.reactivationNotes
      }
    );

    res.json({
      success: true,
      data: reactivated,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    if (err.code === 'CONFLICTING_ACTIVE_TEMPLATE') {
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICTING_ACTIVE_TEMPLATE',
          message: err.message,
          conflictingTemplate: err.conflictingTemplate
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_REACTIVATE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/templates/:id/archive - Safely archive a template
 */
router.post('/:id/archive', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const parsed = ArchiveTemplateSchema.parse(req.body || {});
    const archived = await defaultTemplateManager.archiveTemplate(
      req.merchantId!,
      templateId,
      req.user?.userId,
      parsed.reason
    );

    res.json({
      success: true,
      data: archived,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_ARCHIVE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/templates/:id/restore - Restore an archived template
 */
router.post('/:id/restore', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const restored = await defaultTemplateManager.restoreTemplate(
      req.merchantId!,
      templateId,
      req.user?.userId
    );

    res.json({
      success: true,
      data: restored,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_RESTORE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * DELETE /v1/templates/:id - Safely delete a template (only permitted if zero dependent evidence records exist)
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const result = await defaultTemplateManager.deleteTemplate(
      req.merchantId!,
      templateId,
      req.user?.userId
    );

    res.json({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_DELETE_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/templates/:id/version - Create a new version of an approved template
 */
router.post('/:id/version', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const parsed = CreateTemplateVersionSchema.parse(req.body);
    const updated = await defaultTemplateManager.createTemplateVersion(
      req.merchantId!,
      templateId,
      parsed,
      req.user?.userId
    );

    res.status(201).json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_VERSION_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * GET /v1/templates/:id/history - Get version history with diffs
 */
router.get('/:id/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = String(req.params.id);
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEMPLATE_ID', message: 'Template ID must be a valid 24-character hexadecimal ObjectId' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    const history = await defaultTemplateManager.getVersionHistory(
      req.merchantId!,
      templateId
    );

    res.json({
      success: true,
      data: { history },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_HISTORY_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/templates/test-regex - Test a regex pattern and field extraction safely
 */
router.post('/test-regex', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { regexPattern, sampleText, fieldsMap } = req.body;
    if (!regexPattern || typeof regexPattern !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REGEX', message: 'Regex pattern is required' }
      });
      return;
    }
    if (!sampleText || typeof sampleText !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SAMPLE', message: 'Sample text is required' }
      });
      return;
    }

    // Guard against ReDoS: Limit pattern length and execution duration
    if (regexPattern.length > 500) {
      res.status(400).json({
        success: false,
        error: { code: 'REGEX_TOO_LONG', message: 'Regex pattern must not exceed 500 characters' }
      });
      return;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(regexPattern, 'is');
    } catch (regErr: any) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REGEX_SYNTAX', message: regErr.message }
      });
      return;
    }

    const match = regex.exec(sampleText);
    if (!match) {
      res.json({
        success: true,
        data: {
          matched: false,
          extracted: null
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // Resolve field mappings
    const namedGroups = match.groups || {};
    const resolveField = (extractorKey?: string): string | undefined => {
      if (!extractorKey) return undefined;
      if (namedGroups[extractorKey]) return namedGroups[extractorKey];
      const index = parseInt(extractorKey, 10);
      if (!isNaN(index) && match[index] !== undefined) return match[index];
      return undefined;
    };

    const map = fieldsMap || {};
    const amountVal = resolveField(map.amountPaiseExtractor);
    const utrVal = resolveField(map.utrExtractor);
    const accountVal = resolveField(map.accountExtractor);
    const timestampVal = resolveField(map.transactionTimestampExtractor);
    const typeVal = resolveField(map.transactionTypeExtractor);

    let amountPaise: number | undefined;
    let amountRupees = amountVal ? amountVal.replace(/,/g, '') : undefined;
    let utr = utrVal ? utrVal.trim() : undefined;
    let accountIdentifier = accountVal ? accountVal.trim() : undefined;
    let transactionType: string | undefined = typeVal ? (typeVal.trim().toUpperCase() === 'DEBIT' ? 'DEBIT' : 'CREDIT') : undefined;
    let transactionTimestamp: Date | undefined;

    if (timestampVal) {
      const dmy = timestampVal.match(/^([0-9]{2})-([0-9]{2})-([0-9]{4})(?:\s+([0-9]{2}:[0-9]{2}(?::[0-9]{2})?))?$/);
      if (dmy) {
        const timePart = dmy[4] || '00:00:00';
        transactionTimestamp = new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T${timePart}+05:30`);
      } else {
        const parsed = new Date(timestampVal);
        if (!isNaN(parsed.getTime())) {
          transactionTimestamp = parsed;
        }
      }
    }

    if (amountVal) {
      const num = parseFloat(amountVal.replace(/,/g, ''));
      if (!isNaN(num) && num > 0) amountPaise = Math.round(num * 100);
    }

    // Enrich with structured labels if fields are missing
    const structured = defaultTemplateManager.constructor
      ? (defaultTemplateManager.constructor as any).extractStructuredLabels(sampleText)
      : null;
    if (!amountPaise && structured?.amountPaise) {
      amountPaise = structured.amountPaise;
      amountRupees = structured.amountRupees;
    }
    if (!utr && structured?.utr) {
      utr = structured.utr;
    }
    if (!accountIdentifier && structured?.accountIdentifier) {
      accountIdentifier = structured.accountIdentifier;
    }
    if (!transactionTimestamp && structured?.transactionTimestamp) {
      transactionTimestamp = structured.transactionTimestamp;
    }
    if (!transactionType && structured?.transactionType) {
      transactionType = structured.transactionType;
    }

    res.json({
      success: true,
      data: {
        matched: true,
        rawGroups: match.slice(1),
        namedGroups,
        extracted: {
          amountPaise,
          amountRupees,
          utr,
          accountIdentifier,
          transactionType: transactionType || 'CREDIT',
          transactionTimestamp
        }
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'REGEX_TEST_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

export const templatesRouter = router;
