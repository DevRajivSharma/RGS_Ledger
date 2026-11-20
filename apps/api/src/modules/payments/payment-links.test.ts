import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CreatePaymentLinkSchema, InitiateLinkPaymentSchema } from '@rgs-ledger/validation';
import { PaymentLinkStatus } from '@rgs-ledger/shared-types';

describe('Phase 3A: Payment Links Domain & Validation', () => {
  it('validates a fixed-amount reusable payment link input', () => {
    const input = {
      title: 'Consulting Services - 1 Hour',
      description: 'Technical architecture consulting session',
      amountPaise: 250000, // ₹2500.00
      isReusable: true,
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    };

    const parsed = CreatePaymentLinkSchema.parse(input);
    assert.equal(parsed.title, 'Consulting Services - 1 Hour');
    assert.equal(parsed.amountPaise, 250000);
    assert.equal(parsed.isReusable, true);
    assert.ok(parsed.expiresAt);
  });

  it('validates an open-amount (customer-defined) payment link input', () => {
    const input = {
      title: 'Open Donation / Tip Jar',
      description: 'Support open-source development',
      amountPaise: null,
      isReusable: true
    };

    const parsed = CreatePaymentLinkSchema.parse(input);
    assert.equal(parsed.title, 'Open Donation / Tip Jar');
    assert.equal(parsed.amountPaise, null);
    assert.equal(parsed.isReusable, true);
  });

  it('rejects payment links with invalid amount or empty title', () => {
    assert.throws(() => {
      CreatePaymentLinkSchema.parse({
        title: '',
        amountPaise: 1000
      });
    }, /Title must be at least 2 characters/);

    assert.throws(() => {
      CreatePaymentLinkSchema.parse({
        title: 'Valid Title',
        amountPaise: -50
      });
    }, /Minimum amount is 100 paise/);
  });

  it('validates initiation payload with customer amount for open-amount link', () => {
    const validPayload = {
      amountPaise: 50000, // ₹500.00
      customerName: 'Aarav Patel',
      customerPhone: '9876543210'
    };

    const parsed = InitiateLinkPaymentSchema.parse(validPayload);
    assert.equal(parsed.amountPaise, 50000);
    assert.equal(parsed.customerName, 'Aarav Patel');
    assert.equal(parsed.customerPhone, '9876543210');
  });

  it('enforces minimum payable amount on link initiation (at least ₹1.00 / 100 paise)', () => {
    assert.throws(() => {
      InitiateLinkPaymentSchema.parse({
        amountPaise: 50 // ₹0.50 is below minimum ₹1.00
      });
    }, /Minimum amount is 100 paise/);
  });

  it('verifies payment link statuses conform to domain lifecycle', () => {
    assert.equal(PaymentLinkStatus.ACTIVE, 'ACTIVE');
    assert.equal(PaymentLinkStatus.INACTIVE, 'INACTIVE');
    assert.equal(PaymentLinkStatus.EXPIRED, 'EXPIRED');
    assert.equal(PaymentLinkStatus.REVOKED, 'REVOKED');
  });
});
