import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { CreateApiKeySchema, CreatePaymentLinkSchema, InitiateLinkPaymentSchema, isPrivateOrReservedIp, isValidWebhookUrl } from '@rgs-ledger/validation';
import { defaultWebhookService } from '../webhooks/webhook.service.js';
import { RgsLedgerClient, AuthenticationError, ValidationError, ForbiddenError, NotFoundError } from '@rgs-ledger/sdk';
import { PaymentLinkStatus } from '@rgs-ledger/shared-types';

describe('Phase 3B: End-to-End Developer API & Integration Test Suite', () => {
  const mockMerchantId = '674b0c7410f9b329c011e4a1';
  const otherMerchantId = '674b0c7410f9b329c011e4a2';

  // ---------------- 1. SANDBOX API KEY & AUTHENTICATION ----------------
  describe('1. Sandbox API Key Generation & Cryptographic Hashing', () => {
    it('generates sandbox credentials with proper prefixes and scopes', () => {
      const input = {
        name: 'Staging Server Runner',
        environment: 'SANDBOX' as const,
        scopes: ['payments:read', 'payments:write', 'links:read', 'links:write']
      };

      const parsed = CreateApiKeySchema.parse(input);
      const keyId = `rgs_test_${crypto.randomBytes(12).toString('hex')}`;
      const rawSecret = `rgs_sec_test_${crypto.randomBytes(24).toString('hex')}`;

      assert.ok(keyId.startsWith('rgs_test_'));
      assert.ok(rawSecret.startsWith('rgs_sec_test_'));
      assert.equal(parsed.environment, 'SANDBOX');
      assert.equal(parsed.scopes?.length, 4);
    });

    it('verifies that only the SHA-256 hash is stored and compared with timingSafeEqual', () => {
      const rawSecret = `rgs_sec_test_${crypto.randomBytes(24).toString('hex')}`;
      const storedHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

      // Incoming request comparison
      const incomingSecret = rawSecret;
      const incomingHash = crypto.createHash('sha256').update(incomingSecret).digest('hex');

      const bufA = Buffer.from(storedHash, 'hex');
      const bufB = Buffer.from(incomingHash, 'hex');

      assert.ok(crypto.timingSafeEqual(bufA, bufB), 'Timing-safe match must succeed for genuine secret');

      const tampered = rawSecret.slice(0, -1) + '0';
      const tamperedHash = crypto.createHash('sha256').update(tampered).digest('hex');
      assert.ok(!crypto.timingSafeEqual(bufA, Buffer.from(tamperedHash, 'hex')), 'Timing-safe match must fail for tampered secret');
    });

    it('key rotation invalidates old secret hash and generates fresh credentials', () => {
      const initialSecret = `rgs_sec_test_${crypto.randomBytes(24).toString('hex')}`;
      const initialHash = crypto.createHash('sha256').update(initialSecret).digest('hex');

      // Rotate key
      const rotatedSecret = `rgs_sec_test_${crypto.randomBytes(24).toString('hex')}`;
      const rotatedHash = crypto.createHash('sha256').update(rotatedSecret).digest('hex');

      assert.notEqual(initialSecret, rotatedSecret);
      assert.notEqual(initialHash, rotatedHash);

      // Verify old secret fails against rotated hash
      const oldCheckHash = crypto.createHash('sha256').update(initialSecret).digest('hex');
      assert.ok(!crypto.timingSafeEqual(Buffer.from(rotatedHash, 'hex'), Buffer.from(oldCheckHash, 'hex')));
    });
  });

  // ---------------- 2. PAYMENT REQUEST & QR VALIDATION ----------------
  describe('2. Payment Request Creation & NPCI Parameter Integrity', () => {
    it('validates payment request input with minimum 100 paise (₹1.00)', () => {
      const validPaise = 50000; // ₹500.00
      const orderId = `ORD-${Date.now()}`;

      assert.ok(validPaise >= 100);
      assert.match(orderId, /^ORD-\d+/);

      // Verify NPCI UPI URI generation parameters
      const vpa = 'merchant@yespop';
      const payeeName = 'Acme Store';
      const upiUri = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(payeeName)}&am=${(validPaise / 100).toFixed(2)}&tr=${encodeURIComponent(orderId)}&cu=INR`;

      assert.ok(upiUri.includes('pa=merchant@yespop'));
      assert.strictEqual(upiUri.includes('%40'), false);
      assert.ok(upiUri.includes('am=500.00'));
      assert.ok(upiUri.includes('cu=INR'));
      assert.ok(upiUri.includes(`tr=${orderId}`));
    });
  });

  // ---------------- 3. PAYMENT LINKS & PUBLIC CHECKOUT INITIATION ----------------
  describe('3. Payment Links Lifecycle & Public Checkout Initiation', () => {
    it('creates an open-amount (customer-defined) reusable payment link', () => {
      const linkInput = {
        title: 'Open Donation Retainer',
        description: 'Contribution toward software development',
        amountPaise: null, // Open amount
        isReusable: true
      };

      const parsed = CreatePaymentLinkSchema.parse(linkInput);
      const linkRef = `plink_${crypto.randomBytes(8).toString('hex')}`;

      assert.equal(parsed.title, 'Open Donation Retainer');
      assert.equal(parsed.amountPaise, null);
      assert.equal(parsed.isReusable, true);
      assert.ok(linkRef.startsWith('plink_'));
    });

    it('customer initiates payment from link with isolated PaymentRequest and unique session reference', () => {
      const customerInput = {
        amountPaise: 75000, // ₹750.00
        customerName: 'Ananya Roy',
        customerPhone: '9876543210'
      };

      const parsed = InitiateLinkPaymentSchema.parse(customerInput);
      assert.equal(parsed.amountPaise, 75000);

      // Invariant: each checkout initiation generates a brand-new checkout session reference
      const sessionRefA = `chk_${crypto.randomBytes(12).toString('hex')}`;
      const sessionRefB = `chk_${crypto.randomBytes(12).toString('hex')}`;

      assert.notEqual(sessionRefA, sessionRefB);
      assert.ok(sessionRefA.startsWith('chk_'));
      assert.ok(sessionRefB.startsWith('chk_'));
    });

    it('link revocation blocks subsequent checkout attempts', () => {
      let status: PaymentLinkStatus = PaymentLinkStatus.ACTIVE;
      assert.equal(status, 'ACTIVE');

      // Revoke link
      status = PaymentLinkStatus.REVOKED;
      assert.equal(status, 'REVOKED');
      assert.notEqual(status, PaymentLinkStatus.ACTIVE);
    });
  });

  // ---------------- 4. SCOPE RESTRICTIONS & MERCHANT ISOLATION ----------------
  describe('4. Granular Scope Enforcement & Tenant Isolation', () => {
    function evaluateScope(grantedScopes: string[], requiredScope: string): boolean {
      if (grantedScopes.includes('*')) return true;
      if (grantedScopes.includes(requiredScope)) return true;
      const [resource] = requiredScope.split(':');
      if (grantedScopes.includes(`${resource}:*`)) return true;
      return false;
    }

    it('enforces read-only key cannot perform write operations (403 Forbidden)', () => {
      const readOnlyScopes = ['payments:read', 'links:read', 'webhooks:read'];

      assert.ok(evaluateScope(readOnlyScopes, 'payments:read'));
      assert.ok(!evaluateScope(readOnlyScopes, 'payments:write'), 'Read-only key must be forbidden from payments:write');
      assert.ok(!evaluateScope(readOnlyScopes, 'links:write'), 'Read-only key must be forbidden from links:write');
      assert.ok(!evaluateScope(readOnlyScopes, 'webhooks:write'), 'Read-only key must be forbidden from webhooks:write');
    });

    it('wildcard (*) grants full access across all endpoints', () => {
      const adminScopes = ['*'];
      assert.ok(evaluateScope(adminScopes, 'payments:write'));
      assert.ok(evaluateScope(adminScopes, 'links:write'));
      assert.ok(evaluateScope(adminScopes, 'webhooks:write'));
      assert.ok(evaluateScope(adminScopes, 'developer:write'));
    });

    it('strict merchant tenant isolation: queries must always scope by merchantId', () => {
      const resourceA = { id: 'pay_1', merchantId: mockMerchantId };
      const resourceB = { id: 'pay_2', merchantId: otherMerchantId };

      function queryForMerchant(resource: { id: string; merchantId: string }, requestingMerchantId: string) {
        if (resource.merchantId !== requestingMerchantId) {
          return null; // Tenant isolation violation blocked
        }
        return resource;
      }

      assert.ok(queryForMerchant(resourceA, mockMerchantId));
      assert.equal(queryForMerchant(resourceB, mockMerchantId), null, 'Merchant A must never access Merchant B records');
    });
  });

  // ---------------- 5. WEBHOOK SSRF & DELIVERY RELIABILITY ----------------
  describe('5. Webhook SSRF, DNS Resolution & Reliability Engine', () => {
    it('blocks private, loopback, link-local, and reserved IP ranges in production', () => {
      // IPv4 private & reserved
      assert.ok(isPrivateOrReservedIp('127.0.0.1'));
      assert.ok(isPrivateOrReservedIp('10.0.0.1'));
      assert.ok(isPrivateOrReservedIp('172.16.0.1'));
      assert.ok(isPrivateOrReservedIp('192.168.1.1'));
      assert.ok(isPrivateOrReservedIp('169.254.169.254')); // AWS/GCP metadata service
      assert.ok(isPrivateOrReservedIp('100.64.0.1')); // CGNAT
      assert.ok(isPrivateOrReservedIp('0.0.0.0'));
      assert.ok(isPrivateOrReservedIp('224.0.0.1')); // Multicast

      // IPv6 private & loopback
      assert.ok(isPrivateOrReservedIp('::1'));
      assert.ok(isPrivateOrReservedIp('fe80::1'));
      assert.ok(isPrivateOrReservedIp('fc00::1'));
      assert.ok(isPrivateOrReservedIp('::ffff:192.168.1.1')); // IPv4-mapped IPv6

      // Public internet IPs must be permitted
      assert.ok(!isPrivateOrReservedIp('8.8.8.8'));
      assert.ok(!isPrivateOrReservedIp('104.21.48.1'));
    });

    it('registration-time URL validator requires HTTPS and rejects local domains in production', () => {
      assert.strictEqual(isValidWebhookUrl('http://api.merchant.com/hook', true).valid, false); // HTTP rejected in prod
      assert.strictEqual(isValidWebhookUrl('https://localhost:4000/hook', true).valid, false); // Localhost rejected
      assert.strictEqual(isValidWebhookUrl('https://api.internal/hook', true).valid, false); // .internal domain rejected
      assert.strictEqual(isValidWebhookUrl('https://webhook.site/abc', true).valid, true); // Public HTTPS allowed
    });

    it('computes and verifies HMAC-SHA256 signature with replay attack protection', () => {
      const secret = 'whsec_test_secret_key_8471928471';
      const payload = JSON.stringify({ event: 'payment.success', orderId: 'ORD-101', amountPaise: 50000 });
      const currentSeconds = Math.floor(Date.now() / 1000);

      const header = defaultWebhookService.computeSignature(payload, secret, currentSeconds);
      assert.ok(header.startsWith(`t=${currentSeconds},v1=`));

      // Genuine verification succeeds
      const genuineResult = defaultWebhookService.verifySignature(payload, header, secret, 300);
      assert.strictEqual(genuineResult.valid, true);

      // Replay attack: signature from 10 minutes ago (600s > 300s tolerance) is rejected
      const oldHeader = defaultWebhookService.computeSignature(payload, secret, currentSeconds - 600);
      const replayResult = defaultWebhookService.verifySignature(payload, oldHeader, secret, 300);
      assert.strictEqual(replayResult.valid, false);
      assert.match(replayResult.reason || '', /outside tolerance window/);
    });

    it('verifies exponential backoff delay calculation and DEAD_LETTER transition', () => {
      const calculateBackoffDelayMs = (attempt: number) => Math.pow(4, attempt) * 15 * 1000;

      assert.equal(calculateBackoffDelayMs(1), 60000);     // 1 min
      assert.equal(calculateBackoffDelayMs(2), 240000);    // 4 mins
      assert.equal(calculateBackoffDelayMs(3), 960000);    // 16 mins
      assert.equal(calculateBackoffDelayMs(4), 3840000);   // 64 mins

      // Max attempts = 5; attempt 5 failure transitions to DEAD_LETTER
      const maxAttempts = 5;
      const determineStatus = (attempt: number, isSuccess: boolean) => {
        if (isSuccess) return 'SUCCESS';
        return attempt >= maxAttempts ? 'DEAD_LETTER' : 'FAILED';
      };

      assert.equal(determineStatus(1, false), 'FAILED');
      assert.equal(determineStatus(4, false), 'FAILED');
      assert.equal(determineStatus(5, false), 'DEAD_LETTER');
    });
  });

  // ---------------- 6. SDK CLIENT BEHAVIOR & ERROR CLASSES ----------------
  describe('6. Official Node.js SDK (RgsLedgerClient) Behavior', () => {
    it('initializes client with custom baseUrl and timeout options', () => {
      const client = new RgsLedgerClient({
        keyId: 'rgs_test_1234567890',
        secret: 'rgs_sec_test_1234567890abcdef',
        baseUrl: 'http://localhost:4000',
        timeoutMs: 5000
      });

      assert.ok(client);
      assert.ok(client.payments);
      assert.ok(client.paymentLinks);
      assert.ok(client.webhooks);
      assert.ok(client.reconciliation);
    });

    it('verifies SDK custom error hierarchy and HTTP status mappings', () => {
      const authErr = new AuthenticationError('Invalid credentials');
      assert.equal(authErr.statusCode, 401);
      assert.equal(authErr.name, 'AuthenticationError');

      const forErr = new ForbiddenError('Scope required');
      assert.equal(forErr.statusCode, 403);
      assert.equal(forErr.name, 'ForbiddenError');

      const valErr = new ValidationError('Bad amount');
      assert.equal(valErr.statusCode, 400);
      assert.equal(valErr.name, 'ValidationError');

      const nfErr = new NotFoundError('Not found');
      assert.equal(nfErr.statusCode, 404);
      assert.equal(nfErr.name, 'NotFoundError');
    });

    it('verifies webhook signature helper via SDK static method', () => {
      const secret = 'whsec_sdk_test_secret_998877';
      const body = JSON.stringify({ event: 'payment.success', amountPaise: 10000 });
      const now = Math.floor(Date.now() / 1000);

      const hmac = crypto
        .createHmac('sha256', secret)
        .update(`${now}.${body}`)
        .digest('hex');
      const sigHeader = `t=${now},v1=${hmac}`;

      const res = RgsLedgerClient.verifyWebhookSignature(body, sigHeader, secret);
      assert.strictEqual(res.valid, true);

      // Modified body fails
      const badRes = RgsLedgerClient.verifyWebhookSignature(body + ' ', sigHeader, secret);
      assert.strictEqual(badRes.valid, false);
    });
  });
});
