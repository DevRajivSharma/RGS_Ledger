import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { EnvironmentSchema, ValidatedEnvironment } from '@rgs-ledger/validation';

// Resolve .env from process.cwd() or monorepo root if running inside workspace
const cwdEnv = path.resolve(process.cwd(), '.env');
const monorepoRootEnv = path.resolve(process.cwd(), '../../.env');

if (fs.existsSync(cwdEnv)) {
  dotenv.config({ path: cwdEnv });
} else if (fs.existsSync(monorepoRootEnv)) {
  dotenv.config({ path: monorepoRootEnv });
} else {
  dotenv.config();
}

let validatedConfig: ValidatedEnvironment;

const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.npm_lifecycle_event === 'test' ||
  process.argv.some(arg => arg.includes('test')) ||
  process.execArgv.some(arg => arg.includes('test'));

try {
  validatedConfig = EnvironmentSchema.parse(process.env);
} catch (error: any) {
  // If parsing fails during test runs, provide safe defaults for testing
  if (isTestEnv) {
    validatedConfig = EnvironmentSchema.parse({
      ...process.env,
      NODE_ENV: 'test',
      MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/rgs_ledger_test',
      MERCHANT_DASHBOARD_URL: process.env.MERCHANT_DASHBOARD_URL || process.env.FRONTEND_URL || 'http://localhost:3001',
      HOSTED_CHECKOUT_URL: process.env.HOSTED_CHECKOUT_URL || 'http://localhost:3002',
      FRONTEND_URL: process.env.FRONTEND_URL || process.env.MERCHANT_DASHBOARD_URL || 'http://localhost:3001',
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'test_jwt_access_secret_min_32_chars_123',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'test_jwt_refresh_secret_min_32_chars_123',
      SESSION_SECRET: process.env.SESSION_SECRET || 'test_session_secret_min_32_chars_123',
      ENCRYPTION_KEY_HEX: process.env.ENCRYPTION_KEY_HEX || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      SCHEDULER_SHARED_SECRET: process.env.SCHEDULER_SHARED_SECRET || 'test_scheduler_secret_min_16_chars',
      ADMIN_BOOTSTRAP_SECRET: process.env.ADMIN_BOOTSTRAP_SECRET || 'test_admin_bootstrap_secret_12345',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'test_google_client_id',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'test_google_client_secret',
      GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:4000/v1/integrations/gmail/callback'
    });
  } else {
    // eslint-disable-next-line no-console
    console.error('FATAL: Environment validation failed:');
    // eslint-disable-next-line no-console
    console.error(error.errors || error);
    process.exit(1);
  }
}

export const config = validatedConfig;
