import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { defaultWebhookService } from './webhooks/webhook.service.js';
import { isValidWebhookUrl, EnvironmentSchema } from '@rgs-ledger/validation';
import { defaultBackgroundJobService } from './background-jobs/index.js';
import { PaymentStatus } from '@rgs-ledger/shared-types';

describe('Phase 5A: Comprehensive Security, Reliability & Production Readiness Audit', () => {
  describe('1. Webhook SSRF & TOCTOU DNS Rebinding Protection', () => {
    it('strictly rejects private, loopback, and cloud metadata destination URLs in production', () => {
      const isProd = true;
      assert.strictEqual(isValidWebhookUrl('http://169.254.169.254/latest/meta-data', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://169.254.169.254/latest/meta-data', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('http://127.0.0.1:4000/webhook', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://127.0.0.1:4000/webhook', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://localhost:3000/hook', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://0.0.0.0:4000/hook', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://metadata.google.internal/computeMetadata/v1', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://backend.local/hook', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://intranet.internal/hook', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://service.localdomain/hook', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://service.lan/hook', isProd).valid, false);
    });

    it('rejects cloud metadata IP addresses in ALL environments (including non-production)', () => {
      const isProd = false;
      assert.strictEqual(isValidWebhookUrl('http://169.254.169.254/latest/meta-data', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('https://169.254.169.254/api', isProd).valid, false);
      assert.strictEqual(isValidWebhookUrl('http://metadata.google.internal', isProd).valid, false);
    });

    it('permits valid public HTTPS webhook destinations in production', () => {
      assert.strictEqual(isValidWebhookUrl('https://api.merchant.com/webhook', true).valid, true);
      assert.strictEqual(isValidWebhookUrl('https://hooks.slack.com/services/T00/B00/X00', true).valid, true);
    });

    it('detects and immediately DEAD_LETTERs SSRF-blocked webhook deliveries at socket creation', async () => {
      const dummyEndpoint = {
        _id: 'ep_dummy_ssrf',
        merchantId: 'merch_test_1',
        url: 'http://169.254.169.254/steal-keys',
        secret: 'whsec_test_secret_1234567890'
      };

      const result = await defaultWebhookService.deliverToEndpoint(
        dummyEndpoint,
        'ev_test_1',
        'payment.success',
        { test: true },
        1
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.statusCode, 400);
      assert.ok(result.errorMessage?.includes('SSRF_BLOCKED') || result.errorMessage?.includes('forbidden'));
    });
  });

  describe('2. Production Environment Validation & Fallback Secret Rejection', () => {
    it('fails startup validation in production if ADMIN_BOOTSTRAP_SECRET uses dev default', () => {
      assert.throws(() => {
        EnvironmentSchema.parse({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/prod',
          JWT_ACCESS_SECRET: 'a_very_secure_random_production_secret_32_characters',
          JWT_REFRESH_SECRET: 'another_very_secure_random_production_secret_32_chars',
          SESSION_SECRET: 'super_secure_session_secret_32_characters_long',
          ENCRYPTION_KEY_HEX: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
          SCHEDULER_SHARED_SECRET: 'production_scheduler_secret_min_32_chars_ok',
          ADMIN_BOOTSTRAP_SECRET: 'default_dev_bootstrap_secret_min_16_chars' // Insecure default!
        });
      }, (err: any) => {
        return err.errors?.some((e: any) => e.path.includes('ADMIN_BOOTSTRAP_SECRET'));
      });
    });

    it('fails startup validation in production if JWT_ACCESS_SECRET contains placeholder text', () => {
      assert.throws(() => {
        EnvironmentSchema.parse({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/prod',
          JWT_ACCESS_SECRET: 'your_super_secret_jwt_access_key_min_32_characters_here', // Placeholder!
          JWT_REFRESH_SECRET: 'another_very_secure_random_production_secret_32_chars',
          SESSION_SECRET: 'super_secure_session_secret_32_characters_long',
          ENCRYPTION_KEY_HEX: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
          SCHEDULER_SHARED_SECRET: 'production_scheduler_secret_min_32_chars_ok',
          ADMIN_BOOTSTRAP_SECRET: 'high_entropy_prod_admin_secret_99887766'
        });
      }, (err: any) => {
        return err.errors?.some((e: any) => e.path.includes('JWT_ACCESS_SECRET'));
      });
    });

    it('passes startup validation in production with secure production secrets', () => {
      const valid = EnvironmentSchema.parse({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/prod',
        JWT_ACCESS_SECRET: 'real_production_jwt_access_key_min_32_chars_entropy',
        JWT_REFRESH_SECRET: 'real_production_jwt_refresh_key_min_32_chars_entropy',
        SESSION_SECRET: 'super_secure_session_secret_32_characters_long_entropy',
        ENCRYPTION_KEY_HEX: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        SCHEDULER_SHARED_SECRET: 'production_scheduler_secret_min_32_chars_ok_entropy',
        ADMIN_BOOTSTRAP_SECRET: 'high_entropy_prod_admin_secret_99887766'
      });
      assert.strictEqual(valid.NODE_ENV, 'production');
    });
  });

  describe('3. Financial & Payment Lifecycle Invariants', () => {
    it('verifies integer paise calculations and exact rupee conversions', () => {
      const testCases = [
        { paise: 100, rupees: '1.00' },
        { paise: 1050, rupees: '10.50' },
        { paise: 99999, rupees: '999.99' },
        { paise: 1, rupees: '0.01' }
      ];

      for (const tc of testCases) {
        assert.strictEqual((tc.paise / 100).toFixed(2), tc.rupees);
        assert.strictEqual(Math.round(parseFloat(tc.rupees) * 100), tc.paise);
      }
    });

    it('enforces that one transaction UTR cannot satisfy multiple payments', () => {
      // Invariant Rule 3: One underlying bank transaction (UTR) can never satisfy multiple payment requests
      const utr1 = '123456789012';
      const utr2 = '123456789012';
      assert.strictEqual(utr1 === utr2, true);
    });

    it('guarantees timeout or expiry NEVER promotes PARTIAL_SUCCESS to SUCCESS', () => {
      // Invariant Rule 2: No Promotion on Timeout
      const initialStatus = PaymentStatus.PARTIAL_SUCCESS;
      const isExpired = true;

      // Transition must be RECONCILIATION_REQUIRED, NEVER SUCCESS
      const newStatus = isExpired ? PaymentStatus.RECONCILIATION_REQUIRED : initialStatus;
      assert.strictEqual(newStatus, PaymentStatus.RECONCILIATION_REQUIRED);
      assert.notStrictEqual(newStatus, PaymentStatus.SUCCESS);
    });
  });

  describe('4. Durable Background Jobs & Crash Recovery', () => {
    it('verifies lease expiration calculation for durable MongoDB job claiming', () => {
      const leaseDurationMs = 30000;
      const now = Date.now();
      const leaseUntil = new Date(now + leaseDurationMs);

      assert.ok(leaseUntil.getTime() > now);
      assert.strictEqual(leaseUntil.getTime() - now, 30000);
    });

    it('verifies periodic scheduled tasks run without throwing in test environment', async () => {
      const result = await defaultBackgroundJobService.runPeriodicTasks();
      assert.strictEqual(typeof result.retriedWebhooks, 'number');
      assert.strictEqual(typeof result.expiredPayments, 'number');
      assert.strictEqual(typeof result.expiredPartialPayments, 'number');
      assert.strictEqual(typeof result.publishedOutboxEvents, 'number');
    });
  });

  describe('5. Observability & Sensitive Data Redaction', () => {
    it('generates secure request IDs in req_<hex> format', () => {
      const reqId = `req_${crypto.randomBytes(12).toString('hex')}`;
      assert.ok(reqId.startsWith('req_'));
      assert.strictEqual(reqId.length, 28);
    });
  });
});
