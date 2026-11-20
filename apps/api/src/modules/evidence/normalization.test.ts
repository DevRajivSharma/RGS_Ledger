import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EvidenceProvider,
  EvidenceChannel,
  EvidenceStatus,
  TransactionType
} from '@rgs-ledger/shared-types';
import { EvidenceNormalizer } from './evidence-normalizer.js';

describe('Phase 2A — Evidence Normalization Engine', () => {
  const merchantId = 'mer_507f1f77bcf86cd799439011';

  test('normalizes Gmail credit email correctly', () => {
    const raw = {
      merchantId,
      provider: EvidenceProvider.GMAIL,
      providerMessageId: 'gmail_msg_1001',
      senderOrPackage: 'alerts@hdfcbank.net',
      rawText: 'Dear Customer, your account ending in 4567 has been credited with INR 500.00 on 12-Nov-2026. UPI Ref: 631728394012.',
      amountRupees: '500.00',
      utr: '631728394012',
      accountIdentifier: '123456784567',
      transactionTimestamp: '2026-11-12T10:30:00.000Z'
    };

    const normalized = EvidenceNormalizer.normalize(raw);

    assert.equal(normalized.merchantId, merchantId);
    assert.equal(normalized.channel, EvidenceChannel.EMAIL);
    assert.equal(normalized.provider, EvidenceProvider.GMAIL);
    assert.equal(normalized.amountPaise, 50000);
    assert.equal(normalized.currency, 'INR');
    assert.equal(normalized.utr, '631728394012');
    assert.equal(normalized.transactionType, TransactionType.CREDIT);
    assert.equal(normalized.status, EvidenceStatus.NORMALIZED);
    assert.equal(normalized.accountIdentifier, '••••••••4567');
    assert.ok(normalized.transactionTimestamp instanceof Date);
    assert.ok(normalized.rawPayloadHash.length === 64);
    assert.ok(normalized.deduplicationHash.length === 64);
    assert.ok(normalized.encryptedRawPayload?.includes(':'));
  });

  test('normalizes Outlook credit email correctly and maps to EMAIL channel', () => {
    const raw = {
      merchantId,
      provider: EvidenceProvider.OUTLOOK,
      providerMessageId: 'outlook_msg_2002',
      senderOrPackage: 'notify@icicibank.com',
      rawText: 'INR 2,450.50 credited to account XX8890. Ref: 432198765012.',
      amountRupees: '2,450.50',
      utr: '432198765012'
    };

    const normalized = EvidenceNormalizer.normalize(raw);

    assert.equal(normalized.channel, EvidenceChannel.EMAIL);
    assert.equal(normalized.provider, EvidenceProvider.OUTLOOK);
    assert.equal(normalized.amountPaise, 245050);
    assert.equal(normalized.utr, '432198765012');
    assert.equal(normalized.accountIdentifier, null); // Missing optional field strictly null
    assert.equal(normalized.transactionTimestamp, null); // Missing optional timestamp strictly null
  });

  test('normalizes Android Companion push notification and maps to ANDROID channel', () => {
    const raw = {
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'notif_pkg_gpay_3003',
      senderOrPackage: 'com.google.android.apps.nbu.paisa.user',
      rawText: 'Received Rs. 150 from Customer A for Order 101. UPI Ref 998877665544',
      amountPaise: 15000,
      utr: '998877665544'
    };

    const normalized = EvidenceNormalizer.normalize(raw);

    assert.equal(normalized.channel, EvidenceChannel.ANDROID);
    assert.equal(normalized.provider, EvidenceProvider.ANDROID_COMPANION);
    assert.equal(normalized.amountPaise, 15000);
    assert.equal(normalized.utr, '998877665544');
    assert.equal(normalized.status, EvidenceStatus.NORMALIZED);
  });

  test('strictly leaves missing optional fields as null (never invents UTR or account ID)', () => {
    const raw = {
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'notif_no_utr_4004',
      senderOrPackage: 'com.phonepe.app',
      rawText: 'Payment of Rs. 75 received successfully.',
      amountPaise: 7500
      // utr omitted
      // accountIdentifier omitted
      // transactionTimestamp omitted
    };

    const normalized = EvidenceNormalizer.normalize(raw);

    assert.equal(normalized.utr, null);
    assert.equal(normalized.accountIdentifier, null);
    assert.equal(normalized.transactionTimestamp, null);
    assert.equal(normalized.amountPaise, 7500);
  });

  test('rejects debit transactions with REJECTED status and reason DEBIT_TRANSACTION_IGNORED', () => {
    const raw = {
      merchantId,
      provider: EvidenceProvider.GMAIL,
      providerMessageId: 'gmail_debit_5005',
      senderOrPackage: 'alerts@sbi.co.in',
      rawText: 'Dear Customer, your A/c XX1234 has been debited by INR 300.00 on 12-Nov-2026. Info: UPI/345678901234.',
      amountRupees: '300.00',
      utr: '345678901234'
    };

    const normalized = EvidenceNormalizer.normalize(raw);

    assert.equal(normalized.transactionType, TransactionType.DEBIT);
    assert.equal(normalized.status, EvidenceStatus.REJECTED);
    assert.equal(normalized.rejectionReason, 'DEBIT_TRANSACTION_IGNORED');
    assert.equal(normalized.amountPaise, 30000);
  });

  test('converts various rupee formats to integer paise accurately', () => {
    assert.equal(EvidenceNormalizer.parseAmountPaise(undefined, '10.00'), 1000);
    assert.equal(EvidenceNormalizer.parseAmountPaise(undefined, '1,000.50'), 100050);
    assert.equal(EvidenceNormalizer.parseAmountPaise(undefined, 99.99), 9999);
    assert.equal(EvidenceNormalizer.parseAmountPaise(25000, undefined), 25000);

    assert.throws(() => EvidenceNormalizer.parseAmountPaise(undefined, '-50.00'), /Invalid amount/);
    assert.throws(() => EvidenceNormalizer.parseAmountPaise(undefined, 'invalid'), /Invalid amount/);
  });

  test('normalizes UTR and rejects invalid formats without crashing', () => {
    assert.equal(EvidenceNormalizer.normalizeUtr('123456789012'), '123456789012');
    assert.equal(EvidenceNormalizer.normalizeUtr('   987654321098   '), '987654321098');
    assert.equal(EvidenceNormalizer.normalizeUtr('ABC123XYZ789'), 'ABC123XYZ789');
    assert.equal(EvidenceNormalizer.normalizeUtr('short'), null); // Too short
    assert.equal(EvidenceNormalizer.normalizeUtr(''), null);
    assert.equal(EvidenceNormalizer.normalizeUtr(undefined), null);
  });
});
