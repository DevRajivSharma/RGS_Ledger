import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultWebhookService } from './webhook.service.js';
import { isValidWebhookUrl } from '@rgs-ledger/validation';

describe('Phase 3A: Webhooks Engine & Cryptographic Signatures', () => {
  const secret = 'whsec_test_secret_99482818471928471928471';
  const payload = JSON.stringify({
    event: 'payment.success',
    data: {
      orderId: 'ORD_1001',
      amountPaise: 50000,
      checkoutReference: 'chk_test_123'
    }
  });

  it('computes HMAC-SHA256 signature header in t=<timestamp>,v1=<signature> format', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = defaultWebhookService.computeSignature(payload, secret, timestamp);

    assert.ok(header.startsWith(`t=${timestamp},v1=`));
    assert.match(header, /^t=\d+,v1=[a-f0-9]{64}$/);
  });

  it('verifies genuine webhook signatures accurately', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = defaultWebhookService.computeSignature(payload, secret, timestamp);

    const result = defaultWebhookService.verifySignature(payload, header, secret, 300);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.reason, undefined);
  });

  it('rejects tampered or modified payload bodies', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = defaultWebhookService.computeSignature(payload, secret, timestamp);

    const tamperedPayload = payload.replace('50000', '90000');
    const result = defaultWebhookService.verifySignature(tamperedPayload, header, secret, 300);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'Signature mismatch');
  });

  it('rejects signatures outside timestamp tolerance window (replay attack protection)', () => {
    // 10 minutes ago (> 5 min tolerance)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const header = defaultWebhookService.computeSignature(payload, secret, oldTimestamp);

    const result = defaultWebhookService.verifySignature(payload, header, secret, 300);
    assert.strictEqual(result.valid, false);
    assert.match(result.reason || '', /outside tolerance window/);
  });

  it('rejects malformed signature headers', () => {
    const result = defaultWebhookService.verifySignature(payload, 'invalid_header', secret, 300);
    assert.strictEqual(result.valid, false);
    assert.match(result.reason || '', /Malformed/);
  });

  it('enforces SSRF protection on destination URLs in production', () => {
    const isProd = true;

    // Disallowed in production
    assert.strictEqual(isValidWebhookUrl('http://localhost:3000/webhook', isProd).valid, false);
    assert.strictEqual(isValidWebhookUrl('http://127.0.0.1:4000/webhook', isProd).valid, false);
    assert.strictEqual(isValidWebhookUrl('http://192.168.1.1/hook', isProd).valid, false);
    assert.strictEqual(isValidWebhookUrl('http://10.0.0.5/hook', isProd).valid, false);
    assert.strictEqual(isValidWebhookUrl('http://172.16.0.1/hook', isProd).valid, false);
    assert.strictEqual(isValidWebhookUrl('http://169.254.169.254/latest/meta-data', isProd).valid, false); // AWS/cloud metadata
    assert.strictEqual(isValidWebhookUrl('http://api.merchant.com/webhook', isProd).valid, false); // Non-HTTPS in prod

    // Allowed in production
    assert.strictEqual(isValidWebhookUrl('https://api.merchant.com/webhook', isProd).valid, true);
    assert.strictEqual(isValidWebhookUrl('https://hooks.slack.com/services/xxx', isProd).valid, true);
  });
});
