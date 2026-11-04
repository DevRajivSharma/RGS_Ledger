import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { signWebhookPayload } from '@rgs-ledger/shared';
import { WebhookEndpoint, WebhookDelivery } from '../database/models';
import { generateRandomId } from '@rgs-ledger/shared';
import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface WebhookJobData {
  merchantId: string;
  event: string;
  payload: Record<string, any>;
}

let redisClient: IORedis | null = null;
let webhookQueue: Queue | null = null;
let webhookWorker: Worker | null = null;
let useInMemoryQueue = false;

// Memory queue fallback
const memoryQueue: WebhookJobData[] = [];

/**
 * Validates against SSRF (Server-Side Request Forgery) attacks.
 * Rejects localhost, 127.0.0.1, 169.254.169.254 (cloud metadata), RFC1918 private ranges.
 */
export function isAllowedWebhookUrl(targetUrl: string): { allowed: boolean; reason?: string } {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { allowed: false, reason: 'Only http and https protocols are supported' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Cloud metadata service is ALWAYS blocked across all environments
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return { allowed: false, reason: 'SSRF Protection: Webhooks cannot target cloud instance metadata service' };
    }

    // In production, block all loopback, private RFC1918 addresses, and internal domains
    const isProduction = process.env.NODE_ENV === 'production' || config.env === 'production';
    if (isProduction) {
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.local')
      ) {
        return { allowed: false, reason: 'SSRF Protection: Webhooks cannot target internal or private network IP addresses' };
      }
    }

    return { allowed: true };
  } catch (err: any) {
    return { allowed: false, reason: `Invalid URL: ${err.message}` };
  }
}

/**
 * Executes outbound HTTP POST request to merchant webhook endpoint
 */
async function deliverWebhookToEndpoint(
  endpointUrl: string,
  secretKey: string,
  event: string,
  payload: Record<string, any>
): Promise<{ statusCode: number; responseBody: string; success: boolean }> {
  const urlCheck = isAllowedWebhookUrl(endpointUrl);
  if (!urlCheck.allowed) {
    return {
      statusCode: 400,
      responseBody: `Blocked by SSRF filter: ${urlCheck.reason}`,
      success: false
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({
    id: generateRandomId('evt'),
    event,
    createdAt: new Date().toISOString(),
    data: payload
  });

  const signature = signWebhookPayload(rawBody, secretKey, timestamp);
  const signatureHeader = `t=${timestamp},v1=${signature}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RGS-Ledger-Webhook-Delivery/1.0',
        'x-rgs-signature': signatureHeader,
        'x-rgs-event': event
      },
      body: rawBody,
      signal: controller.signal
    });

    clearTimeout(timeout);
    const text = await res.text();

    return {
      statusCode: res.status,
      responseBody: text.slice(0, 1000), // cap to 1000 chars
      success: res.ok
    };
  } catch (err: any) {
    return {
      statusCode: 0,
      responseBody: err.message || 'Delivery request failed',
      success: false
    };
  }
}

/**
 * Processes a single webhook job: finds registered merchant endpoints and delivers
 */
export async function processWebhookDelivery(data: WebhookJobData): Promise<void> {
  try {
    const endpoints = await WebhookEndpoint.find({
      merchantId: data.merchantId,
      isActive: true,
      events: data.event
    }).exec();

    if (!endpoints || endpoints.length === 0) {
      return;
    }

    for (const ep of endpoints) {
      const result = await deliverWebhookToEndpoint(ep.url, ep.secretKey, data.event, data.payload);

      try {
        await WebhookDelivery.create({
          _id: generateRandomId('whd'),
          merchantId: data.merchantId,
          endpointId: ep.id || ep._id,
          event: data.event,
          payload: data.payload,
          statusCode: result.statusCode,
          responseBody: result.responseBody,
          attemptNumber: 1,
          isSuccessful: result.success
        });
      } catch (dbErr) {
        // Log silently if DB offline
      }
    }
  } catch (err: any) {
    console.error(`[WebhookWorker] Delivery error: ${err.message}`);
  }
}

export function initWebhookQueue(): void {
  try {
    redisClient = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy: () => null // don't spam if redis offline
    });

    redisClient.connect().then(() => {
      console.log('[Queue] Redis connected for BullMQ webhook delivery.');
      webhookQueue = new Queue('webhook-delivery', { connection: redisClient as any });
      webhookWorker = new Worker('webhook-delivery', async (job) => {
        await processWebhookDelivery(job.data);
      }, { connection: redisClient as any });
    }).catch(() => {
      console.log('[Queue] Redis offline. Operating in resilient In-Memory webhook queue mode.');
      useInMemoryQueue = true;
    });
  } catch (err) {
    useInMemoryQueue = true;
  }
}

export async function enqueueWebhook(data: WebhookJobData): Promise<void> {
  if (webhookQueue && !useInMemoryQueue) {
    try {
      await webhookQueue.add('send-webhook', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true
      });
      return;
    } catch {
      useInMemoryQueue = true;
    }
  }

  // Resilient in-memory async processing
  setImmediate(async () => {
    await processWebhookDelivery(data);
  });
}
