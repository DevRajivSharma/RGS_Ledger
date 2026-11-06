import { Request, Response } from 'express';
import { Payment, Order, MerchantProviderAccount } from '../database/models';
import { PaymentStatus, ProviderType, EnvironmentMode } from '@rgs-ledger/shared';
import { MerchantProviderService } from '../services/merchant-provider.service';
import { PaymentService } from '../services/payment.service';
import { config } from '../config';

export class CallbackController {
  /**
   * Phase 1 & 7: Handles PhonePe Server-to-Server Webhook Callbacks
   * 
   * Strict validation lifecycle:
   * 1. Preserves raw body and reads X-VERIFY header.
   * 2. Extracts merchant and order reference.
   * 3. Authoritatively verifies signature against merchant's salt key.
   * 4. Queries PhonePe Status API independently with expectedAmount check.
   * 5. Atomically resolves payment status and double-entry ledger capture.
   */
  static async handlePhonePeCallback(req: Request, res: Response) {
    try {
      const signature = req.headers['x-verify'] as string;
      const rawPayload = (req as any).rawBody || req.body;

      if (!signature) {
        return res.status(400).json({ success: false, message: 'Missing X-VERIFY signature header' });
      }

      // Parse payload to identify transaction/order
      let payloadObj = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
      if (Buffer.isBuffer(rawPayload)) {
        try {
          payloadObj = JSON.parse(rawPayload.toString('utf8'));
        } catch {
          // keep payloadObj
        }
      }
      if (payloadObj.response) {
        try {
          const decoded = Buffer.from(payloadObj.response, 'base64').toString('utf8');
          payloadObj = JSON.parse(decoded);
        } catch {
          // keep payloadObj
        }
      }

      const orderId = payloadObj.data?.merchantTransactionId || payloadObj.merchantTransactionId;
      if (!orderId) {
        return res.status(400).json({ success: false, message: 'Missing merchantTransactionId in callback' });
      }

      const payment = await Payment.findOne({
        $or: [{ _id: orderId }, { orderId }]
      }).exec();

      if (!payment) {
        return res.status(404).json({ success: false, message: `Payment for order ${orderId} not found` });
      }

      // Idempotency: If already in SUCCESS, respond 200 OK immediately without double capture
      if (payment.status === PaymentStatus.SUCCESS) {
        return res.status(200).json({ success: true, message: 'Payment already captured' });
      }

      // Currency check
      if (payment.currency !== 'INR') {
        return res.status(400).json({ success: false, message: `Invalid transaction currency: ${payment.currency}` });
      }

      // Resolve merchant's PhonePe provider
      const { provider, account } = await MerchantProviderService.resolveProviderForPayment(
        payment.merchantId,
        payment.method,
        payment.environment
      );

      // Verify webhook signature with expectedAmount protection
      const verifyResult: any = provider.verifyWebhook(rawPayload, signature, undefined, {
        expectedAmount: payment.amount
      });

      if (!verifyResult.verified) {
        return res.status(401).json({ success: false, message: 'PhonePe webhook signature verification failed' });
      }

      // Authoritative verification via PhonePe Status API (defense-in-depth)
      const statusCheck = await provider.verifyPayment(
        payment.providerPaymentId || String(payment._id),
        payment.amount
      );

      if (statusCheck.status === PaymentStatus.SUCCESS) {
        payment.providerTransactionId = statusCheck.providerTransactionId || verifyResult.transactionId;
        await payment.save();
        await PaymentService.resolvePayment({
          paymentId: String(payment._id),
          action: 'SUCCESS'
        });
      } else if (statusCheck.status === PaymentStatus.FAILED) {
        await PaymentService.resolvePayment({
          paymentId: String(payment._id),
          action: 'FAILED',
          errorCode: statusCheck.errorCode,
          errorMessage: statusCheck.errorMessage
        });
      }

      return res.status(200).json({ success: true, message: 'Callback processed successfully' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Phase 1 & 7: Handles Paytm Browser Form-POST & Server Webhook Callbacks
   * 
   * CRITICAL PAYTM INTEGRATION BEHAVIOR:
   * Paytm redirects the customer's browser via a form-POST request to the callback URL.
   * If requested by a browser navigation, we MUST render a redirection/confirmation HTML page,
   * rather than returning blank JSON to the customer's screen.
   */
  static async handlePaytmCallback(req: Request, res: Response) {
    try {
      const rawPayload = req.body;
      const signature = rawPayload.CHECKSUMHASH || (req.headers['x-checksum'] as string);

      const orderId = rawPayload.ORDERID || rawPayload.orderId;
      if (!orderId) {
        return res.status(400).send('Missing ORDERID in Paytm callback');
      }

      const payment = await Payment.findOne({
        $or: [{ _id: orderId }, { orderId }]
      }).exec();

      if (!payment) {
        return res.status(404).send(`Payment for order ${orderId} not found`);
      }

      // Currency check
      if (payment.currency !== 'INR') {
        return res.status(400).send(`Invalid payment currency: ${payment.currency}`);
      }

      // Amount verification if passed in TXNAMOUNT (rupees string e.g. "500.00")
      if (rawPayload.TXNAMOUNT) {
        const payloadPaise = Math.round(parseFloat(rawPayload.TXNAMOUNT) * 100);
        if (payloadPaise !== payment.amount) {
          return res.status(400).send('Amount mismatch between callback and order');
        }
      }

      const order = await Order.findById(payment.orderId).exec();

      // Idempotency: If already in SUCCESS, respond without double capture
      if (payment.status === PaymentStatus.SUCCESS) {
        const isBrowser = req.headers.accept?.includes('text/html') ||
                          req.headers['content-type']?.includes('application/x-www-form-urlencoded');
        if (isBrowser) {
          const checkoutRedirectUrl = `${config.checkoutUrl}/checkout/${order?._id || payment.orderId}?status=SUCCESS&paymentId=${payment._id}`;
          return res.redirect(checkoutRedirectUrl);
        }
        return res.status(200).json({ success: true, status: PaymentStatus.SUCCESS });
      }

      // Resolve merchant's Paytm provider
      const { provider } = await MerchantProviderService.resolveProviderForPayment(
        payment.merchantId,
        payment.method,
        payment.environment
      );

      // Verify checksum
      const verifyResult: any = provider.verifyWebhook(rawPayload, signature, undefined, {
        expectedAmount: payment.amount
      });

      let finalStatus: PaymentStatus = payment.status;

      if (verifyResult.verified) {
        // Authoritative Status API Check
        const statusCheck = await provider.verifyPayment(
          payment.providerPaymentId || String(payment._id),
          payment.amount
        );

        if (statusCheck.status === PaymentStatus.SUCCESS) {
          payment.providerTransactionId = statusCheck.providerTransactionId || rawPayload.TXNID;
          await payment.save();
          await PaymentService.resolvePayment({
            paymentId: String(payment._id),
            action: 'SUCCESS'
          });
          finalStatus = PaymentStatus.SUCCESS;
        } else if (statusCheck.status === PaymentStatus.FAILED) {
          await PaymentService.resolvePayment({
            paymentId: String(payment._id),
            action: 'FAILED',
            errorCode: statusCheck.errorCode || rawPayload.RESPCODE,
            errorMessage: statusCheck.errorMessage || rawPayload.RESPMSG
          });
          finalStatus = PaymentStatus.FAILED;
        }
      }

      // Check if this is a browser navigation (Paytm redirects customer browser via POST)
      const isBrowser = req.headers.accept?.includes('text/html') ||
                        req.headers['content-type']?.includes('application/x-www-form-urlencoded');

      if (isBrowser) {
        const checkoutRedirectUrl = `${config.checkoutUrl}/checkout/${order?._id || payment.orderId}?status=${finalStatus}&paymentId=${payment._id}`;
        // Return a clean HTML auto-redirect page instead of raw blank JSON
        return res.status(200).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Payment Completed - RGS Ledger</title>
              <meta http-equiv="refresh" content="1;url=${checkoutRedirectUrl}">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #0b132b; color: #ffffff; }
                .card { text-align: center; padding: 2rem; border-radius: 12px; background: #1c2541; max-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
                .spinner { border: 4px solid rgba(255,255,255,0.1); width: 40px; height: 40px; border-radius: 50%; border-left-color: #4ade80; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                a { color: #60a5fa; text-decoration: none; font-weight: 500; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="spinner"></div>
                <h2>Verifying Payment...</h2>
                <p>Redirecting you back to merchant checkout...</p>
                <p><a href="${checkoutRedirectUrl}">Click here if not redirected automatically</a></p>
              </div>
            </body>
          </html>
        `);
      }

      return res.status(200).json({ success: true, status: finalStatus });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
