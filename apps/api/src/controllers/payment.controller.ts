import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/payment.service';
import { RefundService } from '../services/refund.service';

export class PaymentController {
  static async initiatePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PaymentService.initiatePayment({
        orderId: req.body.orderId,
        method: req.body.method,
        upiId: req.body.upiId,
        cardDetails: req.body.cardDetails,
        bankCode: req.body.bankCode,
        customerIp: req.ip
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await PaymentService.getPayment(req.params.id, req.merchantId);
      res.status(200).json({ success: true, data: payment });
    } catch (err) {
      next(err);
    }
  }

  static async listPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const result = await PaymentService.listPayments({
        merchantId,
        orderId: req.query.orderId as string,
        status: req.query.status as any,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
      });

      res.status(200).json({
        success: true,
        data: result.payments,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  static async createRefund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const refund = await RefundService.createRefund({
        paymentId: req.params.id,
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
}
