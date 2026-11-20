import { describe, it } from 'node:test';
import assert from 'node:assert';
import { security } from './security.js';

describe('Security Utilities', () => {
  it('hashes and verifies passwords accurately with timing-safe comparison', async () => {
    const rawPassword = 'superSecretPassword123!';
    const hash = await security.hashPassword(rawPassword);

    assert.ok(hash.includes(':'));
    const parts = hash.split(':');
    assert.strictEqual(parts.length, 2);

    // Matching password must verify
    assert.strictEqual(await security.verifyPassword(rawPassword, hash), true);

    // Wrong password must fail
    assert.strictEqual(await security.verifyPassword('wrongPassword123!', hash), false);
    assert.strictEqual(await security.verifyPassword('', hash), false);
  });

  it('signs and verifies JWT access tokens with payload preservation', () => {
    const payload = {
      userId: 'usr_12345',
      merchantId: 'mer_67890',
      role: 'MERCHANT_ADMIN'
    };

    const token = security.generateAccessToken(payload);
    assert.strictEqual(typeof token, 'string');
    assert.ok(token.split('.').length === 3);

    const verified = security.verifyAccessToken(token);
    assert.strictEqual(verified.userId, payload.userId);
    assert.strictEqual(verified.merchantId, payload.merchantId);
    assert.strictEqual(verified.role, payload.role);
  });

  it('rejects tampered and invalid JWT access tokens', () => {
    const token = security.generateAccessToken({ userId: 'u1', merchantId: 'm1', role: 'USER' });
    const tampered = token.slice(0, -5) + 'xxxxx';

    assert.throws(
      () => security.verifyAccessToken(tampered),
      (err: any) => err.name === 'JsonWebTokenError'
    );
  });

  it('generates cryptographically secure refresh tokens and deterministic SHA-256 hashes', () => {
    const res1 = security.generateRefreshToken();
    const res2 = security.generateRefreshToken();

    assert.strictEqual(res1.token.length, 64);
    assert.notStrictEqual(res1.token, res2.token);

    const hash1 = security.hashRefreshToken(res1.token);
    const hash2 = security.hashRefreshToken(res1.token);
    assert.strictEqual(hash1, hash2); // Deterministic
    assert.strictEqual(hash1.length, 64); // 32 bytes hex
    assert.strictEqual(res1.hash, hash1);
  });

  it('generates properly prefixed secure IDs for checkout and payments', () => {
    const chk = security.generateCheckoutReference();
    const pay = security.generatePaymentId();

    assert.ok(chk.startsWith('chk_'));
    assert.ok(pay.startsWith('pay_'));
    assert.ok(chk.length > 20);
    assert.ok(pay.length > 20);
  });
});
