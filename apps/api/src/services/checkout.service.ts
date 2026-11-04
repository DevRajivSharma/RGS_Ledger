import {
  Order,
  Merchant,
  CheckoutSession,
  ICheckoutSession
} from '../database/models';
import {
  generateRandomId
} from '@rgs-ledger/shared';
import { GenericUPIIntentProvider } from '@rgs-ledger/payment-core';
import { config } from '../config';

export class CheckoutService {
  static async createSession(data: {
    orderId: string;
    merchantId: string;
    successUrl: string;
    cancelUrl: string;
    expiresInMinutes?: number;
  }): Promise<ICheckoutSession> {
    const order = await Order.findOne({ _id: data.orderId, merchantId: data.merchantId }).exec();
    if (!order) {
      const err: any = new Error(`Order ${data.orderId} not found`);
      err.status = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    const sessionId = generateRandomId('cs');
    const minutes = data.expiresInMinutes || 30;
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

    const session = await CheckoutSession.create({
      _id: sessionId,
      orderId: order._id,
      merchantId: order.merchantId,
      amount: order.amount,
      currency: order.currency,
      status: 'OPEN',
      successUrl: data.successUrl,
      cancelUrl: data.cancelUrl,
      expiresAt
    });

    return session;
  }

  static async getSession(sessionId: string) {
    const session = await CheckoutSession.findById(sessionId).exec();
    if (!session) {
      const err: any = new Error(`Checkout session ${sessionId} not found`);
      err.status = 404;
      err.code = 'SESSION_NOT_FOUND';
      throw err;
    }

    if (new Date() > session.expiresAt) {
      session.status = 'EXPIRED';
      await session.save();
    }

    const [order, merchant] = await Promise.all([
      Order.findById(session.orderId).exec(),
      Merchant.findById(session.merchantId).exec()
    ]);

    // Generate UPI Intent URI for QR and App Launch
    const upiUri = GenericUPIIntentProvider.generateIntentUri({
      payeeVpa: 'sandbox-merchant@rgsbank',
      payeeName: merchant?.businessName || 'RGS Merchant',
      transactionRef: session._id,
      amountPaise: session.amount,
      currency: session.currency
    });

    return {
      session: {
        id: String(session._id),
        orderId: String(session.orderId),
        merchantId: String(session.merchantId),
        amount: session.amount,
        currency: session.currency,
        status: session.status,
        successUrl: session.successUrl,
        cancelUrl: session.cancelUrl,
        expiresAt: session.expiresAt,
        upiUri
      },
      merchant: {
        id: merchant ? String(merchant._id) : undefined,
        businessName: merchant?.businessName || 'RGS Merchant',
        website: merchant?.website
      },
      order: {
        id: order ? String(order._id) : undefined,
        status: order?.status,
        receipt: order?.receipt,
        customer: order?.customer
      }
    };
  }
}
