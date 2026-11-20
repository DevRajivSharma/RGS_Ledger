import mongoose from 'mongoose';
import http from 'node:http';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { defaultWebhookService } from '../../apps/api/src/modules/webhooks/webhook.service.js';
import { WebhookEndpointModel, WebhookDeliveryModel } from '../../apps/api/src/database/models.js';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('MongoDB connected for live webhook test.');

  const merchantId = '6af6ee4f910d54b7fab9acff';

  // 1. Secret Generation and Rotation
  console.log('\n--- 1. Testing Webhook Endpoint & Secret Rotation ---');
  const initialSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  const endpoint = await WebhookEndpointModel.create({
    merchantId,
    url: 'https://example.com/test-webhook-phase5a',
    secret: initialSecret,
    events: ['payment.success', 'payment.partial_success'],
    description: 'Phase 5A.1 Test Webhook Endpoint',
    isActive: true
  });
  console.log('Created webhook endpoint:', endpoint._id.toString());
  console.log('Initial secret prefix:', endpoint.secret.slice(0, 10));

  const rotatedSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  endpoint.secret = rotatedSecret;
  await endpoint.save();
  console.log('Rotated secret prefix:', endpoint.secret.slice(0, 10));
  if (endpoint.secret === initialSecret) {
    throw new Error('Rotated secret matches old secret!');
  }
  console.log('[PASS] Webhook secret generation and rotation verified.');

  // 2. SSRF Protection: Cloud Metadata
  console.log('\n--- 2. Testing SSRF Protection against Cloud Metadata ---');
  const metadataEndpoint = {
    _id: new mongoose.Types.ObjectId(),
    merchantId: new mongoose.Types.ObjectId(merchantId),
    url: 'http://169.254.169.254/latest/meta-data',
    secret: endpoint.secret
  };
  const ssrfResult = await defaultWebhookService.deliverToEndpoint(
    metadataEndpoint,
    new mongoose.Types.ObjectId().toString(),
    'payment.success',
    { orderId: 'SSRF_TEST' }
  );
  console.log('SSRF Delivery Result:', ssrfResult);
  if (ssrfResult.success || !ssrfResult.errorMessage?.includes('SSRF_BLOCKED')) {
    throw new Error(`Expected SSRF_BLOCKED, got: ${ssrfResult.errorMessage}`);
  }
  console.log('[PASS] SSRF protection blocked metadata URL attempt.');

  // 3. Live HTTP Delivery with HMAC Signature Verification
  console.log('\n--- 3. Testing Live Webhook HTTP Delivery & Signature Verification ---');
  let capturedHeaders: http.IncomingHttpHeaders | null = null;
  let capturedBody = '';

  const server = http.createServer((req, res) => {
    capturedHeaders = req.headers;
    let chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      capturedBody = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  });

  await new Promise<void>((resolve) => server.listen(49911, '127.0.0.1', () => resolve()));
  console.log('Local webhook receiver listening on http://127.0.0.1:49911');

  try {
    const localEndpoint = {
      _id: endpoint._id,
      merchantId: new mongoose.Types.ObjectId(merchantId),
      url: 'http://127.0.0.1:49911/webhook',
      secret: endpoint.secret
    };

    const eventDocId = new mongoose.Types.ObjectId().toString();
    const testPayload = {
      orderId: 'ORD_VERIFY_LIVE_999',
      amountPaise: 25000,
      checkoutReference: 'chk_live_webhook_999'
    };

    const deliveryResult = await defaultWebhookService.deliverToEndpoint(
      localEndpoint,
      eventDocId,
      'payment.success',
      testPayload
    );

    console.log('Live Delivery Result:', deliveryResult);
    if (!deliveryResult.success || deliveryResult.statusCode !== 200) {
      throw new Error(`Delivery failed: ${deliveryResult.errorMessage}`);
    }

    console.log('Captured Signature Header:', capturedHeaders?.['x-rgs-signature']);
    console.log('Captured Event Header:', capturedHeaders?.['x-rgs-event']);

    const sigHeader = capturedHeaders?.['x-rgs-signature'] as string;
    const verification = defaultWebhookService.verifySignature(capturedBody, sigHeader, endpoint.secret, 300);
    console.log('Signature verification check:', verification);
    if (!verification.valid) {
      throw new Error(`Signature verification failed: ${verification.reason}`);
    }
    console.log('[PASS] Live webhook delivery verified and HMAC-SHA256 signature matched perfectly.');

    // 4. Check WebhookDelivery record in MongoDB
    const deliveryRecord = await WebhookDeliveryModel.findOne({ eventId: eventDocId });
    console.log('Delivery record in DB:', {
      status: deliveryRecord?.status,
      statusCode: deliveryRecord?.statusCode,
      latencyMs: deliveryRecord?.latencyMs,
      attempts: deliveryRecord?.attempts
    });
    if (deliveryRecord?.status !== 'SUCCESS') {
      throw new Error(`Expected SUCCESS status, got: ${deliveryRecord?.status}`);
    }
    console.log('[PASS] Delivery history recorded in MongoDB.');

    // Clean up
    await WebhookEndpointModel.findByIdAndDelete(endpoint._id);
    await WebhookDeliveryModel.deleteMany({ endpointId: endpoint._id });
    console.log('Cleaned up test webhook records.');
  } finally {
    server.close();
  }

  await mongoose.disconnect();
  console.log('Done with live webhook verification.');
}

run().catch((err) => {
  console.error('Webhook verification error:', err);
  process.exit(1);
});
