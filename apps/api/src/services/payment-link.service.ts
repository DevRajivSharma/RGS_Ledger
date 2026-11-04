import {
  PaymentLink,
  IPaymentLink
} from '../database/models';
import {
  OrderStatus,
  EnvironmentMode,
  generateRandomId
} from '@rgs-ledger/shared';
import { OrderService } from './order.service';
import { CheckoutService } from './checkout.service';
import { config } from '../config';

export class PaymentLinkService {
  static async createLink(data: {
    merchantId: string;
    amount: number; // in paise
    title: string;
    description?: string;
    currency?: string;
    customer?: { name?: string; email?: string; phone?: string };
    expireBy?: string;
  }): Promise<IPaymentLink & { checkoutUrl: string }> {
    // 1. Create underlying Order
    const order = await OrderService.createOrder({
      merchantId: data.merchantId,
      amount: data.amount,
      currency: data.currency || 'INR',
      notes: { title: data.title, type: 'payment_link' },
      customer: data.customer
    });

    // 2. Create Hosted Checkout Session
    const session = await CheckoutService.createSession({
      orderId: String(order._id),
      merchantId: data.merchantId,
      successUrl: `${config.checkoutUrl}/status/success`,
      cancelUrl: `${config.checkoutUrl}/status/cancel`,
      expiresInMinutes: 1440 // 24 hours
    });

    const linkId = generateRandomId('plink');
    const checkoutUrl = `${config.checkoutUrl}/pay/${session._id}`;

    const link = await PaymentLink.create({
      _id: linkId,
      merchantId: data.merchantId,
      orderId: String(order._id),
      title: data.title,
      description: data.description,
      amount: data.amount,
      currency: data.currency || 'INR',
      status: 'ACTIVE',
      customer: data.customer,
      expireBy: data.expireBy ? new Date(data.expireBy) : undefined
    });

    return Object.assign(link.toObject(), { checkoutUrl });
  }

  static async getLink(linkId: string, merchantId?: string): Promise<IPaymentLink> {
    const query: any = { _id: linkId };
    if (merchantId) query.merchantId = merchantId;

    const link = await PaymentLink.findOne(query).exec();
    if (!link) {
      const err: any = new Error(`Payment link ${linkId} not found`);
      err.status = 404;
      err.code = 'LINK_NOT_FOUND';
      throw err;
    }
    return link;
  }

  static async deactivateLink(linkId: string, merchantId: string): Promise<IPaymentLink> {
    const link = await PaymentLink.findOne({ _id: linkId, merchantId }).exec();
    if (!link) {
      const err: any = new Error(`Payment link ${linkId} not found`);
      err.status = 404;
      err.code = 'LINK_NOT_FOUND';
      throw err;
    }

    link.status = 'DEACTIVATED';
    await link.save();
    return link;
  }

  static async listLinks(params: { merchantId: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const [links, total] = await Promise.all([
      PaymentLink.find({ merchantId: params.merchantId }).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      PaymentLink.countDocuments({ merchantId: params.merchantId }).exec()
    ]);

    return {
      links,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
