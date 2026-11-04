import { Request, Response, NextFunction } from 'express';
import { CheckoutService } from '../services/checkout.service';
import { PaymentService } from '../services/payment.service';
import { PaymentMethodType } from '@rgs-ledger/shared';
import { config } from '../config';

export class CheckoutController {
  static async createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      if (!merchantId) {
        res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No merchant ID' } });
        return;
      }

      const session = await CheckoutService.createSession({
        orderId: req.body.orderId,
        merchantId,
        successUrl: req.body.successUrl,
        cancelUrl: req.body.cancelUrl,
        expiresInMinutes: req.body.expiresInMinutes
      });

      const checkoutUrl = `${config.checkoutUrl}/pay/${session._id}`;

      res.status(201).json({
        success: true,
        data: {
          session,
          checkoutUrl
        }
      });
    } catch (err) {
      next(err);
    }
  }

  static async getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionData = await CheckoutService.getSession(req.params.sessionId);
      res.status(200).json({ success: true, data: sessionData });
    } catch (err) {
      next(err);
    }
  }

  static async processPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionData = await CheckoutService.getSession(req.params.sessionId);
      if (sessionData.session.status === 'EXPIRED') {
        res.status(400).json({ success: false, error: { code: 'SESSION_EXPIRED', message: 'Checkout session has expired.' } });
        return;
      }

      const result = await PaymentService.initiatePayment({
        orderId: sessionData.session.orderId,
        method: req.body.method as PaymentMethodType,
        upiId: req.body.upiId,
        cardDetails: req.body.cardDetails,
        bankCode: req.body.bankCode,
        customerIp: req.ip
      });

      res.status(200).json({
        success: true,
        data: {
          payment: result.payment,
          order: result.order,
          upiUri: result.upiUri,
          successUrl: sessionData.session.successUrl,
          cancelUrl: sessionData.session.cancelUrl
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
