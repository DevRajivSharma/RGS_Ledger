import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/order.service';

export class OrderController {
  static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      if (!merchantId) {
        res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No merchant ID identified' } });
        return;
      }

      const order = await OrderService.createOrder({
        merchantId,
        amount: req.body.amount,
        currency: req.body.currency,
        receipt: req.body.receipt,
        notes: req.body.notes,
        customer: req.body.customer
      });

      res.status(201).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  }

  static async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const order = await OrderService.getOrder(req.params.id, req.merchantId);
      res.status(200).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  }

  static async listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      if (!merchantId) {
        res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No merchant ID' } });
        return;
      }

      const result = await OrderService.listOrders({
        merchantId,
        status: req.query.status as any,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
      });

      res.status(200).json({
        success: true,
        data: result.orders,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }
}
