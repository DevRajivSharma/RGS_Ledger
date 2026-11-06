import {
  Order,
  Merchant,
  Payment,
  CheckoutSession,
  ICheckoutSession
} from '../database/models';
import {
  generateRandomId,
  PaymentMethodType
} from '@rgs-ledger/shared';
import { GenericUPIIntentProvider } from '@rgs-ledger/payment-core';
import { PaymentService } from './payment.service';
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

    let existingPayment = session.paymentId ? await Payment.findById(session.paymentId).exec() : null;
    if (!existingPayment) {
      existingPayment = await Payment.findOne({ orderId: session.orderId, status: { $in: ['PENDING', 'SUCCESS'] } }).sort({ createdAt: -1 }).exec();
      if (existingPayment) {
        session.paymentId = existingPayment._id;
        await session.save();
      }
    }

    const [order, merchant] = await Promise.all([
      Order.findById(session.orderId).exec(),
      Merchant.findById(session.merchantId).exec()
    ]);

    // Generate UPI Intent URI for QR and App Launch referencing payment ID if created
    const upiUri = GenericUPIIntentProvider.generateIntentUri({
      payeeVpa: 'sandbox-merchant@rgsbank',
      payeeName: merchant?.businessName || 'RGS Merchant',
      transactionRef: existingPayment ? String(existingPayment._id) : session._id,
      amountPaise: session.amount,
      currency: session.currency
    });

    return {
      session: {
        id: String(session._id),
        orderId: String(session.orderId),
        merchantId: String(session.merchantId),
        paymentId: session.paymentId ? String(session.paymentId) : undefined,
        amount: session.amount,
        currency: session.currency,
        status: session.status,
        successUrl: session.successUrl,
        cancelUrl: session.cancelUrl,
        expiresAt: session.expiresAt,
        upiUri
      },
      payment: existingPayment ? {
        id: String(existingPayment._id),
        status: existingPayment.status,
        method: existingPayment.method,
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        providerPaymentId: existingPayment.providerPaymentId,
        errorCode: existingPayment.errorCode,
        errorDescription: existingPayment.errorDescription
      } : null,
      merchant: {
        id: merchant ? String(merchant._id) : undefined,
        businessName: merchant?.businessName || 'RGS Merchant',
        website: merchant?.website
      },
      order: {
        id: order ? String(order._id) : undefined,
        status: order?.status,
        receipt: order?.receipt,
        customer: order?.customer,
        attemptsCount: order?.attemptsCount || 0
      }
    };
  }

  static async initiatePayment(sessionId: string, data: {
    method: PaymentMethodType;
    upiId?: string;
    cardDetails?: any;
    bankCode?: string;
    customerIp?: string;
  }) {
    const session = await CheckoutSession.findById(sessionId).exec();
    if (!session) {
      const err: any = new Error(`Checkout session ${sessionId} not found`);
      err.status = 404;
      err.code = 'SESSION_NOT_FOUND';
      throw err;
    }

    if (session.status === 'EXPIRED' || new Date() > session.expiresAt) {
      session.status = 'EXPIRED';
      await session.save();
      const err: any = new Error('Checkout session has expired.');
      err.status = 400;
      err.code = 'SESSION_EXPIRED';
      throw err;
    }

    const order = await Order.findById(session.orderId).exec();
    if (!order) {
      const err: any = new Error(`Order ${session.orderId} not found`);
      err.status = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    if (order.status === 'CAPTURED') {
      const err: any = new Error('This order has already been successfully paid and captured.');
      err.status = 400;
      err.code = 'ORDER_ALREADY_CAPTURED';
      throw err;
    }

    // Check if session or order already has an active PENDING payment
    let existingPayment = session.paymentId ? await Payment.findById(session.paymentId).exec() : null;
    if (!existingPayment || existingPayment.status !== 'PENDING') {
      existingPayment = await Payment.findOne({
        orderId: session.orderId,
        status: 'PENDING'
      }).sort({ createdAt: -1 }).exec();
    }

    if (existingPayment && existingPayment.status === 'PENDING') {
      if (existingPayment.method === data.method) {
        session.paymentId = existingPayment._id;
        await session.save();

        const upiUri = GenericUPIIntentProvider.generateIntentUri({
          payeeVpa: 'sandbox-merchant@rgsbank',
          payeeName: 'Sandbox Merchant',
          transactionRef: String(existingPayment._id),
          amountPaise: existingPayment.amount,
          currency: existingPayment.currency
        });

        return {
          payment: existingPayment,
          order,
          upiUri,
          sessionId: session._id
        };
      } else {
        // Method changed: safely cancel old pending attempt to preserve payment history
        existingPayment.status = 'CANCELLED' as any;
        existingPayment.errorCode = 'PAYMENT_METHOD_CHANGED';
        existingPayment.errorDescription = `Superseded: Customer changed payment method from ${existingPayment.method} to ${data.method}`;
        await existingPayment.save();
        session.paymentId = undefined;
      }
    }

    // Create a new persistent payment attempt in PENDING state
    const attempt = await PaymentService.createPaymentAttempt({
      orderId: session.orderId,
      method: data.method,
      upiId: data.upiId,
      cardDetails: data.cardDetails,
      bankCode: data.bankCode,
      customerIp: data.customerIp
    });

    session.paymentId = attempt.payment._id;
    await session.save();

    return {
      payment: attempt.payment,
      order: attempt.order,
      upiUri: attempt.upiUri,
      sessionId: session._id
    };
  }
}
