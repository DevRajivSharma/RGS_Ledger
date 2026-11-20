import { Router, Response } from 'express';
import { requireAuth, requireScope, AuthenticatedRequest } from '../../middleware/auth.js';
import { defaultPaymentLinkService } from './payment-link.service.js';
import { ApiResponse } from '@rgs-ledger/api-contracts';

const router = Router();
router.use(requireAuth);

/**
 * POST /api/v1/payment-links - Create a payment link
 */
router.post('/', requireScope('links:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const link = await defaultPaymentLinkService.createPaymentLink(req.merchantId!, req.body, req.user?.userId);
    const response: ApiResponse = {
      success: true,
      data: { link },
      message: 'Payment link created successfully',
      meta: { timestamp: new Date().toISOString() }
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/payment-links - List payment links with filters
 */
router.get('/', requireScope('links:read'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;

    const { links, total } = await defaultPaymentLinkService.listPaymentLinks(req.merchantId!, {
      status,
      search,
      limit,
      skip
    });

    const response: ApiResponse = {
      success: true,
      data: { links, total, limit, skip },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/payment-links/:id - Get payment link details and recent payments
 */
router.get('/:id', requireScope('links:read'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await defaultPaymentLinkService.getPaymentLinkById(req.merchantId!, req.params.id!);
    const response: ApiResponse = {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/payment-links/:id/revoke - Revoke a payment link
 */
router.post('/:id/revoke', requireScope('links:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const link = await defaultPaymentLinkService.revokePaymentLink(req.merchantId!, req.params.id!, req.user?.userId);
    const response: ApiResponse = {
      success: true,
      data: { link },
      message: 'Payment link revoked successfully',
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireScope('links:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const link = await defaultPaymentLinkService.revokePaymentLink(req.merchantId!, req.params.id!, req.user?.userId);
    const response: ApiResponse = {
      success: true,
      data: { link },
      message: 'Payment link revoked successfully',
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

export const paymentLinksRouter = router;
