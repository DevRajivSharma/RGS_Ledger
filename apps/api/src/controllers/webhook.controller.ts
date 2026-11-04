import { Request, Response, NextFunction } from 'express';
import { WebhookService } from '../services/webhook.service';

export class WebhookController {
  static async createEndpoint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const endpoint = await WebhookService.createEndpoint({
        merchantId: merchantId!,
        url: req.body.url,
        events: req.body.events
      });

      res.status(201).json({ success: true, data: endpoint });
    } catch (err) {
      next(err);
    }
  }

  static async listEndpoints(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const endpoints = await WebhookService.listEndpoints(merchantId!);
      res.status(200).json({ success: true, data: endpoints });
    } catch (err) {
      next(err);
    }
  }

  static async deleteEndpoint(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const success = await WebhookService.deleteEndpoint(req.params.id, merchantId!);
      res.status(200).json({ success, message: 'Webhook endpoint removed' });
    } catch (err) {
      next(err);
    }
  }

  static async listDeliveries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const result = await WebhookService.listDeliveries({
        merchantId: merchantId!,
        endpointId: req.query.endpointId as string,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
      });

      res.status(200).json({
        success: true,
        data: result.deliveries,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  static async retryDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      await WebhookService.retryDelivery(req.params.deliveryId, merchantId!);
      res.status(200).json({ success: true, message: 'Webhook retry scheduled' });
    } catch (err) {
      next(err);
    }
  }
}
