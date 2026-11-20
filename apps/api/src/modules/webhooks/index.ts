import { Router, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, requireScope, AuthenticatedRequest } from '../../middleware/auth.js';
import { WebhookEndpointModel, WebhookDeliveryModel } from '../../database/models.js';
import { CreateWebhookEndpointSchema, isValidWebhookUrl } from '@rgs-ledger/validation';
import { ApiResponse } from '@rgs-ledger/api-contracts';
import { config } from '../../config/index.js';
import { defaultWebhookService } from './webhook.service.js';

export * from './webhook.service.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/v1/webhooks/endpoints - List registered webhook endpoints for the merchant
 */
router.get('/endpoints', requireScope('webhooks:read'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const endpoints = await WebhookEndpointModel.find({ merchantId: req.merchantId! }).sort({ createdAt: -1 });
    const response: ApiResponse = {
      success: true,
      data: {
        endpoints: endpoints.map((e) => ({
          id: e._id.toString(),
          url: e.url,
          events: e.events,
          description: e.description,
          isActive: e.isActive,
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString()
        }))
      },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/webhooks/endpoints - Create a new webhook endpoint with SSRF protection
 */
router.post('/endpoints', requireScope('webhooks:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const validated = CreateWebhookEndpointSchema.parse(req.body);

    const isProduction = config.NODE_ENV === 'production';
    const validation = isValidWebhookUrl(validated.url, isProduction);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: {
          code: 'SSRF_PROTECTION_ERROR',
          message: validation.reason || 'Invalid webhook URL'
        }
      });
      return;
    }

    const endpointSecret = validated.secret || `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const endpoint = await WebhookEndpointModel.create({
      merchantId: req.merchantId!,
      url: validated.url,
      secret: endpointSecret,
      events: validated.events && validated.events.length > 0 ? validated.events : ['*'],
      description: validated.description,
      isActive: true
    });

    const response: ApiResponse = {
      success: true,
      data: {
        id: endpoint._id.toString(),
        url: endpoint.url,
        secret: endpointSecret, // Shown on creation so merchant can configure HMAC verification
        events: endpoint.events,
        description: endpoint.description,
        isActive: endpoint.isActive,
        createdAt: endpoint.createdAt.toISOString()
      },
      message: 'Webhook endpoint registered successfully',
      meta: { timestamp: new Date().toISOString() }
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/webhooks/endpoints/:id - Delete / deactivate a webhook endpoint
 */
router.delete('/endpoints/:id', requireScope('webhooks:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const endpoint = await WebhookEndpointModel.findOneAndDelete({
      _id: req.params.id,
      merchantId: req.merchantId!
    });

    if (!endpoint) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Webhook endpoint not found' }
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: { id: req.params.id },
      message: 'Webhook endpoint deleted successfully',
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/webhooks/endpoints/:id/test - Send an immediate test ping event
 */
router.post('/endpoints/:id/test', requireScope('webhooks:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await defaultWebhookService.testEndpoint(req.merchantId!, req.params.id!);
    const response: ApiResponse = {
      success: true,
      data: result,
      message: result.success ? 'Webhook test ping succeeded' : 'Webhook test ping failed',
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: err.message }
      });
      return;
    }
    next(err);
  }
});

/**
 * GET /api/v1/webhooks/deliveries - List recent webhook deliveries
 */
router.get('/deliveries', requireScope('webhooks:read'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const deliveries = (await WebhookDeliveryModel.find({ merchantId: req.merchantId! })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()) as any[];

    const response: ApiResponse = {
      success: true,
      data: {
        deliveries: deliveries.map((d: any) => ({
          id: d._id.toString(),
          endpointId: d.endpointId?.toString(),
          eventId: d.eventId?.toString(),
          eventType: d.eventType,
          statusCode: d.statusCode || d.responseStatusCode,
          responseBody: d.responseBody,
          errorMessage: d.errorMessage,
          latencyMs: d.latencyMs,
          attempts: d.attempts,
          status: d.status,
          createdAt: d.createdAt ? (d.createdAt.toISOString ? d.createdAt.toISOString() : new Date(d.createdAt).toISOString()) : new Date().toISOString()
        }))
      },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/webhooks/deliveries/:id/retry - Manually authorize and trigger re-delivery of a failed or dead-letter webhook
 */
router.post('/deliveries/:id/retry', requireScope('webhooks:write'), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = await defaultWebhookService.manualRetryDelivery(req.merchantId!, req.params.id!);
    const response: ApiResponse = {
      success: true,
      data: result,
      message: result.success ? 'Manual webhook re-delivery succeeded' : 'Manual webhook re-delivery attempted but failed',
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: err.message }
      });
      return;
    }
    next(err);
  }
});

export const webhooksRouter = router;
