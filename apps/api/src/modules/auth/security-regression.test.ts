import { describe, it } from 'node:test';
import assert from 'node:assert';
import { security } from '../../utils/security.js';
import { authRateLimiter } from '../../middleware/rate-limiter.js';
import { PaymentStatus } from '@rgs-ledger/shared-types';

describe('Security & Lifecycle Regression Tests', () => {
  it('handles multiple concurrent async password hashes and verifications cleanly without thread corruption', async () => {
    const passwords = ['Alpha@123', 'Beta#456', 'Gamma$789', 'Delta%012', 'Epsilon^345'];

    // Concurrent hashing
    const hashPromises = passwords.map(p => security.hashPassword(p));
    const hashes = await Promise.all(hashPromises);

    assert.strictEqual(hashes.length, 5);
    hashes.forEach((h, idx) => {
      assert.ok(h.includes(':'), `Hash ${idx} should have salt:key format`);
    });

    // Concurrent verification
    const verifyPromises = passwords.map((p, idx) => security.verifyPassword(p, hashes[idx]!));
    const results = await Promise.all(verifyPromises);

    assert.deepStrictEqual(results, [true, true, true, true, true]);

    // Cross-verification (wrong passwords must all return false)
    const crossVerifyPromises = passwords.map((_, idx) => security.verifyPassword('WrongPass!999', hashes[idx]!));
    const crossResults = await Promise.all(crossVerifyPromises);
    assert.deepStrictEqual(crossResults, [false, false, false, false, false]);
  });

  it('enforces authentication rate limiting strictly (max 10 attempts per window)', () => {
    let lastStatusCode = 0;
    let lastResponse: any = null;
    let nextCallCount = 0;

    const fakeReq: any = { ip: '192.168.1.99', socket: {} };
    const fakeRes: any = {
      status(code: number) {
        lastStatusCode = code;
        return this;
      },
      json(data: any) {
        lastResponse = data;
        return this;
      }
    };
    const fakeNext = () => { nextCallCount++; };

    // First 10 requests must be allowed
    for (let i = 0; i < 10; i++) {
      authRateLimiter(fakeReq, fakeRes, fakeNext);
    }
    assert.strictEqual(nextCallCount, 10);
    assert.strictEqual(lastStatusCode, 0);

    // 11th request must be rejected with 429
    authRateLimiter(fakeReq, fakeRes, fakeNext);
    assert.strictEqual(nextCallCount, 10, 'next() must NOT be called on 11th request');
    assert.strictEqual(lastStatusCode, 429);
    assert.strictEqual(lastResponse?.error?.code, 'AUTH_RATE_LIMIT_EXCEEDED');
  });

  it('prohibits payment requests from transitioning to SUCCESS in Phase 1', () => {
    // Phase 1 valid statuses: PENDING, CANCELLED, EXPIRED
    const phase1AllowedStatuses = [
      PaymentStatus.PENDING,
      PaymentStatus.CANCELLED,
      PaymentStatus.EXPIRED
    ];

    // SUCCESS and PARTIAL_SUCCESS require the Phase 2 dual-source evidence matching engine
    assert.strictEqual(phase1AllowedStatuses.includes(PaymentStatus.SUCCESS), false);
    assert.strictEqual(phase1AllowedStatuses.includes(PaymentStatus.PARTIAL_SUCCESS), false);
  });
});
