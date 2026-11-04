import {
  Payment,
  Order,
  Refund,
  IRefund
} from '../database/models';
import {
  PaymentStatus,
  OrderStatus,
  RefundStatus,
  generateRandomId
} from '@rgs-ledger/shared';
import {
  SandboxPaymentProvider,
  PaymentStateMachine,
  DoubleEntryLedger
} from '@rgs-ledger/payment-core';
import { LedgerService } from './ledger.service';
import { enqueueWebhook } from '../queues/webhook-queue';

export class RefundService {
  private static sandboxProvider = new SandboxPaymentProvider();

  static async createRefund(data: {
    paymentId: string;
    amount: number; // in paise
    reason: string;
    notes?: Record<string, string>;
    merchantId?: string;
  }): Promise<IRefund> {
    const paymentQuery: any = { _id: data.paymentId };
    if (data.merchantId) paymentQuery.merchantId = data.merchantId;

    const payment = await Payment.findOne(paymentQuery).exec();
    if (!payment) {
      const err: any = new Error(`Payment ${data.paymentId} not found`);
      err.status = 404;
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }

    if (payment.status !== PaymentStatus.SUCCESS) {
      const err: any = new Error('Only successfully captured payments can be refunded.');
      err.status = 400;
      err.code = 'PAYMENT_NOT_CAPTURED';
      throw err;
    }

    const order = await Order.findById(payment.orderId).exec();
    if (!order) {
      const err: any = new Error(`Order ${payment.orderId} not found`);
      err.status = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    // Check refund ceiling: total refunded + current refund cannot exceed captured amount
    const existingRefunds = await Refund.find({
      paymentId: payment._id,
      status: { $in: [RefundStatus.PROCESSED, RefundStatus.PENDING] }
    }).exec();

    const alreadyRefundedPaise = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
    const availableForRefundPaise = payment.amount - alreadyRefundedPaise;

    if (data.amount > availableForRefundPaise) {
      const err: any = new Error(
        `Requested refund amount (${data.amount} paise) exceeds available refundable amount (${availableForRefundPaise} paise).`
      );
      err.status = 400;
      err.code = 'REFUND_AMOUNT_EXCEEDED';
      throw err;
    }

    const refundId = generateRandomId('ref');

    // Create refund record
    const refund = await Refund.create({
      _id: refundId,
      paymentId: String(payment._id),
      orderId: String(payment.orderId),
      merchantId: payment.merchantId,
      amount: data.amount,
      currency: payment.currency,
      status: RefundStatus.PENDING,
      reason: data.reason,
      notes: data.notes,
      environment: payment.environment
    });

    // Execute through provider adapter
    const providerRes = await this.sandboxProvider.createRefund({
      refundId: String(refund._id),
      paymentId: String(payment._id),
      providerPaymentId: payment.providerPaymentId || '',
      amount: data.amount,
      currency: payment.currency,
      reason: data.reason
    });

    refund.providerRefundId = providerRes.providerRefundId;
    refund.status = providerRes.status;
    await refund.save();

    if (refund.status === RefundStatus.PROCESSED) {
      // Record double-entry financial ledger journal for refund
      const refundJournal = DoubleEntryLedger.createRefundJournal({
        merchantId: payment.merchantId,
        refundId: String(refund._id),
        refundAmountMinor: refund.amount,
        currency: refund.currency
      });
      await LedgerService.recordJournal(refundJournal);

      // Update Order Refund Status
      order.amountRefunded += refund.amount;
      if (order.amountRefunded >= order.amount) {
        order.status = OrderStatus.REFUNDED;
      } else {
        order.status = OrderStatus.PARTIALLY_REFUNDED;
      }
      await order.save();

      // Emit refund.processed webhook
      enqueueWebhook({
        merchantId: payment.merchantId,
        event: 'refund.processed',
        payload: {
          refundId: String(refund._id),
          paymentId: String(payment._id),
          orderId: String(order._id),
          amount: refund.amount,
          currency: refund.currency,
          status: refund.status,
          reason: refund.reason
        }
      });
    }

    return refund;
  }

  static async getRefund(refundId: string, merchantId?: string): Promise<IRefund> {
    const query: any = { _id: refundId };
    if (merchantId) query.merchantId = merchantId;

    const refund = await Refund.findOne(query).exec();
    if (!refund) {
      const err: any = new Error(`Refund ${refundId} not found`);
      err.status = 404;
      err.code = 'REFUND_NOT_FOUND';
      throw err;
    }
    return refund;
  }

  static async listRefunds(params: {
    merchantId?: string;
    paymentId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const query: any = {};
    if (params.merchantId) query.merchantId = params.merchantId;
    if (params.paymentId) query.paymentId = params.paymentId;

    const [refunds, total] = await Promise.all([
      Refund.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Refund.countDocuments(query).exec()
    ]);

    return {
      refunds,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
