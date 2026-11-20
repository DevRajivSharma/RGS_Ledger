import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceSecurity } from './evidence-security.js';

describe('Phase 2A — Evidence Security & Encryption', () => {
  const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  test('encrypts and decrypts raw payload successfully with AES-256-GCM', () => {
    const originalText = 'CONFIDENTIAL: Rs 5,000 credited from user@okhdfcbank. Ref 123456789012';

    const encrypted = EvidenceSecurity.encryptPayload(originalText, testKeyHex);
    assert.ok(typeof encrypted === 'string');
    assert.ok(encrypted.includes(':'));

    const parts = encrypted.split(':');
    assert.equal(parts.length, 3); // iv:authTag:ciphertext

    const decrypted = EvidenceSecurity.decryptPayload(encrypted, testKeyHex);
    assert.equal(decrypted, originalText);
  });

  test('fails cleanly when decrypting tampered ciphertext', () => {
    const original = 'Secret payment data';
    const encrypted = EvidenceSecurity.encryptPayload(original, testKeyHex);
    const parts = encrypted.split(':');
    const iv = parts[0]!;
    const tag = parts[1]!;
    const cipher = parts[2]!;

    // Tamper with cipher byte
    const tamperedCipher = cipher.slice(0, -2) + (cipher.slice(-2) === 'aa' ? 'bb' : 'aa');
    const tampered = `${iv}:${tag}:${tamperedCipher}`;

    assert.throws(() => EvidenceSecurity.decryptPayload(tampered, testKeyHex));
  });

  test('masks bank account numbers retaining only last 4 digits', () => {
    assert.equal(EvidenceSecurity.maskAccountNumber('123456789012'), '••••••••9012');
    assert.equal(EvidenceSecurity.maskAccountNumber('9876'), '••••9876');
    assert.equal(EvidenceSecurity.maskAccountNumber('12'), '••••12');
  });

  test('redacts OTPs, passwords, and sensitive information from alert text', () => {
    const rawAlert = 'Your OTP is 482910 for payment. Your A/c 987654321098 is credited with Rs 100.';
    const redacted = EvidenceSecurity.redactSensitiveText(rawAlert);

    assert.ok(!redacted.includes('482910'));
    assert.ok(redacted.includes('[REDACTED]'));
    assert.ok(!redacted.includes('987654321098'));
    assert.ok(redacted.includes('••••1098'));
  });

  test('redacts sensitive keys recursively from metadata objects', () => {
    const metadata = {
      device: 'Pixel 8',
      batteryLevel: 88,
      credentials: {
        authToken: 'secret_bearer_token',
        password: 'super_secret_pw',
        pin: 1234
      },
      headers: {
        authorization: 'Bearer 998877'
      }
    };

    const cleaned = EvidenceSecurity.redactObject(metadata);

    assert.equal(cleaned.device, 'Pixel 8');
    assert.equal(cleaned.batteryLevel, 88);
    assert.equal(cleaned.credentials.authToken, '[REDACTED]');
    assert.equal(cleaned.credentials.password, '[REDACTED]');
    assert.equal(cleaned.credentials.pin, '[REDACTED]');
  });
});
