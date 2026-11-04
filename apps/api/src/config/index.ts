import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.API_PORT || '4000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:5173',
  checkoutUrl: process.env.CHECKOUT_URL || 'http://localhost:5174',
  developerPortalUrl: process.env.DEVELOPER_PORTAL_URL || 'http://localhost:5175',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:5176',

  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/rgs_ledger',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'rgs_dev_access_secret_min_32_chars_ok',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'rgs_dev_refresh_secret_min_32_chars_ok',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },

  cookieSecret: process.env.COOKIE_SECRET || 'rgs_dev_cookie_secret_min_32_chars_ok',
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  webhookSigningSecret: process.env.WEBHOOK_SIGNING_SECRET || 'whsec_default_signing_secret',

  paymentEnvironment: process.env.PAYMENT_ENVIRONMENT || 'SANDBOX',
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'INR',

  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025', 10),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'no-reply@rgsledger.com'
  }
};
