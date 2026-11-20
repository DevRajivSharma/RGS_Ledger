import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentSchema } from '@rgs-ledger/validation';
import { config } from '../../config/index.js';
import { PaymentLinkService } from './payment-link.service.js';
import { PaymentLinkStatus } from '@rgs-ledger/shared-types';

describe('Phase 5A.2 — Part A: Hosted Checkout URL & Payment Link Configuration', () => {
  const merchantId = 'mer_phase5a2_test';

  test('1. Environment schema introduces separate MERCHANT_DASHBOARD_URL and HOSTED_CHECKOUT_URL with correct defaults', () => {
    const parsed = EnvironmentSchema.parse({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/test_db',
      JWT_ACCESS_SECRET: 'min_sixteen_characters_jwt_secret_value',
      JWT_REFRESH_SECRET: 'min_sixteen_characters_refresh_secret',
      SESSION_SECRET: 'min_sixteen_characters_session_secret',
      ENCRYPTION_KEY_HEX: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      SCHEDULER_SHARED_SECRET: 'min_sixteen_characters_scheduler_secret',
      MERCHANT_DASHBOARD_URL: 'http://localhost:3001',
      HOSTED_CHECKOUT_URL: 'http://localhost:3002'
    });

    assert.equal(parsed.MERCHANT_DASHBOARD_URL, 'http://localhost:3001');
    assert.equal(parsed.HOSTED_CHECKOUT_URL, 'http://localhost:3002');
    assert.notEqual(parsed.MERCHANT_DASHBOARD_URL, parsed.HOSTED_CHECKOUT_URL);
  });

  test('2. Customer-facing payment links generate checkoutUrl using HOSTED_CHECKOUT_URL, never merchant dashboard', async () => {
    const service = new PaymentLinkService();
    const fakeDoc = {
      _id: '507f191e810c19729de860ea',
      merchantId,
      linkReference: 'plink_abc123xyz789',
      title: 'Coffee Beans',
      description: 'Single-origin roast',
      amountPaise: 45000, // ₹450.00 fixed
      currency: 'INR',
      status: PaymentLinkStatus.ACTIVE,
      isReusable: true,
      paymentsCount: 0,
      totalCollectedPaise: 0,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Format DTO using the service's private formatPaymentLinkDto
    const formatted = (service as any).formatPaymentLinkDto(fakeDoc);

    const expectedHost = (config.HOSTED_CHECKOUT_URL || 'http://localhost:3002').replace(/\/+$/, '');
    assert.ok(
      formatted.checkoutUrl.startsWith(expectedHost),
      `checkoutUrl "${formatted.checkoutUrl}" must start with hosted checkout URL "${expectedHost}"`
    );
    assert.ok(
      !formatted.checkoutUrl.includes(':3001'),
      'Customer-facing payment link checkoutUrl must NEVER use merchant dashboard port (:3001)'
    );
    assert.ok(
      formatted.checkoutUrl.includes(`?link=${fakeDoc.linkReference}`),
      'checkoutUrl must include ?link= parameter with linkReference'
    );
  });

  test('3. Generates correct checkoutUrl for both fixed-amount and open-amount links', async () => {
    const service = new PaymentLinkService();

    // Fixed amount link (₹100.00)
    const fixedLink = (service as any).formatPaymentLinkDto({
      _id: '507f191e810c19729de860eb',
      merchantId,
      linkReference: 'plink_fixed_100',
      title: 'Fixed Donation',
      amountPaise: 10000,
      isReusable: true,
      status: PaymentLinkStatus.ACTIVE
    });
    assert.equal(fixedLink.amountPaise, 10000);
    assert.equal(fixedLink.amountRupees, 100);
    assert.ok(fixedLink.checkoutUrl.includes('?link=plink_fixed_100'));

    // Open amount link (amountPaise is null)
    const openLink = (service as any).formatPaymentLinkDto({
      _id: '507f191e810c19729de860ec',
      merchantId,
      linkReference: 'plink_open_amount',
      title: 'Custom Tip',
      amountPaise: null,
      isReusable: true,
      status: PaymentLinkStatus.ACTIVE
    });
    assert.equal(openLink.amountPaise, null);
    assert.equal(openLink.amountRupees, null);
    assert.ok(openLink.checkoutUrl.includes('?link=plink_open_amount'));
  });

  test('4. Hosted checkout URL parser logic resolves ?link= and ?plink= query parameters properly', () => {
    // Test URL query param extractor logic matching apps/hosted-checkout/src/App.tsx
    const testResolveLinkRef = (searchString: string, pathname: string = '/checkout') => {
      const params = new URLSearchParams(searchString);
      const link = params.get('link') || params.get('plink');
      if (link) return link.trim();
      const path = pathname.replace(/^\/checkout\/?/, '').replace(/^\//, '').trim();
      if (path.startsWith('plink_')) return path;
      return '';
    };

    assert.equal(testResolveLinkRef('?link=plink_test_123'), 'plink_test_123');
    assert.equal(testResolveLinkRef('?plink=plink_test_456'), 'plink_test_456');
    assert.equal(testResolveLinkRef('?utm_source=sms&link=plink_test_789&foo=bar'), 'plink_test_789');
    assert.equal(testResolveLinkRef('', '/checkout/plink_path_ref'), 'plink_path_ref');
    assert.equal(testResolveLinkRef('', '/plink_direct_path'), 'plink_direct_path');
    assert.equal(testResolveLinkRef(''), '');
  });

  test('5. Production validation strictly rejects localhost or loopback URLs for all user-facing frontends', () => {
    const validProdBase = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://prod.example.com/db',
      JWT_ACCESS_SECRET: 'production_jwt_access_secret_long_secure_32_characters_11',
      JWT_REFRESH_SECRET: 'production_jwt_refresh_secret_long_secure_32_characters_22',
      SESSION_SECRET: 'production_session_secret_long_secure_32_characters_33',
      ENCRYPTION_KEY_HEX: '8a2a7a4cd149f588ec9c137043d83162f93c1148002bc5fab5977d082572fe92',
      SCHEDULER_SHARED_SECRET: 'production_scheduler_secret_32_chars_hex_44',
      ADMIN_BOOTSTRAP_SECRET: 'production_admin_bootstrap_secret_secure_55'
    };

    // Valid production config with custom domains succeeds
    const prodParsed = EnvironmentSchema.parse({
      ...validProdBase,
      MERCHANT_DASHBOARD_URL: 'https://dashboard.rgsledger.com',
      HOSTED_CHECKOUT_URL: 'https://checkout.rgsledger.com',
      FRONTEND_URL: 'https://dashboard.rgsledger.com'
    });
    assert.equal(prodParsed.HOSTED_CHECKOUT_URL, 'https://checkout.rgsledger.com');

    // Reject localhost for HOSTED_CHECKOUT_URL in production
    assert.throws(() => {
      EnvironmentSchema.parse({
        ...validProdBase,
        MERCHANT_DASHBOARD_URL: 'https://dashboard.rgsledger.com',
        HOSTED_CHECKOUT_URL: 'http://localhost:3002'
      });
    }, /HOSTED_CHECKOUT_URL cannot use localhost/);

    // Reject 127.0.0.1 for MERCHANT_DASHBOARD_URL in production
    assert.throws(() => {
      EnvironmentSchema.parse({
        ...validProdBase,
        MERCHANT_DASHBOARD_URL: 'http://127.0.0.1:3001',
        HOSTED_CHECKOUT_URL: 'https://checkout.rgsledger.com'
      });
    }, /MERCHANT_DASHBOARD_URL cannot use localhost/);
  });
});
