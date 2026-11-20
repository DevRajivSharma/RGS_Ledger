import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  RgsLedgerClient,
  RgsError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ApiConnectionError,
  ForbiddenError
} from './index.js';

describe('Phase 3A: Node.js SDK (RgsLedgerClient)', () => {
  it('throws ValidationError if keyId or secret are missing', () => {
    assert.throws(() => {
      new RgsLedgerClient({ keyId: '', secret: 'sec_123' });
    }, ValidationError);

    assert.throws(() => {
      new RgsLedgerClient({ keyId: 'rgs_live_abc', secret: '' });
    }, ValidationError);
  });

  it('initializes client with valid options and correct defaults', () => {
    const client = new RgsLedgerClient({
      keyId: 'rgs_live_1234567890abcdef',
      secret: 'rgs_sec_live_abcdef1234567890'
    });

    assert.ok(client);
    assert.ok(client.payments);
    assert.ok(client.paymentLinks);
    assert.ok(client.reconciliation);
    assert.ok(client.webhooks);
  });

  it('inherits properly from RgsError hierarchy', () => {
    const authErr = new AuthenticationError('Invalid API Key');
    assert.ok(authErr instanceof RgsError);
    assert.ok(authErr instanceof Error);
    assert.equal(authErr.statusCode, 401);
    assert.equal(authErr.code, 'AUTHENTICATION_FAILED');

    const validErr = new ValidationError('Invalid amount');
    assert.ok(validErr instanceof RgsError);
    assert.equal(validErr.statusCode, 400);

    const nfErr = new NotFoundError('Payment not found');
    assert.ok(nfErr instanceof RgsError);
    assert.equal(nfErr.statusCode, 404);

    const forbErr = new ForbiddenError('Missing scope');
    assert.ok(forbErr instanceof RgsError);
    assert.equal(forbErr.statusCode, 403);

    const connErr = new ApiConnectionError('Network unreachable');
    assert.ok(connErr instanceof RgsError);
    assert.equal(connErr.statusCode, 0);
  });

  it('verifies webhook HMAC signatures via static and instance methods with replay protection', () => {
    const secret = 'whsec_sdk_test_secret_123456789';
    const payload = JSON.stringify({ event: 'payment.success', amountPaise: 10000 });
    const timestamp = Math.floor(Date.now() / 1000);

    const hmac = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    const signatureHeader = `t=${timestamp},v1=${hmac}`;

    // Static verification
    const staticResult = RgsLedgerClient.verifyWebhookSignature(payload, signatureHeader, secret);
    assert.strictEqual(staticResult.valid, true);

    // Instance verification
    const client = new RgsLedgerClient({
      keyId: 'rgs_test_123456',
      secret: 'rgs_sec_test_123456'
    });
    const instanceResult = client.webhooks.verifySignature(payload, signatureHeader, secret);
    assert.strictEqual(instanceResult.valid, true);

    // Tampered payload
    const tampered = payload.replace('10000', '99999');
    const tamperedResult = RgsLedgerClient.verifyWebhookSignature(tampered, signatureHeader, secret);
    assert.strictEqual(tamperedResult.valid, false);

    // Replay attack prevention (> 300s old)
    const oldTimestamp = timestamp - 600;
    const oldHmac = crypto
      .createHmac('sha256', secret)
      .update(`${oldTimestamp}.${payload}`)
      .digest('hex');
    const oldHeader = `t=${oldTimestamp},v1=${oldHmac}`;

    const replayResult = RgsLedgerClient.verifyWebhookSignature(payload, oldHeader, secret, 300);
    assert.strictEqual(replayResult.valid, false);
    assert.match(replayResult.reason || '', /outside tolerance window/);
  });
});
