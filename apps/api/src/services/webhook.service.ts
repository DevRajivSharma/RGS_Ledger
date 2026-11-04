import crypto from 'crypto';
import {
  WebhookEndpoint,
  WebhookDelivery,
  IWebhookEndpoint,
  IWebhookDelivery
} from '../database/models';
import {
  WebhookEventName,
  generateRandomId
} from '@rgs-ledger/shared';
import { processWebhookDelivery } from '../queues/webhook-queue';

export class WebhookService {
  static async createEndpoint(data: {
    merchantId: string;
    url: string;
    events: WebhookEventName[];
  }): Promise<IWebhookEndpoint> {
    const endpointId = generateRandomId('whep');
    const secretKey = `whsec_${crypto.randomBytes(24).toString('hex')}`;

    const endpoint = await WebhookEndpoint.create({
      _id: endpointId,
      merchantId: data.merchantId,
      url: data.url,
      events: data.events,
      secretKey,
      isActive: true
    });

    return endpoint;
  }

  static async listEndpoints(merchantId: string): Promise<IWebhookEndpoint[]> {
    return WebhookEndpoint.find({ merchantId, isActive: true }).sort({ createdAt: -1 }).exec();
  }

  static async deleteEndpoint(endpointId: string, merchantId: string): Promise<boolean> {
    const res = await WebhookEndpoint.updateOne(
      { _id: endpointId, merchantId },
      { $set: { isActive: false } }
    ).exec();
    return res.modifiedCount > 0;
  }

  static async listDeliveries(params: {
    merchantId: string;
    endpointId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const query: any = { merchantId: params.merchantId };
    if (params.endpointId) query.endpointId = params.endpointId;

    const [deliveries, total] = await Promise.all([
      WebhookDelivery.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      WebhookDelivery.countDocuments(query).exec()
    ]);

    return {
      deliveries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async retryDelivery(deliveryId: string, merchantId: string): Promise<boolean> {
    const delivery = await WebhookDelivery.findOne({ _id: deliveryId, merchantId }).exec();
    if (!delivery) {
      const err: any = new Error(`Delivery ${deliveryId} not found`);
      err.status = 404;
      err.code = 'DELIVERY_NOT_FOUND';
      throw err;
    }

    setImmediate(async () => {
      await processWebhookDelivery({
        merchantId: delivery.merchantId,
        event: delivery.event,
        payload: delivery.payload
      });
    });

    return true;
  }
}
