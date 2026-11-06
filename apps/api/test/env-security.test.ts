import { describe, it, expect } from 'vitest';
import { validateEnvironment, assertProductionEnvironment } from '../src/config/validator';

describe('RGS Ledger — Environment Security & Production Validation Tests', () => {
  const baseSecureEnv: Record<string, string> = {
    NODE_ENV: 'production',
    PAYMENT_ENVIRONMENT: 'LIVE',
    API_PORT: '4000',
    API_URL: 'https://api.rgsledger.com',
    CHECKOUT_URL: 'https://checkout.rgsledger.com',
    DASHBOARD_URL: 'https://dashboard.rgsledger.com',
    MONGODB_URI: 'mongodb://dbuser:StrongPass123!@cluster0.mongodb.net/rgs_ledger?retryWrites=true',
    REDIS_URL: 'rediss://default:StrongRedisPass123!@redis.rgsledger.com:6380',
    JWT_ACCESS_SECRET: '8f7d9a8e7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e',
    JWT_REFRESH_SECRET: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    ENCRYPTION_KEY: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    COOKIE_SECRET: 'c00k13_s3cr3t_pr0duct10n_v3ry_str0ng_4nd_l0ng_3n0ugh_k3y',
    WEBHOOK_SIGNING_SECRET: 'whsec_live_9f8e7d6c5b4a392817263544a3b2c1d0'
  };

  it('passes cleanly when production environment is fully secured', () => {
    const summary = validateEnvironment(baseSecureEnv);
    expect(summary.valid).toBe(true);
    expect(summary.errors.length).toBe(0);
    expect(() => assertProductionEnvironment(baseSecureEnv)).not.toThrow();
  });

  describe('JWT Secrets Validation', () => {
    it('fails production startup if JWT_ACCESS_SECRET is missing', () => {
      const env = { ...baseSecureEnv, JWT_ACCESS_SECRET: '' };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('JWT_ACCESS_SECRET is required'))).toBe(true);
      expect(() => assertProductionEnvironment(env)).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('fails production startup if JWT_ACCESS_SECRET is shorter than 32 characters', () => {
      const env = { ...baseSecureEnv, JWT_ACCESS_SECRET: 'short_secret_under_32' };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('at least 32 characters'))).toBe(true);
      expect(() => assertProductionEnvironment(env)).toThrow();
    });

    it('fails production startup if JWT_ACCESS_SECRET uses development defaults or placeholders', () => {
      const env = { ...baseSecureEnv, JWT_ACCESS_SECRET: 'replace_with_secure_random_secret_min_32' };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('placeholder'))).toBe(true);
      expect(() => assertProductionEnvironment(env)).toThrow();
    });

    it('fails production startup if JWT_REFRESH_SECRET is identical to JWT_ACCESS_SECRET', () => {
      const env = { ...baseSecureEnv, JWT_REFRESH_SECRET: baseSecureEnv.JWT_ACCESS_SECRET };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('identical to JWT_ACCESS_SECRET'))).toBe(true);
      expect(() => assertProductionEnvironment(env)).toThrow();
    });
  });

  describe('Master ENCRYPTION_KEY Validation (AES-256-GCM)', () => {
    it('fails production startup if ENCRYPTION_KEY is missing', () => {
      const env = { ...baseSecureEnv, ENCRYPTION_KEY: '' };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('ENCRYPTION_KEY is missing'))).toBe(true);
      expect(() => assertProductionEnvironment(env)).toThrow(/ENCRYPTION_KEY/);
    });

    it('fails production startup if ENCRYPTION_KEY is not 64 hex characters (32 bytes)', () => {
      // 32 chars instead of 64
      const env1 = { ...baseSecureEnv, ENCRYPTION_KEY: 'a1b2c3d4e5f67890123456789abcdef0' };
      const summary1 = validateEnvironment(env1);
      expect(summary1.valid).toBe(false);
      expect(summary1.errors.some(e => e.includes('64 hexadecimal characters'))).toBe(true);

      // Non-hex characters
      const env2 = { ...baseSecureEnv, ENCRYPTION_KEY: 'z1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0' };
      const summary2 = validateEnvironment(env2);
      expect(summary2.valid).toBe(false);
      expect(summary2.errors.some(e => e.includes('64 hexadecimal characters'))).toBe(true);
    });

    it('fails production startup if ENCRYPTION_KEY uses the public example key', () => {
      const env = { ...baseSecureEnv, ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('known example key'))).toBe(true);
      expect(() => assertProductionEnvironment(env)).toThrow(/ENCRYPTION_KEY/);
    });
  });

  describe('Cookie and Webhook Secrets Validation', () => {
    it('fails production startup if COOKIE_SECRET is weak or uses placeholder text', () => {
      const env = { ...baseSecureEnv, COOKIE_SECRET: 'replace_with_secure_random_secret_cookie' };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('COOKIE_SECRET'))).toBe(true);
    });

    it('fails production startup if WEBHOOK_SIGNING_SECRET is weak or uses placeholder text', () => {
      const env = { ...baseSecureEnv, WEBHOOK_SIGNING_SECRET: 'whsec_platform_default_webhook_signing_secret' };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('WEBHOOK_SIGNING_SECRET'))).toBe(true);
    });
  });

  describe('Live Provider & Sandbox Mismatch Prevention', () => {
    it('fails if PAYMENT_ENVIRONMENT is LIVE but PhonePe uses PGTESTPAYUAT', () => {
      const env = {
        ...baseSecureEnv,
        PHONEPE_MERCHANT_ID: 'PGTESTPAYUAT',
        PHONEPE_SALT_KEY: '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
        PHONEPE_SALT_INDEX: '1',
        PHONEPE_ENV: 'sandbox'
      };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('sandbox/UAT test identifier'))).toBe(true);
      expect(summary.errors.some(e => e.includes('PHONEPE_ENV is set to sandbox'))).toBe(true);
    });

    it('fails if PAYMENT_ENVIRONMENT is LIVE but Paytm uses STAGE_MID', () => {
      const env = {
        ...baseSecureEnv,
        PAYTM_MERCHANT_ID: 'STAGE_MID_PAYTM_99214',
        PAYTM_MERCHANT_KEY: 'STAGE_MKEY_PAYTM_8819273',
        PAYTM_ENV: 'sandbox'
      };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('staging test identifier'))).toBe(true);
      expect(summary.errors.some(e => e.includes('PAYTM_ENV is set to sandbox'))).toBe(true);
    });

    it('fails if live provider is configured with missing salt key or index', () => {
      const env = {
        ...baseSecureEnv,
        PHONEPE_MERCHANT_ID: 'LIVE_PROD_MERCHANT_ID',
        PHONEPE_ENV: 'production',
        PHONEPE_SALT_KEY: '', // Missing
        PHONEPE_SALT_INDEX: ''
      };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('PHONEPE_SALT_KEY'))).toBe(true);
    });

    it('fails if PAYMENT_ENVIRONMENT is LIVE but service URLs point to localhost', () => {
      const env = {
        ...baseSecureEnv,
        CHECKOUT_URL: 'http://localhost:5174'
      };
      const summary = validateEnvironment(env);
      expect(summary.valid).toBe(false);
      expect(summary.errors.some(e => e.includes('cannot point to localhost'))).toBe(true);
    });
  });

  describe('Development Mode Non-Fatal Handling', () => {
    it('allows development defaults with warnings when NODE_ENV=development and PAYMENT_ENVIRONMENT=SANDBOX', () => {
      const devEnv = {
        NODE_ENV: 'development',
        PAYMENT_ENVIRONMENT: 'SANDBOX',
        JWT_ACCESS_SECRET: 'rgs_dev_access_secret_change_in_production_min_32_chars',
        JWT_REFRESH_SECRET: 'rgs_dev_refresh_secret_change_in_production_min_32_chars',
        ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        COOKIE_SECRET: 'rgs_dev_cookie_secret_change_in_production_min_32_chars',
        WEBHOOK_SIGNING_SECRET: 'whsec_platform_default_webhook_signing_secret',
        API_URL: 'http://localhost:4000',
        CHECKOUT_URL: 'http://localhost:5174',
        DASHBOARD_URL: 'http://localhost:5173'
      };
      const summary = validateEnvironment(devEnv);
      expect(summary.valid).toBe(true);
      expect(summary.errors.length).toBe(0);
      expect(summary.warnings.length).toBeGreaterThan(0);
      expect(() => assertProductionEnvironment(devEnv)).not.toThrow();
    });
  });
});
