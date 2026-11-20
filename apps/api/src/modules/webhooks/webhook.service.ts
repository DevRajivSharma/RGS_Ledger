import crypto from 'crypto';
import dns from 'dns';
import http from 'http';
import https from 'https';
import {
  WebhookEndpointModel,
  WebhookEventModel,
  WebhookDeliveryModel
} from '../../database/models.js';
import { WebhookEventType } from '@rgs-ledger/shared-types';
import { isPrivateOrReservedIp } from '@rgs-ledger/validation';
import { config } from '../../config/index.js';
import { platformConfigService } from '../admin/platform-config.service.js';

export interface WebhookSignatureVerificationResult {
  valid: boolean;
  reason?: string;
}

export class WebhookService {
  /**
   * Computes the HMAC-SHA256 signature header for webhook payloads.
   * Format: t=<unix_epoch_seconds>,v1=<hex_signature>
   * Signed string: `${timestamp}.${payload}`
   */
  public computeSignature(payloadString: string, secret: string, timestampSeconds?: number): string {
    const timestamp = timestampSeconds ?? Math.floor(Date.now() / 1000);
    const signaturePayload = `${timestamp}.${payloadString}`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');
    return `t=${timestamp},v1=${hmac}`;
  }

  /**
   * Verifies an incoming webhook signature header against the raw body.
   * Protects against replay attacks using a configurable tolerance window (default 300 seconds / 5 minutes).
   */
  public verifySignature(
    rawPayload: string,
    signatureHeader: string,
    secret: string,
    toleranceSeconds = 300
  ): WebhookSignatureVerificationResult {
    if (!signatureHeader) {
      return { valid: false, reason: 'Missing signature header' };
    }

    const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
      const [key, ...vals] = part.split('=');
      if (key && vals.length > 0) {
        acc[key.trim()] = vals.join('=').trim();
      }
      return acc;
    }, {});

    const timestampStr = parts['t'];
    const signatureHex = parts['v1'];

    if (!timestampStr || !signatureHex) {
      return { valid: false, reason: 'Malformed signature header format. Expected t=<timestamp>,v1=<signature>' };
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return { valid: false, reason: 'Invalid timestamp in signature' };
    }

    const currentSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(currentSeconds - timestamp) > toleranceSeconds) {
      return { valid: false, reason: 'Webhook signature timestamp outside tolerance window (replay attack protection)' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawPayload}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(signatureHex, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, reason: 'Signature mismatch' };
    }

    const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    return isValid
      ? { valid: true }
      : { valid: false, reason: 'Signature mismatch' };
  }

  /**
   * Dispatches an HTTP POST payload to an endpoint and records delivery history.
   * Performs delivery-time DNS inspection and redirect blocking for strict SSRF protection.
   */
  public async deliverToEndpoint(
    endpoint: any,
    eventDocId: string,
    eventType: string,
    payload: Record<string, any>,
    attempt = 1
  ): Promise<{ success: boolean; statusCode?: number; latencyMs?: number; errorMessage?: string; responseBody?: string }> {
    const payloadString = JSON.stringify({
      id: eventDocId,
      event: eventType,
      createdAt: new Date().toISOString(),
      data: payload
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const signatureHeader = this.computeSignature(payloadString, endpoint.secret, timestamp);

    const startTime = Date.now();
    let statusCode: number | undefined;
    let responseBodyText = '';
    let errorMessage: string | undefined;
    let isSuccess = false;

    const isProduction = config.NODE_ENV === 'production';
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(endpoint.url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('SSRF_BLOCKED: Only HTTP and HTTPS protocols are permitted for webhook delivery');
      }
      if (isProduction && parsedUrl.protocol !== 'https:') {
        throw new Error('SSRF_BLOCKED: HTTPS protocol required for webhook delivery in production');
      }
      // Immediate host literal check
      if (
        parsedUrl.hostname.startsWith('169.254.') ||
        parsedUrl.hostname === 'metadata.google.internal' ||
        parsedUrl.hostname === 'instance-data'
      ) {
        throw new Error(`SSRF_BLOCKED: Cloud metadata endpoint ${parsedUrl.hostname} is forbidden`);
      }
      if (isProduction && isPrivateOrReservedIp(parsedUrl.hostname)) {
        throw new Error(`SSRF_BLOCKED: Hostname ${parsedUrl.hostname} is a private/reserved IP`);
      }
    } catch (urlErr: any) {
      const errorMsg = urlErr.message || 'Invalid webhook destination URL';
      await WebhookDeliveryModel.create({
        merchantId: endpoint.merchantId,
        endpointId: endpoint._id,
        eventId: eventDocId,
        eventType,
        statusCode: 400,
        responseStatusCode: 400,
        errorMessage: errorMsg,
        latencyMs: 0,
        attempts: attempt,
        status: 'DEAD_LETTER' // Never retry an SSRF-blocked destination
      }).catch(() => {});

      return {
        success: false,
        statusCode: 400,
        latencyMs: 0,
        errorMessage: errorMsg
      };
    }

    // Execute request with socket-level DNS verification to eliminate TOCTOU DNS rebinding
    const isHttps = parsedUrl.protocol === 'https:';
    const payloadBuffer = Buffer.from(payloadString, 'utf8');

    try {
      const deliveryResult = await new Promise<{
        status?: number;
        body: string;
        ok: boolean;
        error?: string;
        isSsrfBlocked?: boolean;
      }>((resolve) => {
        const transport = isHttps ? https : http;
        const reqOptions: http.RequestOptions = {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'RGS-Ledger-Webhooks/1.0',
            'X-RGS-Signature': signatureHeader,
            'X-RGS-Event': eventType,
            'X-RGS-Delivery-Attempt': attempt.toString(),
            'Content-Length': payloadBuffer.length,
            'Host': parsedUrl.host
          },
          // Custom lookup callback executes synchronously inside the socket connection process
          // Intercepts the EXACT resolved IP address before any TCP connection is established
          lookup: (hostname, _lookupOpts, callback: any) => {
            dns.lookup(hostname, { all: true }, (err, addresses) => {
              if (err) return callback(err);
              if (!addresses || addresses.length === 0) {
                return callback(new Error(`DNS_RESOLUTION_FAILED: Hostname ${hostname} could not be resolved`));
              }
              for (const addr of addresses) {
                const ip = addr.address;
                // Cloud metadata is blocked in all environments
                if (ip.startsWith('169.254.') || ip === '::ffff:169.254.169.254') {
                  const ssrfErr: any = new Error(`SSRF_BLOCKED: Hostname ${hostname} resolves to cloud metadata IP (${ip})`);
                  ssrfErr.isSsrf = true;
                  return callback(ssrfErr);
                }
                // Private/reserved IP check in production
                if (isProduction && isPrivateOrReservedIp(ip)) {
                  const ssrfErr: any = new Error(`SSRF_BLOCKED: Hostname ${hostname} resolves to private/reserved IP (${ip})`);
                  ssrfErr.isSsrf = true;
                  return callback(ssrfErr);
                }
              }
              callback(null, addresses[0]!.address, addresses[0]!.family);
            });
          },
          timeout: 10000
        };

        const req = transport.request(reqOptions, (res) => {
          const resCode = res.statusCode;
          // Reject redirects to prevent redirect-based SSRF bypass
          if (resCode && resCode >= 300 && resCode < 400) {
            res.resume();
            resolve({
              status: resCode,
              body: '',
              ok: false,
              error: `HTTP ${resCode}: Redirect rejected. Webhook endpoints must respond directly without redirection to prevent SSRF bypass.`
            });
            return;
          }

          let responseChunks: Buffer[] = [];
          let totalBytes = 0;
          res.on('data', (chunk: Buffer) => {
            if (totalBytes < 1000) {
              responseChunks.push(chunk);
              totalBytes += chunk.length;
            }
          });
          res.on('end', () => {
            const bodyStr = Buffer.concat(responseChunks).toString('utf8').slice(0, 1000);
            const isOk = resCode !== undefined && resCode >= 200 && resCode < 300;
            resolve({
              status: resCode,
              body: bodyStr,
              ok: isOk,
              error: !isOk ? `HTTP ${resCode}: ${bodyStr || res.statusMessage}` : undefined
            });
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error('Delivery timed out after 10000ms'));
        });

        req.on('error', (err: any) => {
          const isSsrf = Boolean(err.isSsrf || err.message?.includes('SSRF_BLOCKED'));
          resolve({
            status: isSsrf ? 400 : undefined,
            body: '',
            ok: false,
            error: err.message,
            isSsrfBlocked: isSsrf
          });
        });

        req.write(payloadBuffer);
        req.end();
      });

      statusCode = deliveryResult.status;
      responseBodyText = deliveryResult.body;
      isSuccess = deliveryResult.ok;
      errorMessage = deliveryResult.error;

      if (deliveryResult.isSsrfBlocked) {
        // SSRF blocked at socket connection time: Record DEAD_LETTER immediately
        await WebhookDeliveryModel.create({
          merchantId: endpoint.merchantId,
          endpointId: endpoint._id,
          eventId: eventDocId,
          eventType,
          statusCode: 400,
          responseStatusCode: 400,
          errorMessage,
          latencyMs: Date.now() - startTime,
          attempts: attempt,
          status: 'DEAD_LETTER'
        }).catch(() => {});

        return {
          success: false,
          statusCode: 400,
          latencyMs: Date.now() - startTime,
          errorMessage
        };
      }
    } catch (err: any) {
      errorMessage = err.message;
      statusCode = undefined;
      isSuccess = false;
    }

    const latencyMs = Date.now() - startTime;

    // Retry policy: Configurable maximum attempts with dynamic exponential backoff
    const maxAttempts = platformConfigService.getWebhookMaxRetries();
    const backoffFactor = platformConfigService.getWebhookBackoffFactor();
    let nextRetryAt: Date | undefined;
    let finalStatus: 'SUCCESS' | 'FAILED' | 'DEAD_LETTER' = isSuccess ? 'SUCCESS' : 'FAILED';

    if (!isSuccess) {
      if (attempt >= maxAttempts) {
        finalStatus = 'DEAD_LETTER';
        nextRetryAt = undefined;
      } else {
        // Exponential backoff with dynamic factor
        const delayMs = Math.pow(backoffFactor, attempt) * 15 * 1000;
        nextRetryAt = new Date(Date.now() + delayMs);
      }
    }

    // Persist delivery audit
    await WebhookDeliveryModel.create({
      merchantId: endpoint.merchantId,
      endpointId: endpoint._id,
      eventId: eventDocId,
      eventType,
      statusCode,
      responseStatusCode: statusCode,
      responseBody: responseBodyText,
      errorMessage,
      latencyMs,
      attempts: attempt,
      status: finalStatus,
      nextRetryAt
    }).catch(() => {});

    return {
      success: isSuccess,
      statusCode,
      latencyMs,
      errorMessage,
      responseBody: responseBodyText
    };
  }

  /**
   * Dispatches an event to all active endpoints registered for this merchant.
   * Creates an immutable WebhookEventModel record and triggers asynchronous delivery.
   */
  public async dispatchEvent(
    merchantId: string,
    eventType: WebhookEventType | string,
    payload: Record<string, any>
  ): Promise<{ eventId: string; endpointsNotified: number }> {
    if (!merchantId) throw new Error('merchantId is required');

    // 1. Persist Webhook Event
    const eventDoc = await WebhookEventModel.create({
      merchantId,
      eventType,
      payload,
      status: 'PENDING'
    });
    const eventId = eventDoc._id.toString();

    // 2. Discover registered active endpoints subscribed to this eventType or '*'
    const endpoints = await WebhookEndpointModel.find({
      merchantId,
      isActive: true,
      $or: [
        { events: eventType },
        { events: '*' },
        { events: { $size: 0 } }
      ]
    });

    let endpointsNotified = 0;

    for (const endpoint of endpoints) {
      // Dispatch delivery asynchronously (non-blocking)
      this.deliverToEndpoint(endpoint, eventId, eventType, payload, 1)
        .then((result) => {
          if (result.success) {
            endpointsNotified++;
          }
        })
        .catch(() => {});
    }

    eventDoc.status = endpoints.length > 0 ? 'DISPATCHED' : 'PROCESSING';
    await eventDoc.save().catch(() => {});

    return { eventId, endpointsNotified: endpoints.length };
  }

  /**
   * Processes failed deliveries that have reached their scheduled nextRetryAt.
   * Enforces exponential backoff and transitions deliveries to DEAD_LETTER after 5 attempts.
   */
  public async processPendingRetries(batchSize = 25): Promise<number> {
    const now = new Date();
    const pendingDeliveries = await WebhookDeliveryModel.find({
      status: 'FAILED',
      attempts: { $lt: 5 },
      nextRetryAt: { $lte: now }
    })
      .limit(batchSize)
      .lean();

    let processedCount = 0;

    for (const delivery of pendingDeliveries) {
      try {
        const endpoint = await WebhookEndpointModel.findById(delivery.endpointId);
        const event = await WebhookEventModel.findById(delivery.eventId);

        if (!endpoint || !endpoint.isActive || !event) {
          // If endpoint was deleted or disabled, mark delivery as DEAD_LETTER
          await WebhookDeliveryModel.findByIdAndUpdate(delivery._id, {
            status: 'DEAD_LETTER',
            errorMessage: 'Endpoint disabled, deleted, or webhook event data missing'
          });
          continue;
        }

        const nextAttempt = (delivery.attempts || 1) + 1;
        const result = await this.deliverToEndpoint(
          endpoint,
          event._id.toString(),
          event.eventType,
          event.payload,
          nextAttempt
        );

        const isDeadLetter = !result.success && nextAttempt >= 5;
        const status = result.success ? 'SUCCESS' : isDeadLetter ? 'DEAD_LETTER' : 'FAILED';
        const delayMs = Math.pow(4, nextAttempt) * 15 * 1000;
        const nextRetryAt = !result.success && !isDeadLetter ? new Date(Date.now() + delayMs) : undefined;

        await WebhookDeliveryModel.findByIdAndUpdate(delivery._id, {
          attempts: nextAttempt,
          status,
          statusCode: result.statusCode,
          responseStatusCode: result.statusCode,
          responseBody: result.responseBody,
          errorMessage: result.errorMessage,
          latencyMs: result.latencyMs,
          nextRetryAt
        });

        processedCount++;
      } catch {
        // Skip individual failure and proceed
      }
    }

    return processedCount;
  }

  /**
   * Allows a merchant to manually authorize re-delivery of a failed or dead-letter webhook delivery.
   */
  public async manualRetryDelivery(merchantId: string, deliveryId: string): Promise<any> {
    const delivery = await WebhookDeliveryModel.findOne({
      _id: deliveryId,
      merchantId
    });

    if (!delivery) {
      throw new Error('Webhook delivery record not found');
    }

    const endpoint = await WebhookEndpointModel.findOne({
      _id: delivery.endpointId,
      merchantId
    });

    if (!endpoint) {
      throw new Error('Webhook endpoint not found or has been deleted');
    }

    const event = await WebhookEventModel.findOne({
      _id: delivery.eventId,
      merchantId
    });

    if (!event) {
      throw new Error('Webhook event data not found');
    }

    const result = await this.deliverToEndpoint(
      endpoint,
      event._id.toString(),
      event.eventType,
      event.payload,
      (delivery.attempts || 1) + 1
    );

    delivery.status = result.success ? 'SUCCESS' : 'FAILED';
    delivery.statusCode = result.statusCode;
    delivery.responseStatusCode = result.statusCode;
    delivery.responseBody = result.responseBody;
    delivery.errorMessage = result.errorMessage;
    delivery.latencyMs = result.latencyMs;
    delivery.attempts = (delivery.attempts || 1) + 1;
    if (!result.success) {
      delivery.nextRetryAt = new Date(Date.now() + 60000);
    }
    await delivery.save();

    return {
      deliveryId: delivery._id.toString(),
      success: result.success,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      responseBody: result.responseBody,
      errorMessage: result.errorMessage
    };
  }

  /**
   * Sends an immediate test ping event to a specific webhook endpoint.
   */
  public async testEndpoint(
    merchantId: string,
    endpointId: string
  ): Promise<{
    success: boolean;
    statusCode?: number;
    latencyMs?: number;
    responseBody?: string;
    errorMessage?: string;
  }> {
    const endpoint = await WebhookEndpointModel.findOne({
      _id: endpointId,
      merchantId
    });

    if (!endpoint) {
      throw new Error('Webhook endpoint not found');
    }

    const testEvent = await WebhookEventModel.create({
      merchantId,
      eventType: 'test.ping',
      payload: {
        message: 'This is a test notification from RGS Ledger',
        endpointId: endpoint._id.toString(),
        sentAt: new Date().toISOString()
      },
      status: 'PROCESSING'
    });

    const result = await this.deliverToEndpoint(
      endpoint,
      testEvent._id.toString(),
      'test.ping',
      testEvent.payload,
      1
    );

    testEvent.status = result.success ? 'DISPATCHED' : 'PROCESSING';
    await testEvent.save().catch(() => {});

    return result;
  }
}

export const defaultWebhookService = new WebhookService();
