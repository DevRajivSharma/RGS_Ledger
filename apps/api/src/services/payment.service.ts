import {
  Order,
  Payment,
  Customer,
  IPayment,
  IOrder
} from '../database/models';
import {
  PaymentStatus,
  OrderStatus,
  PaymentMethodType,
  EnvironmentMode,
  generateRandomId
} from '@rgs-ledger/shared';
import {
  SandboxPaymentProvider,
  PaymentStateMachine,
  DoubleEntryLedger
} from '@rgs-ledger/payment-core';
import { LedgerService } from './ledger.service';
import { enqueueWebhook } from '../queues/webhook-queue';

export class PaymentService {
  private static sandboxProvider = new SandboxPaymentProvider();

  static async initiatePayment(data: {
    orderId: string;
    method: PaymentMethodType;
    upiId?: string;
    cardDetails?: {
      cardNumber: string;
      expMonth: number;
      expYear: number;
      cvv: string;
      holderName: string;
    };
    bankCode?: string;
    customerIp?: string;
  }): Promise<{ payment: IPayment; order: IOrder; upiUri?: string }> {
    const order = await Order.findById(data.orderId).exec();
    if (!order) {
      const err: any = new Error(`Order ${data.orderId} not found`);
      err.status = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    if (order.status === OrderStatus.CAPTURED) {
      const err: any = new Error('This order has already been successfully paid and captured.');
      err.status = 400;
      err.code = 'ORDER_ALREADY_CAPTURED';
      throw err;
    }

    // Check Order State Machine transition to ATTEMPTED
    PaymentStateMachine.assertOrderTransition(order.status, OrderStatus.ATTEMPTED);
    order.status = OrderStatus.ATTEMPTED;
    order.attemptsCount += 1;
    await order.save();

    const paymentId = generateRandomId('pay');

    // Create Initial Payment Record in PENDING state
    const payment = await Payment.create({
      _id: paymentId,
      orderId: order._id,
      merchantId: order.merchantId,
      amount: order.amount,
      currency: order.currency,
      status: PaymentStatus.PENDING,
      method: data.method,
      upiId: data.upiId,
      cardNetwork: data.cardDetails?.cardNumber?.startsWith('4') ? 'VISA' : (data.cardDetails ? 'MASTERCARD' : undefined),
      cardLast4: data.cardDetails?.cardNumber ? data.cardDetails.cardNumber.slice(-4) : undefined,
      bankCode: data.bankCode,
      environment: order.environment || EnvironmentMode.SANDBOX
    });

    // Enqueue payment.created webhook
    enqueueWebhook({
      merchantId: order.merchantId,
      event: 'payment.created',
      payload: {
        paymentId: String(payment._id),
        orderId: String(order._id),
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method
      }
    });

    // Execute through Payment Provider Adapter (Sandbox Provider)
    const providerResponse = await this.sandboxProvider.initiatePayment({
      paymentId: String(payment._id),
      orderId: String(order._id),
      amount: order.amount,
      currency: order.currency,
      method: data.method,
      upiId: data.upiId,
      cardDetails: data.cardDetails,
      bankCode: data.bankCode,
      customerIp: data.customerIp
    });

    payment.providerPaymentId = providerResponse.providerPaymentId;

    if (providerResponse.status === PaymentStatus.SUCCESS) {
      PaymentStateMachine.assertPaymentTransition(payment.status, PaymentStatus.SUCCESS);
      payment.status = PaymentStatus.SUCCESS;
      payment.capturedAt = new Date();
      await payment.save();

      // Transition order to CAPTURED
      PaymentStateMachine.assertOrderTransition(order.status, OrderStatus.CAPTURED);
      order.status = OrderStatus.CAPTURED;
      order.amountPaid = order.amount;
      await order.save();

      // Record double-entry financial ledger journal
      const journalBatch = DoubleEntryLedger.createPaymentCaptureJournal({
        merchantId: order.merchantId,
        paymentId: String(payment._id),
        grossAmountMinor: payment.amount,
        currency: payment.currency
      });
      await LedgerService.recordJournal(journalBatch);

      // Update customer lifetime metrics
      if (order.customer?.email) {
        await Customer.findOneAndUpdate(
          { merchantId: order.merchantId, email: order.customer.email.toLowerCase() },
          {
            $inc: { totalPaymentsPaise: payment.amount, paymentsCount: 1 },
            $setOnInsert: { _id: generateRandomId('cust'), name: order.customer.name || 'Customer' }
          },
          { upsert: true }
        ).exec();
      }

      // Enqueue payment.succeeded webhook
      enqueueWebhook({
        merchantId: order.merchantId,
        event: 'payment.succeeded',
        payload: {
          paymentId: String(payment._id),
          orderId: String(order._id),
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          capturedAt: payment.capturedAt
        }
      });
    } else if (providerResponse.status === PaymentStatus.FAILED) {
      payment.status = PaymentStatus.FAILED;
      payment.errorCode = providerResponse.errorCode || 'PAYMENT_FAILED';
      payment.errorDescription = providerResponse.errorMessage || 'Transaction could not be completed';
      await payment.save();

      order.status = OrderStatus.FAILED;
      await order.save();

      enqueueWebhook({
        merchantId: order.merchantId,
        event: 'payment.failed',
        payload: {
          paymentId: payment._id,
          orderId: order._id,
          errorCode: payment.errorCode,
          errorDescription: payment.errorDescription
        }
      });
    } else {
      // Pending state for asynchronous UPI App approval
      payment.status = PaymentStatus.PENDING;
      await payment.save();
    }

    return {
      payment,
      order,
      upiUri: providerResponse.upiUri
    };
  }

  static async getPayment(paymentId: string, merchantId?: string): Promise<IPayment> {
    const query: any = { _id: paymentId };
    if (merchantId) query.merchantId = merchantId;

    const payment = await Payment.findOne(query).exec();
    if (!payment) {
      const err: any = new Error(`Payment ${paymentId} not found`);
      err.status = 404;
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }
    return payment;
  }

  static async listPayments(params: {
    merchantId?: string;
    orderId?: string;
    status?: PaymentStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const query: any = {};
    if (params.merchantId) query.merchantId = params.merchantId;
    if (params.orderId) query.orderId = params.orderId;
    if (params.status) query.status = params.status;

    const [payments, total] = await Promise.all([
      Payment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Payment.countDocuments(query).exec()
    ]);

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
