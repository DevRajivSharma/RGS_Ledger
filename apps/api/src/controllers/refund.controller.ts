import { Request, Response, NextFunction } from 'express';
import { RefundService } from '../services/refund.service';

export class RefundController {
  static async createRefund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const refund = await RefundService.createRefund({
        paymentId: req.body.paymentId,
        amount: req.body.amount,
        reason: req.body.reason,
        notes: req.body.notes,
        merchantId
      });

      res.status(201).json({ success: true, data: refund });
    } catch (err) {
      next(err);
    }
  }

  static async getRefund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refund = await RefundService.getRefund(req.params.id, req.merchantId);
      res.status(200).json({ success: true, data: refund });
    } catch (err) {
      next(err);
    }
  }

  static async listRefunds(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const result = await RefundService.listRefunds({
        merchantId,
        paymentId: req.query.paymentId as string,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
      });

      res.status(200).json({
        success: true,
        data: result.refunds,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }
}
