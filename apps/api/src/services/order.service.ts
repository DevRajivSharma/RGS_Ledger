import { Order, Customer, IOrder } from '../database/models';
import {
  OrderStatus,
  EnvironmentMode,
  generateRandomId
} from '@rgs-ledger/shared';
import { enqueueWebhook } from '../queues/webhook-queue';

export class OrderService {
  static async createOrder(data: {
    merchantId: string;
    amount: number; // in paise
    currency?: string;
    receipt?: string;
    notes?: Record<string, string>;
    customer?: { id?: string; name?: string; email?: string; phone?: string };
    environment?: EnvironmentMode;
  }): Promise<IOrder> {
    if (!Number.isInteger(data.amount) || data.amount < 100) {
      const err: any = new Error('Order amount must be at least 100 paise (₹1.00)');
      err.status = 400;
      err.code = 'INVALID_AMOUNT';
      throw err;
    }

    const orderId = generateRandomId('ord');

    // Handle customer upsert if customer info provided
    let customerId = data.customer?.id;
    if (!customerId && data.customer?.name) {
      customerId = generateRandomId('cust');
      await Customer.create({
        _id: customerId,
        merchantId: data.merchantId,
        name: data.customer.name,
        email: data.customer.email,
        phone: data.customer.phone
      }).catch(() => {});
    }

    const order = await Order.create({
      _id: orderId,
      merchantId: data.merchantId,
      amount: data.amount,
      currency: data.currency || 'INR',
      status: OrderStatus.CREATED,
      receipt: data.receipt,
      notes: data.notes,
      customer: {
        id: customerId,
        name: data.customer?.name,
        email: data.customer?.email,
        phone: data.customer?.phone
      },
      environment: data.environment || EnvironmentMode.SANDBOX
    });

    // Fire webhook asynchronously
    enqueueWebhook({
      merchantId: data.merchantId,
      event: 'order.created',
      payload: {
        orderId: order._id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        receipt: order.receipt
      }
    });

    return order;
  }

  static async getOrder(orderId: string, merchantId?: string): Promise<IOrder> {
    const query: any = { _id: orderId };
    if (merchantId) query.merchantId = merchantId;

    const order = await Order.findOne(query).exec();
    if (!order) {
      const err: any = new Error(`Order ${orderId} not found`);
      err.status = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }
    return order;
  }

  static async listOrders(params: {
    merchantId: string;
    status?: OrderStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const query: any = { merchantId: params.merchantId };
    if (params.status) query.status = params.status;

    const [orders, total] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Order.countDocuments(query).exec()
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
