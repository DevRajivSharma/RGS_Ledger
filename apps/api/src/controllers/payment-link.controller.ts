import { Request, Response, NextFunction } from 'express';
import { PaymentLinkService } from '../services/payment-link.service';

export class PaymentLinkController {
  static async createLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      if (!merchantId) {
        res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No merchant ID' } });
        return;
      }

      const link = await PaymentLinkService.createLink({
        merchantId,
        amount: req.body.amount,
        title: req.body.title,
        description: req.body.description,
        currency: req.body.currency,
        customer: req.body.customer,
        expireBy: req.body.expireBy
      });

      res.status(201).json({ success: true, data: link });
    } catch (err) {
      next(err);
    }
  }

  static async getLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const link = await PaymentLinkService.getLink(req.params.id, req.merchantId);
      res.status(200).json({ success: true, data: link });
    } catch (err) {
      next(err);
    }
  }

  static async deactivateLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const link = await PaymentLinkService.deactivateLink(req.params.id, merchantId!);
      res.status(200).json({ success: true, data: link });
    } catch (err) {
      next(err);
    }
  }

  static async listLinks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const result = await PaymentLinkService.listLinks({
        merchantId: merchantId!,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
      });

      res.status(200).json({
        success: true,
        data: result.links,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }
}
