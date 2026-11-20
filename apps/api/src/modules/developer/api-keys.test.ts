import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { CreateApiKeySchema } from '@rgs-ledger/validation';

describe('Phase 3A: Developer API Keys & Credentials', () => {
  it('validates API key creation schema for Production and Sandbox', () => {
    const prodInput = {
      name: 'Primary Backend Node',
      environment: 'PRODUCTION',
      scopes: ['payments:read', 'payments:write', 'links:read']
    };
    const prodParsed = CreateApiKeySchema.parse(prodInput);
    assert.equal(prodParsed.name, 'Primary Backend Node');
    assert.equal(prodParsed.environment, 'PRODUCTION');
    assert.equal(prodParsed.scopes?.length, 3);

    const testInput = {
      name: 'Staging CI Runner',
      environment: 'SANDBOX',
      scopes: ['*']
    };
    const testParsed = CreateApiKeySchema.parse(testInput);
    assert.equal(testParsed.environment, 'SANDBOX');
    assert.deepEqual(testParsed.scopes, ['*']);
  });

  it('generates properly formatted Key IDs and Secrets', () => {
    const isProd = true;
    const prefix = isProd ? 'rgs_live_' : 'rgs_test_';
    const secPrefix = isProd ? 'rgs_sec_live_' : 'rgs_sec_test_';

    const keyId = `${prefix}${crypto.randomBytes(12).toString('hex')}`;
    const rawSecret = `${secPrefix}${crypto.randomBytes(24).toString('hex')}`;

    assert.ok(keyId.startsWith('rgs_live_'));
    assert.ok(rawSecret.startsWith('rgs_sec_live_'));
    assert.ok(keyId.length >= 24);
    assert.ok(rawSecret.length >= 48);
  });

  it('securely hashes raw secrets with SHA-256 and verifies via timingSafeEqual', () => {
    const rawSecret = `rgs_sec_live_${crypto.randomBytes(24).toString('hex')}`;

    // Compute hash to store in DB
    const storedHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    // Verification check upon incoming request
    const incomingSecret = rawSecret;
    const computedHash = crypto.createHash('sha256').update(incomingSecret).digest('hex');

    const bufA = Buffer.from(storedHash, 'hex');
    const bufB = Buffer.from(computedHash, 'hex');

    assert.equal(bufA.length, bufB.length);
    assert.ok(crypto.timingSafeEqual(bufA, bufB), 'Timing-safe comparison must succeed for matching secrets');

    // Verification fails for mismatched or altered secret
    const tamperedSecret = rawSecret + 'x';
    const tamperedHash = crypto.createHash('sha256').update(tamperedSecret).digest('hex');
    const bufTampered = Buffer.from(tamperedHash, 'hex');
    assert.ok(!crypto.timingSafeEqual(bufA, bufTampered), 'Timing-safe comparison must fail for altered secret');
  });

  it('granular scope enforcement allows wildcard (*) or matching permissions', () => {
    function hasScope(grantedScopes: string[], requiredScope: string): boolean {
      if (grantedScopes.includes('*')) return true;
      if (grantedScopes.includes(requiredScope)) return true;

      const [resource] = requiredScope.split(':');
      if (grantedScopes.includes(`${resource}:*`)) return true;

      return false;
    }

    assert.ok(hasScope(['*'], 'payments:write'));
    assert.ok(hasScope(['payments:read', 'payments:write'], 'payments:read'));
    assert.ok(hasScope(['payments:*'], 'payments:read'));
    assert.ok(!hasScope(['payments:read'], 'payments:write'));
    assert.ok(!hasScope(['links:read'], 'webhooks:write'));
  });
});
