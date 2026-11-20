import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  UPI_VPA_REGEX,
  UTR_REGEX,
  CreatePaymentRequestSchema,
  UpiConfigSchema
} from './index.js';

describe('Validation Schemas', () => {
  describe('UPI VPA Regex', () => {
    it('accepts valid UPI VPAs', () => {
      assert.ok(UPI_VPA_REGEX.test('merchant@okhdfcbank'));
      assert.ok(UPI_VPA_REGEX.test('9876543210@paytm'));
      assert.ok(UPI_VPA_REGEX.test('user.name-123@icici'));
    });

    it('rejects invalid UPI VPAs', () => {
      assert.ok(!UPI_VPA_REGEX.test('invalidvpa'));
      assert.ok(!UPI_VPA_REGEX.test('@bank'));
      assert.ok(!UPI_VPA_REGEX.test('user@'));
    });
  });

  describe('UTR Regex', () => {
    it('accepts standard 12-digit and alphanumeric UTRs', () => {
      assert.ok(UTR_REGEX.test('412356789012'));
      assert.ok(UTR_REGEX.test('CMS123456789'));
    });

    it('rejects too short or special-char UTRs', () => {
      assert.ok(!UTR_REGEX.test('123'));
      assert.ok(!UTR_REGEX.test('UTR-123-INVALID!'));
    });
  });

  describe('CreatePaymentRequestSchema', () => {
    it('validates proper payment request input', () => {
      const valid = CreatePaymentRequestSchema.safeParse({
        orderId: 'ORD_20261113_001',
        amountPaise: 25000,
        description: 'Store purchase'
      });
      assert.ok(valid.success);
      if (valid.success) {
        assert.strictEqual(valid.data.amountPaise, 25000);
      }
    });

    it('rejects negative or fractional paise', () => {
      const negative = CreatePaymentRequestSchema.safeParse({
        orderId: 'ORD_001',
        amountPaise: -500
      });
      assert.ok(!negative.success);

      const floatPaise = CreatePaymentRequestSchema.safeParse({
        orderId: 'ORD_002',
        amountPaise: 49.99
      });
      assert.ok(!floatPaise.success);
    });
  });

  describe('UpiConfigSchema', () => {
    it('validates merchant UPI configuration', () => {
      const valid = UpiConfigSchema.safeParse({
        vpa: 'store@bank',
        businessName: 'My Awesome Store',
        mcc: '5411'
      });
      assert.ok(valid.success);
    });
  });
});
