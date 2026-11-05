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

  static async initiatePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await CheckoutService.initiatePayment(req.params.sessionId, {
        method: req.body.method as PaymentMethodType,
        upiId: req.body.upiId,
        cardDetails: req.body.cardDetails,
        bankCode: req.body.bankCode,
        customerIp: req.ip
      });

      res.status(201).json({
        success: true,
        data: result
      });
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

      // Step 1: Ensure persistent PENDING payment attempt exists
      let paymentId = req.body.paymentId || sessionData.session.paymentId;
      let upiUri = sessionData.session.upiUri;

      if (!paymentId) {
        const attempt = await CheckoutService.initiatePayment(req.params.sessionId, {
          method: (req.body.method as PaymentMethodType) || PaymentMethodType.UPI_QR,
          upiId: req.body.upiId,
          cardDetails: req.body.cardDetails,
          bankCode: req.body.bankCode,
          customerIp: req.ip
        });
        paymentId = attempt.payment._id;
        upiUri = attempt.upiUri;
      }

      // Step 2: Determine resolution action
      const amountStr = sessionData.session.amount.toString();
      const isFail = req.body.action === 'FAILED' || 
                     req.body.status === 'FAILED' || 
                     req.body.upiId === 'fail@rgs' || 
                     amountStr.endsWith('01');

      const isPending = req.body.action === 'PENDING' || 
                        req.body.status === 'PENDING' || 
                        req.body.upiId === 'pending@rgs' || 
                        amountStr.endsWith('02');

      const action = isFail ? 'FAILED' : (isPending ? 'PENDING' : 'SUCCESS');

      // Step 3: Resolve the existing payment
      const resolved = await PaymentService.resolvePayment({
        paymentId,
        action,
        errorCode: isFail ? 'PAYMENT_FAILED_USER_DECLINED' : undefined,
        errorMessage: isFail ? 'Transaction declined by user in UPI App (Simulated Sandbox)' : undefined
      });

      if (action === 'SUCCESS') {
        // Mark session completed
        const { CheckoutSession } = await import('../database/models');
        await CheckoutSession.findByIdAndUpdate(req.params.sessionId, { status: 'COMPLETED' }).exec();
      }

      res.status(200).json({
        success: true,
        data: {
          payment: resolved.payment,
          order: resolved.order,
          upiUri,
          successUrl: sessionData.session.successUrl,
          cancelUrl: sessionData.session.cancelUrl
        }
      });
    } catch (err) {
      next(err);
    }
  }

  static async simulatePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionData = await CheckoutService.getSession(req.params.sessionId);
      let paymentId = req.body.paymentId || sessionData.session.paymentId;

      if (!paymentId) {
        const attempt = await CheckoutService.initiatePayment(req.params.sessionId, {
          method: (req.body.method as PaymentMethodType) || PaymentMethodType.UPI_QR
        });
        paymentId = attempt.payment._id;
      }

      const action = (req.body.action as 'SUCCESS' | 'FAILED' | 'PENDING') || 'SUCCESS';
      const resolved = await PaymentService.resolvePayment({
        paymentId,
        action,
        errorCode: action === 'FAILED' ? (req.body.errorCode || 'PAYMENT_FAILED_USER_DECLINED') : undefined,
        errorMessage: action === 'FAILED' ? (req.body.errorMessage || 'Transaction declined by user in UPI App (Simulated Sandbox)') : undefined
      });

      if (action === 'SUCCESS') {
        const { CheckoutSession } = await import('../database/models');
        await CheckoutSession.findByIdAndUpdate(req.params.sessionId, { status: 'COMPLETED' }).exec();
      }

      res.status(200).json({
        success: true,
        data: {
          payment: resolved.payment,
          order: resolved.order
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
