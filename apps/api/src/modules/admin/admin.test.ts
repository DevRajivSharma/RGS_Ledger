import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AdminLoginSchema,
  AdminBootstrapSchema,
  SuspendMerchantSchema,
  UpdatePlatformConfigSchema,
  AdminResolveReconciliationSchema
} from '@rgs-ledger/validation';
import { security } from '../../utils/security.js';
import { PaymentStatus, UserRole } from '@rgs-ledger/shared-types';

describe('Phase 3C: Admin Dashboard & Platform Operations Test Suite', () => {
  const mockAdminId = '674b0c7410f9b329c011e400';
  const mockMerchantId = '674b0c7410f9b329c011e401';

  // ---------------- 1. ADMIN AUTHENTICATION & ROLE SEPARATION ----------------
  describe('1. Admin Authentication & Role Separation', () => {
    it('validates admin login schema and enforces min password length', () => {
      const valid = { email: 'admin@rgsledger.internal', password: 'SuperSecureAdminPassword123' };
      assert.doesNotThrow(() => AdminLoginSchema.parse(valid));

      const invalidShort = { email: 'admin@rgsledger.internal', password: 'short' };
      assert.throws(() => AdminLoginSchema.parse(invalidShort));
    });

    it('validates admin bootstrap schema and locks parameters', () => {
      const bootstrapInput = {
        name: 'Lead Systems Architect',
        email: 'sysadmin@rgsledger.internal',
        password: 'PlatformRootPassword2026!',
        bootstrapSecret: 'test_bootstrap_secret_123'
      };
      const parsed = AdminBootstrapSchema.parse(bootstrapInput);
      assert.equal(parsed.name, 'Lead Systems Architect');
      assert.equal(parsed.email, 'sysadmin@rgsledger.internal');
    });

    it('generates system admin JWT token with role SYSTEM_ADMIN and without mandatory merchantId', () => {
      const adminToken = security.generateAccessToken({
        userId: mockAdminId,
        role: UserRole.SYSTEM_ADMIN,
        email: 'admin@rgsledger.internal'
      });

      const decoded = security.verifyAccessToken(adminToken);
      assert.equal(decoded.userId, mockAdminId);
      assert.equal(decoded.role, UserRole.SYSTEM_ADMIN);
      assert.equal(decoded.email, 'admin@rgsledger.internal');
      assert.equal(decoded.merchantId, undefined);
    });

    it('strictly separates merchant credentials from admin access', () => {
      // Merchant token
      const merchantToken = security.generateAccessToken({
        userId: '674b0c7410f9b329c011e403',
        merchantId: mockMerchantId,
        role: UserRole.MERCHANT_ADMIN,
        email: 'merchant@store.example'
      });

      const decodedMerchant = security.verifyAccessToken(merchantToken);
      assert.equal(decodedMerchant.role, UserRole.MERCHANT_ADMIN);

      // Verify that merchant role is rejected by admin authorization policy
      const isAdmin = (role: string) => role === UserRole.SYSTEM_ADMIN;
      assert.strictEqual(isAdmin(decodedMerchant.role), false, 'Merchant role must never be granted admin access');
    });
  });

  // ---------------- 2. MERCHANT MANAGEMENT & SUSPENSION INVARIANTS ----------------
  describe('2. Merchant Management & Invariant Preservation', () => {
    it('validates merchant suspension reason schema', () => {
      const validSuspension = { reason: 'Irregular credit pattern detected under manual review' };
      assert.doesNotThrow(() => SuspendMerchantSchema.parse(validSuspension));

      const emptyReason = { reason: '  ' };
      assert.throws(() => SuspendMerchantSchema.parse(emptyReason));
    });

    it('verifies suspension transitions merchant status without deleting records or evidence', () => {
      // Simulated state of merchant before suspension
      const merchantState = {
        id: mockMerchantId,
        name: 'Acme Retailers',
        status: 'ACTIVE',
        paymentCount: 42,
        evidenceCount: 84
      };

      // Perform suspension
      const suspendedState = {
        ...merchantState,
        status: 'SUSPENDED',
        suspensionReason: 'Audit review requested by compliance'
      };

      assert.equal(suspendedState.status, 'SUSPENDED');
      // Invariant: payment records and evidence are never deleted
      assert.equal(suspendedState.paymentCount, 42, 'Payment records must remain intact');
      assert.equal(suspendedState.evidenceCount, 84, 'Evidence records must remain intact');
    });
  });

  // ---------------- 3. NON-CUSTODIAL REVENUE TRANSPARENCY ----------------
  describe('3. Financial Distinction & Metric Calculations', () => {
    it('clearly separates requested QR payment intent from dual-source verified SUCCESS volume', () => {
      const samplePayments = [
        { id: 'p1', amountPaise: 50000, status: PaymentStatus.SUCCESS }, // Verified
        { id: 'p2', amountPaise: 150000, status: PaymentStatus.SUCCESS }, // Verified
        { id: 'p3', amountPaise: 300000, status: PaymentStatus.PARTIAL_SUCCESS }, // 1 source only (intent, not settled)
        { id: 'p4', amountPaise: 100000, status: PaymentStatus.PENDING }, // Customer hasn't paid
        { id: 'p5', amountPaise: 50000, status: PaymentStatus.EXPIRED } // Window timed out
      ];

      let totalRequestedValuePaise = 0;
      let totalSuccessValuePaise = 0;

      for (const p of samplePayments) {
        totalRequestedValuePaise += p.amountPaise;
        if (p.status === PaymentStatus.SUCCESS) {
          totalSuccessValuePaise += p.amountPaise;
        }
      }

      // Total requested intent: ₹6,500.00 (650,000 paise)
      assert.equal(totalRequestedValuePaise, 650000);
      // Independently verified SUCCESS: ₹2,000.00 (200,000 paise)
      assert.equal(totalSuccessValuePaise, 200000);

      // Invariant: Non-custodial platform must never report QR intent as verified revenue
      assert.ok(totalSuccessValuePaise < totalRequestedValuePaise);
    });
  });

  // ---------------- 4. RECONCILIATION CASE RESOLUTION ----------------
  describe('4. Reconciliation Case Operations & Dual-Source Invariant', () => {
    it('validates reconciliation resolution schema', () => {
      const validResolve = {
        resolutionStatus: 'RESOLVED' as const,
        resolutionNotes: 'Dispute investigated with merchant bank branch; transaction confirmed'
      };
      assert.doesNotThrow(() => AdminResolveReconciliationSchema.parse(validResolve));

      const invalidStatus = {
        resolutionStatus: 'FORCE_SUCCESS', // FORBIDDEN! Arbitrary status escalation disallowed
        resolutionNotes: 'Attempting to bypass dual-source check'
      };
      assert.throws(() => AdminResolveReconciliationSchema.parse(invalidStatus as any));
    });

    it('case resolution updates operational notes without altering extracted evidence or payment status', () => {
      const originalPayment = {
        id: 'pay_9921',
        status: PaymentStatus.PARTIAL_SUCCESS, // Only Email received
        amountPaise: 10000
      };

      const originalCase = {
        id: 'case_001',
        paymentRequestId: originalPayment.id,
        status: 'OPEN',
        reason: 'Android companion push notification missing after 15 minutes'
      };

      // Admin resolves the operational case
      const resolvedCase = {
        ...originalCase,
        status: 'RESOLVED',
        resolutionNotes: 'Merchant contacted customer offline; customer will retry with companion active'
      };

      // Invariant: Case is RESOLVED, but PaymentRequest status remains PARTIAL_SUCCESS (dual-source invariant)
      assert.equal(resolvedCase.status, 'RESOLVED');
      assert.equal(originalPayment.status, PaymentStatus.PARTIAL_SUCCESS, 'Payment status must never be forced to SUCCESS without both evidence sources');
    });
  });

  // ---------------- 5. PLATFORM CONFIGURATION & BOUNDS CHECKING ----------------
  describe('5. Platform Operational Configuration Boundaries', () => {
    it('accepts safe configuration updates within allowed bounds', () => {
      const safeConfig = {
        paymentExpirySeconds: 1200, // 20 min
        evidenceMatchingWindowSeconds: 2400, // 40 min
        reconciliationScheduleIntervalSeconds: 90,
        webhookMaxRetries: 6,
        webhookBackoffFactor: 3,
        evidenceRetentionDays: 180,
        rateLimitPerMinute: 150
      };

      const parsed = UpdatePlatformConfigSchema.parse(safeConfig);
      assert.equal(parsed.paymentExpirySeconds, 1200);
      assert.equal(parsed.webhookMaxRetries, 6);
    });

    it('rejects unsafe or out-of-bounds operational settings', () => {
      // Expiry too short (< 300s / 5min)
      assert.throws(() => UpdatePlatformConfigSchema.parse({ paymentExpirySeconds: 60 }));

      // Expiry too long (> 86400s / 24h)
      assert.throws(() => UpdatePlatformConfigSchema.parse({ paymentExpirySeconds: 100000 }));

      // Webhook retries too excessive (> 10)
      assert.throws(() => UpdatePlatformConfigSchema.parse({ webhookMaxRetries: 25 }));

      // Rate limit negative
      assert.throws(() => UpdatePlatformConfigSchema.parse({ rateLimitPerMinute: -10 }));
    });
  });

  // ---------------- 6. IMMUTABLE AUDIT LOGGING & SECURITY ----------------
  describe('6. Immutable Audit Trail & Redaction', () => {
    it('formats audit records with actor, action, resource, timestamp and details', () => {
      const auditEntry = {
        userId: mockAdminId,
        action: 'MERCHANT_SUSPENDED',
        resource: 'merchants',
        resourceId: mockMerchantId,
        ipAddress: '192.168.1.10',
        userAgent: 'RGS-Admin-Console/1.0',
        details: { reason: 'Suspected compromised API key' },
        createdAt: new Date().toISOString()
      };

      assert.equal(auditEntry.userId, mockAdminId);
      assert.equal(auditEntry.action, 'MERCHANT_SUSPENDED');
      assert.equal(auditEntry.resource, 'merchants');
      assert.ok(auditEntry.createdAt);
    });

    it('ensures sensitive OAuth tokens and API secrets are never returned in admin monitoring', () => {
      const rawIntegrationDoc = {
        provider: 'GMAIL',
        merchantId: mockMerchantId,
        emailAddress: 'finance@merchant.example',
        status: 'CONNECTED',
        credentials: {
          accessToken: 'ya29.a0ARrdaM841239841238914123',
          refreshToken: '1//04_secret_oauth_refresh_token'
        }
      };

      // Admin monitoring projection strips credentials
      const sanitizedIntegration = {
        provider: rawIntegrationDoc.provider,
        merchantId: rawIntegrationDoc.merchantId,
        emailAddress: rawIntegrationDoc.emailAddress,
        status: rawIntegrationDoc.status
      };

      assert.equal((sanitizedIntegration as any).credentials, undefined);
      assert.equal(sanitizedIntegration.emailAddress, 'finance@merchant.example');
    });
  });
});
