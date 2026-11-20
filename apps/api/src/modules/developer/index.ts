import { Router, Response } from 'express';
import { requireAuth, requireScope, AuthenticatedRequest } from '../../middleware/auth.js';
import { defaultApiKeyService } from './api-key.service.js';
import { ApiResponse } from '@rgs-ledger/api-contracts';

export * from './api-key.service.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /keys - List all API keys for the authenticated merchant
 */
router.get('/keys', requireScope('developer:read'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const keys = await defaultApiKeyService.listApiKeys(req.merchantId!);
    const response: ApiResponse = {
      success: true,
      data: { keys },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /keys - Create a new API Key pair
 */
router.post('/keys', requireScope('developer:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await defaultApiKeyService.createApiKey(req.merchantId!, req.body, req.user?.userId);
    const response: ApiResponse = {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /keys/:id/rotate - Rotate an API Key secret
 */
router.post('/keys/:id/rotate', requireScope('developer:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await defaultApiKeyService.rotateApiKey(req.merchantId!, req.params.id!, req.user?.userId);
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
 * POST /keys/:id/revoke or DELETE /keys/:id - Revoke an API Key
 */
router.post('/keys/:id/revoke', requireScope('developer:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const key = await defaultApiKeyService.revokeApiKey(req.merchantId!, req.params.id!, req.user?.userId);
    const response: ApiResponse = {
      success: true,
      data: { key },
      message: `API Key ${key.keyId} revoked successfully`,
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.delete('/keys/:id', requireScope('developer:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const key = await defaultApiKeyService.revokeApiKey(req.merchantId!, req.params.id!, req.user?.userId);
    const response: ApiResponse = {
      success: true,
      data: { key },
      message: `API Key ${key.keyId} revoked successfully`,
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

export const developerRouter = router;
