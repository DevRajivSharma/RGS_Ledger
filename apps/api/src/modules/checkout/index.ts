import { Router, Request, Response } from 'express';
import { PaymentRequestModel } from '../../database/models.js';
import { PaymentStatus } from '@rgs-ledger/shared-types';
import { buildIntentLinks } from 'upipay';
import { ApiResponse, PublicCheckoutDetails } from '@rgs-ledger/api-contracts';
import { defaultPaymentLinkService } from '../payments/payment-link.service.js';

const router = Router();

/**
 * GET /api/v1/checkout/link/:linkRef - Get public details of a payment link
 */
router.get('/link/:linkRef', async (req: Request, res: Response, next) => {
  try {
    const linkRef = req.params.linkRef?.trim();
    if (!linkRef) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REFERENCE', message: 'Payment link reference is required' }
      });
      return;
    }

    const details = await defaultPaymentLinkService.getPublicPaymentLink(linkRef);
    const response: ApiResponse = {
      success: true,
      data: details,
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err: any) {
    if (err.message?.includes('not found') || err.message?.includes('revoked')) {
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
 * POST /api/v1/checkout/link/:linkRef/initiate - Initiate payment from a payment link
 */
router.post('/link/:linkRef/initiate', async (req: Request, res: Response, next) => {
  try {
    const linkRef = req.params.linkRef?.trim();
    if (!linkRef) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REFERENCE', message: 'Payment link reference is required' }
      });
      return;
    }

    const session = await defaultPaymentLinkService.initiatePaymentFromLink(linkRef, req.body || {});
    const response: ApiResponse = {
      success: true,
      data: session,
      message: 'Payment session created successfully',
      meta: { timestamp: new Date().toISOString() }
    };
    res.status(201).json(response);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: err.message }
      });
      return;
    }
    if (err.message?.includes('expired') || err.message?.includes('inactive') || err.message?.includes('revoked')) {
      res.status(410).json({
        success: false,
        error: { code: 'LINK_UNAVAILABLE', message: err.message }
      });
      return;
    }
    next(err);
  }
});

router.get('/:reference', async (req: Request, res: Response, next) => {
  try {
    const reference = req.params.reference?.trim();
    if (!reference) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REFERENCE', message: 'Checkout reference is required' }
      });
      return;
    }

    const payment = await PaymentRequestModel.findOne({ checkoutReference: reference });
    if (!payment) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payment checkout session not found or has expired' }
      });
      return;
    }

    const now = new Date();
    let currentStatus = payment.status;

    // Auto-expire if payment window has passed and still PENDING
    if (currentStatus === PaymentStatus.PENDING && now > new Date(payment.expiresAt)) {
      payment.status = PaymentStatus.EXPIRED;
      await payment.save();
      currentStatus = PaymentStatus.EXPIRED;
    }

    const isExpired = currentStatus === PaymentStatus.EXPIRED || now > new Date(payment.expiresAt);
    const amountRupees = payment.amountPaise / 100;
    const intentLinks = buildIntentLinks(payment.upiUri);

    const publicDetails: PublicCheckoutDetails = {
      checkoutReference: payment.checkoutReference,
      merchantName: payment.merchantName,
      orderId: payment.orderId,
      amountPaise: payment.amountPaise,
      amountRupees,
      qrDataUrl: payment.qrDataUrl,
      upiUri: payment.upiUri,
      intentLinks: {
        generic: intentLinks.generic,
        phonepe: intentLinks.phonepe,
        gpay: intentLinks.gpay,
        paytm: intentLinks.paytm,
        bhim: intentLinks.bhim
      },
      status: currentStatus as PaymentStatus,
      description: payment.description,
      expiresAt: payment.expiresAt.toISOString(),
      isExpired,
      disclosure: 'Non-custodial UPI: money transfers directly to the merchant bank account. RGS Ledger does not hold funds.'
    };

    const response: ApiResponse<PublicCheckoutDetails> = {
      success: true,
      data: publicDetails,
      meta: { timestamp: new Date().toISOString() }
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});

export const checkoutRouter = router;
