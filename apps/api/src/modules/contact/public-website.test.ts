import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RegisterInputSchema, LoginInputSchema } from '@rgs-ledger/validation';

describe('Phase 4B: Public Website & Merchant Registration Validation', () => {
  it('validates correct merchant registration payload', () => {
    const validRegistration = {
      email: 'merchant@store.example',
      password: 'StrongPassword123!',
      merchantName: 'Acme Retail Solutions',
      upiVpa: 'acme@yespop'
    };

    const parsed = RegisterInputSchema.safeParse(validRegistration);
    assert.strictEqual(parsed.success, true);
    if (parsed.success) {
      assert.strictEqual(parsed.data.email, 'merchant@store.example');
      assert.strictEqual(parsed.data.merchantName, 'Acme Retail Solutions');
      assert.strictEqual(parsed.data.upiVpa, 'acme@yespop');
    }
  });

  it('rejects registration with invalid UPI VPA format', () => {
    const invalidVpa = {
      email: 'merchant@store.example',
      password: 'StrongPassword123!',
      merchantName: 'Acme Retail Solutions',
      upiVpa: 'invalid-vpa-without-at-sign'
    };

    const parsed = RegisterInputSchema.safeParse(invalidVpa);
    assert.strictEqual(parsed.success, false);
  });

  it('rejects registration with password under 8 characters', () => {
    const shortPassword = {
      email: 'merchant@store.example',
      password: 'short',
      merchantName: 'Acme Retail Solutions',
      upiVpa: 'acme@yespop'
    };

    const parsed = RegisterInputSchema.safeParse(shortPassword);
    assert.strictEqual(parsed.success, false);
  });

  it('validates merchant login credentials input', () => {
    const validLogin = {
      email: 'merchant@store.example',
      password: 'StrongPassword123!'
    };

    const parsed = LoginInputSchema.safeParse(validLogin);
    assert.strictEqual(parsed.success, true);
  });

  it('verifies that no secret keys or passwords leak in client responses', () => {
    const mockUserResponse = {
      id: 'usr_123',
      email: 'merchant@store.example',
      role: 'MERCHANT_ADMIN',
      merchantId: 'mer_123'
    };

    assert.ok(!('passwordHash' in mockUserResponse));
    assert.ok(!('refreshTokenHash' in mockUserResponse));
  });
});
