import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { EnvironmentSchema } from '@rgs-ledger/validation';

describe('Root .env and Configuration Verification', () => {
  const rootEnvPath = path.resolve(process.cwd(), '.env');

  test('confirms root .env file exists and loads successfully', () => {
    assert.ok(fs.existsSync(rootEnvPath), 'Root .env file must exist');
    const result = dotenv.config({ path: rootEnvPath });
    assert.equal(result.error, undefined, 'dotenv should parse root .env without error');
  });

  test('validates all required environment variables against schema', () => {
    dotenv.config({ path: rootEnvPath });
    const parsed = EnvironmentSchema.safeParse(process.env);
    assert.ok(parsed.success, `Schema validation failed: ${JSON.stringify(parsed.error?.issues)}`);
  });

  test('verifies Google OAuth variable names and redirect URI route matching', () => {
    dotenv.config({ path: rootEnvPath });
    const parsed = EnvironmentSchema.parse(process.env);

    // Confirm variable properties exist on validated config
    assert.ok('GOOGLE_CLIENT_ID' in parsed);
    assert.ok('GOOGLE_CLIENT_SECRET' in parsed);
    assert.ok('GOOGLE_OAUTH_REDIRECT_URI' in parsed);

    // Confirm redirect URI matches the exact Gmail OAuth route
    assert.equal(
      parsed.GOOGLE_OAUTH_REDIRECT_URI,
      'http://localhost:4000/v1/integrations/gmail/callback',
      'Configured redirect URI must match the mounted Gmail callback route'
    );
  });

  test('verifies core URLs, port, and CORS origins alignment', () => {
    dotenv.config({ path: rootEnvPath });
    const parsed = EnvironmentSchema.parse(process.env);

    assert.equal(parsed.PORT, 4000, 'API port should be 4000');
    assert.equal(parsed.API_BASE_URL, 'http://localhost:4000', 'API base URL should be http://localhost:4000');

    // Check MERCHANT_DASHBOARD_URL and HOSTED_CHECKOUT_URL
    assert.ok(
      parsed.MERCHANT_DASHBOARD_URL.startsWith('http'),
      'MERCHANT_DASHBOARD_URL must be a valid URL'
    );
    assert.equal(
      parsed.MERCHANT_DASHBOARD_URL,
      'http://localhost:3001',
      'MERCHANT_DASHBOARD_URL should be http://localhost:3001 in development'
    );
    assert.ok(
      parsed.HOSTED_CHECKOUT_URL.startsWith('http'),
      'HOSTED_CHECKOUT_URL must be a valid URL'
    );
    assert.equal(
      parsed.HOSTED_CHECKOUT_URL,
      'http://localhost:3002',
      'HOSTED_CHECKOUT_URL should be http://localhost:3002 in development'
    );
    assert.ok(
      parsed.FRONTEND_URL.startsWith('http'),
      'FRONTEND_URL must be a valid URL'
    );

    // CORS origins must include merchant dashboard port (3001) and hosted checkout (3002)
    const corsList = parsed.ALLOWED_CORS_ORIGINS.split(',').map((o) => o.trim());
    assert.ok(
      corsList.includes('http://localhost:3001') || corsList.includes('*'),
      'ALLOWED_CORS_ORIGINS must include the merchant dashboard at http://localhost:3001'
    );
    assert.ok(
      corsList.includes('http://localhost:3002') || corsList.includes('*'),
      'ALLOWED_CORS_ORIGINS must include the hosted checkout at http://localhost:3002'
    );
  });

  test('verifies defensive alias mappings for JWT_SECRET and CORS_ORIGIN', () => {
    // Test JWT_SECRET -> JWT_ACCESS_SECRET
    const parsedWithJwtSecret = EnvironmentSchema.parse({
      MONGODB_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'min_sixteen_characters_jwt_secret_value',
      JWT_REFRESH_SECRET: 'min_sixteen_characters_refresh_secret',
      SESSION_SECRET: 'min_sixteen_characters_session_secret',
      ENCRYPTION_KEY_HEX: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      SCHEDULER_SHARED_SECRET: 'min_sixteen_characters_scheduler_secret'
    });
    assert.equal(parsedWithJwtSecret.JWT_ACCESS_SECRET, 'min_sixteen_characters_jwt_secret_value');

    // Test CORS_ORIGIN -> ALLOWED_CORS_ORIGINS
    const parsedWithCorsOrigin = EnvironmentSchema.parse({
      MONGODB_URI: 'mongodb://localhost:27017/test',
      JWT_ACCESS_SECRET: 'min_sixteen_characters_access_secret',
      JWT_REFRESH_SECRET: 'min_sixteen_characters_refresh_secret',
      SESSION_SECRET: 'min_sixteen_characters_session_secret',
      ENCRYPTION_KEY_HEX: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      SCHEDULER_SHARED_SECRET: 'min_sixteen_characters_scheduler_secret',
      CORS_ORIGIN: 'http://custom-origin.com'
    });
    assert.equal(parsedWithCorsOrigin.ALLOWED_CORS_ORIGINS, 'http://custom-origin.com');
  });

  test('enforces production environment URL rules: rejects localhost URLs in production mode', () => {
    assert.throws(
      () => {
        EnvironmentSchema.parse({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://prod.example.com/db',
          JWT_ACCESS_SECRET: 'prod_jwt_access_secret_long_secure_32_characters_key_99',
          JWT_REFRESH_SECRET: 'prod_jwt_refresh_secret_long_secure_32_characters_key_88',
          SESSION_SECRET: 'prod_session_secret_long_secure_32_characters_key_77',
          ENCRYPTION_KEY_HEX: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
          SCHEDULER_SHARED_SECRET: 'prod_scheduler_secret_32_characters_hex_66',
          ADMIN_BOOTSTRAP_SECRET: 'prod_admin_bootstrap_secret_secure_55',
          MERCHANT_DASHBOARD_URL: 'http://localhost:3001',
          HOSTED_CHECKOUT_URL: 'https://checkout.rgsledger.com'
        });
      },
      /MERCHANT_DASHBOARD_URL cannot use localhost/
    );

    assert.throws(
      () => {
        EnvironmentSchema.parse({
          NODE_ENV: 'production',
          MONGODB_URI: 'mongodb+srv://prod.example.com/db',
          JWT_ACCESS_SECRET: 'prod_jwt_access_secret_long_secure_32_characters_key_99',
          JWT_REFRESH_SECRET: 'prod_jwt_refresh_secret_long_secure_32_characters_key_88',
          SESSION_SECRET: 'prod_session_secret_long_secure_32_characters_key_77',
          ENCRYPTION_KEY_HEX: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
          SCHEDULER_SHARED_SECRET: 'prod_scheduler_secret_32_characters_hex_66',
          ADMIN_BOOTSTRAP_SECRET: 'prod_admin_bootstrap_secret_secure_55',
          MERCHANT_DASHBOARD_URL: 'https://dashboard.rgsledger.com',
          HOSTED_CHECKOUT_URL: 'http://127.0.0.1:3002'
        });
      },
      /HOSTED_CHECKOUT_URL cannot use localhost/
    );
  });
});
