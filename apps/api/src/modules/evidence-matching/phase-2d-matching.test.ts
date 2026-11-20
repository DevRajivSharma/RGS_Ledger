import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PaymentStatus,
  EvidenceStatus,
  EvidenceChannel,
  EvidenceProvider,
  TransactionType
} from '@rgs-ledger/shared-types';
import {
  EvidenceMatchingService,
  InMemoryMatchingRepository
} from './index.js';

describe('Phase 2D — Dual-Source Evidence Matching Engine Specification', () => {
  const merchantId = 'merch_test_123';
  const merchantB = 'merch_other_456';
  const bankAccountIdUnion = 'ba_union_0562';
  const bankAccountIdHdfc = 'ba_hdfc_9876';

  // Helper to create test payment request
  function createTestPayment(overrides: Partial<any> = {}) {
    return {
      _id: overrides._id || `pay_${Math.random().toString(36).substring(7)}`,
      merchantId: overrides.merchantId || merchantId,
      orderId: overrides.orderId || `ORD-${Date.now()}`,
      amountPaise: overrides.amountPaise ?? 10000, // ₹100.00
      bankAccountId: overrides.bankAccountId !== undefined ? overrides.bankAccountId : bankAccountIdUnion,
      accountSuffix: overrides.accountSuffix || '0562',
      status: overrides.status || PaymentStatus.PENDING,
      evidenceSummary: overrides.evidenceSummary || {
        hasEmailEvidence: false,
        hasAndroidEvidence: false
      },
      expiresAt: overrides.expiresAt || new Date(Date.now() + 15 * 60 * 1000), // +15 mins
      createdAt: overrides.createdAt || new Date(),
      ...overrides
    };
  }

  // Helper to create test evidence
  function createTestEvidence(overrides: Partial<any> = {}) {
    return {
      _id: overrides._id || `ev_${Math.random().toString(36).substring(7)}`,
      merchantId: overrides.merchantId || merchantId,
      channel: overrides.channel || EvidenceChannel.EMAIL,
      provider: overrides.provider || EvidenceProvider.GMAIL,
      amountPaise: overrides.amountPaise ?? 10000,
      utr: overrides.utr || '123456789012',
      accountIdentifier: overrides.accountIdentifier || '0562',
      bankAccountId: overrides.bankAccountId !== undefined ? overrides.bankAccountId : bankAccountIdUnion,
      transactionType: overrides.transactionType || TransactionType.CREDIT,
      status: overrides.status || EvidenceStatus.UNMATCHED,
      transactionTimestamp: overrides.transactionTimestamp || new Date(),
      receivedAt: overrides.receivedAt || new Date(),
      ...overrides
    };
  }

  // Scenario A: Two customers create payment requests for ₹100 and both pay ₹100, with different UTRs.
  test('Scenario A — Two ₹100 payments with different UTRs each match their own payment request', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const pay1 = await repo.savePayment(createTestPayment({ orderId: 'ORD-A1', amountPaise: 10000 }));
    const pay2 = await repo.savePayment(createTestPayment({ orderId: 'ORD-A2', amountPaise: 10000 }));

    // Customer 1 pays -> UTR 111111111111
    const ev1Email = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.EMAIL,
      utr: '111111111111',
      amountPaise: 10000
    }));
    // Customer 2 pays -> UTR 222222222222
    const ev2Email = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.EMAIL,
      utr: '222222222222',
      amountPaise: 10000
    }));

    // Match first emails
    const res1 = await service.matchEvidenceToPayment(merchantId, ev1Email);
    assert.strictEqual(res1.matched, true);
    assert.strictEqual(res1.paymentRequestId, pay1._id);
    assert.strictEqual(res1.newPaymentStatus, PaymentStatus.PARTIAL_SUCCESS);

    const res2 = await service.matchEvidenceToPayment(merchantId, ev2Email);
    assert.strictEqual(res2.matched, true);
    assert.strictEqual(res2.paymentRequestId, pay2._id);
    assert.strictEqual(res2.newPaymentStatus, PaymentStatus.PARTIAL_SUCCESS);

    // Companion push for Customer 1 (UTR 111111111111)
    const ev1Android = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      utr: '111111111111',
      amountPaise: 10000
    }));
    const res1Android = await service.matchEvidenceToPayment(merchantId, ev1Android);
    assert.strictEqual(res1Android.matched, true);
    assert.strictEqual(res1Android.paymentRequestId, pay1._id);
    assert.strictEqual(res1Android.newPaymentStatus, PaymentStatus.SUCCESS);

    // Companion push for Customer 2 (UTR 222222222222)
    const ev2Android = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      utr: '222222222222',
      amountPaise: 10000
    }));
    const res2Android = await service.matchEvidenceToPayment(merchantId, ev2Android);
    assert.strictEqual(res2Android.matched, true);
    assert.strictEqual(res2Android.paymentRequestId, pay2._id);
    assert.strictEqual(res2Android.newPaymentStatus, PaymentStatus.SUCCESS);

    // Verify isolation in store
    const finalPay1 = await repo.findPaymentById(merchantId, pay1._id);
    const finalPay2 = await repo.findPaymentById(merchantId, pay2._id);
    assert.strictEqual(finalPay1.status, PaymentStatus.SUCCESS);
    assert.strictEqual(finalPay1.evidenceSummary.utr, '111111111111');
    assert.strictEqual(finalPay2.status, PaymentStatus.SUCCESS);
    assert.strictEqual(finalPay2.evidenceSummary.utr, '222222222222');
  });

  // Scenario B: One transaction produces one email and one Android notification. Both associate with exactly one payment.
  test('Scenario B — One transaction producing Email and Android notification satisfies exactly one payment', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const payment = await repo.savePayment(createTestPayment({ amountPaise: 25000 }));

    const evEmail = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.EMAIL,
      utr: 'UTR_B_9999999999',
      amountPaise: 25000
    }));
    const evAndroid = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      utr: 'UTR_B_9999999999',
      amountPaise: 25000
    }));

    await service.matchEvidenceToPayment(merchantId, evEmail);
    const matchRes = await service.matchEvidenceToPayment(merchantId, evAndroid);

    assert.strictEqual(matchRes.matched, true);
    assert.strictEqual(matchRes.paymentRequestId, payment._id);
    assert.strictEqual(matchRes.newPaymentStatus, PaymentStatus.SUCCESS);

    const assocs = await repo.findAssocsByPaymentId(merchantId, payment._id);
    assert.strictEqual(assocs.length, 2, 'Exactly 2 associations must exist for the payment');
  });

  // Scenario C: One evidence record must never satisfy two payment requests.
  test('Scenario C — One evidence record cannot satisfy two payment requests', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    await repo.savePayment(createTestPayment({ _id: 'pay_C1', amountPaise: 5000 }));
    await repo.savePayment(createTestPayment({ _id: 'pay_C2', amountPaise: 5000 }));

    const ev = await repo.saveEvidence(createTestEvidence({ amountPaise: 5000, utr: 'UTR_C_11111111' }));

    // First match succeeds
    const res1 = await service.matchEvidenceToPayment(merchantId, ev);
    assert.strictEqual(res1.matched, true);
    assert.strictEqual(res1.paymentRequestId, 'pay_C1');

    // Second match with same evidence record fails
    const res2 = await service.matchEvidenceToPayment(merchantId, ev);
    assert.strictEqual(res2.matched, false);
    assert.match(res2.reason || '', /already associated|not UNMATCHED/i);
  });

  // Scenario D: Two payment requests with same amount and overlapping time must not be arbitrarily matched.
  test('Scenario D — Two payments with same amount do not cross-match when bound to specific UTR', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    await repo.savePayment(createTestPayment({ _id: 'pay_D1', amountPaise: 15000 }));
    await repo.savePayment(createTestPayment({ _id: 'pay_D2', amountPaise: 15000 }));

    // Pay1 gets Email with UTR_D1
    const ev1Email = await repo.saveEvidence(createTestEvidence({ utr: 'UTR_D1', amountPaise: 15000 }));
    await service.matchEvidenceToPayment(merchantId, ev1Email);

    // Pay2 gets Email with UTR_D2
    const ev2Email = await repo.saveEvidence(createTestEvidence({ utr: 'UTR_D2', amountPaise: 15000 }));
    await service.matchEvidenceToPayment(merchantId, ev2Email);

    // Now Android notification arrives with UTR_D2 -> Must match Pay2, NEVER Pay1!
    const ev2Android = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      utr: 'UTR_D2',
      amountPaise: 15000
    }));
    const res = await service.matchEvidenceToPayment(merchantId, ev2Android);

    assert.strictEqual(res.matched, true);
    assert.strictEqual(res.paymentRequestId, 'pay_D2', 'Must match payment D2 with matching UTR');
    assert.strictEqual(res.newPaymentStatus, PaymentStatus.SUCCESS);

    const reloadedPay1 = await repo.findPaymentById(merchantId, 'pay_D1');
    assert.strictEqual(reloadedPay1.status, PaymentStatus.PARTIAL_SUCCESS, 'Pay1 must remain PARTIAL_SUCCESS');
  });

  // Scenario E: Duplicate email or Android alerts must not create additional evidence associations.
  test('Scenario E — Duplicate email alert on same channel does not create duplicate association or advance status', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const payment = await repo.savePayment(createTestPayment({ amountPaise: 20000 }));

    const evEmail1 = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.EMAIL,
      utr: 'UTR_E_12345678',
      amountPaise: 20000
    }));
    await service.matchEvidenceToPayment(merchantId, evEmail1);

    // Second email arrives with same UTR
    const evEmail2 = await repo.saveEvidence(createTestEvidence({
      _id: 'ev_email_2',
      channel: EvidenceChannel.EMAIL,
      utr: 'UTR_E_12345678',
      amountPaise: 20000
    }));
    const res2 = await service.matchEvidenceToPayment(merchantId, evEmail2);

    assert.strictEqual(res2.matched, false);
    assert.match(res2.reason || '', /already has an associated evidence for channel EMAIL/i);

    const assocs = await repo.findAssocsByPaymentId(merchantId, payment._id);
    assert.strictEqual(assocs.length, 1, 'Must still only have 1 association');

    const reloadedPayment = await repo.findPaymentById(merchantId, payment._id);
    assert.strictEqual(reloadedPayment.status, PaymentStatus.PARTIAL_SUCCESS);
  });

  // Scenario F: Same UTR but different amounts must result in REVIEW_REQUIRED.
  test('Scenario F — Same UTR with contradictory amounts triggers REVIEW_REQUIRED and ReconciliationCase', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const payment = await repo.savePayment(createTestPayment({
      amountPaise: 10000, // Expected ₹100
      evidenceSummary: { hasEmailEvidence: true, hasAndroidEvidence: false, utr: 'UTR_F_CONFLICT' }
    }));

    // Associate email
    await repo.createAssociation({
      merchantId,
      paymentRequestId: payment._id,
      evidenceId: 'ev_f1',
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      matchedUtr: 'UTR_F_CONFLICT',
      matchedAmountPaise: 10000
    });

    // Android arrives with same UTR but ₹50 (5000 paise)
    const evConflicting = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      utr: 'UTR_F_CONFLICT',
      amountPaise: 5000
    }));

    const res = await service.matchEvidenceToPayment(merchantId, evConflicting);
    assert.strictEqual(res.matched, false);
    assert.strictEqual(res.newPaymentStatus, PaymentStatus.REVIEW_REQUIRED);

    const reloadedPayment = await repo.findPaymentById(merchantId, payment._id);
    assert.strictEqual(reloadedPayment.status, PaymentStatus.REVIEW_REQUIRED);
    assert.strictEqual(reloadedPayment.reviewReason, 'AMOUNT_MISMATCH_FOR_SAME_UTR');

    assert.strictEqual(repo.reconciliationCases.length >= 1, true);
    assert.strictEqual(repo.reconciliationCases[0].reason, 'AMOUNT_MISMATCH');
  });

  // Scenario G: Same UTR appearing in EMAIL and ANDROID preserves both independent evidence records.
  test('Scenario G — Same UTR in EMAIL and ANDROID preserves both independent evidence records', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const payment = await repo.savePayment(createTestPayment({ amountPaise: 30000 }));

    const evEmail = await repo.saveEvidence(createTestEvidence({
      _id: 'ev_g_email',
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      utr: 'UTR_G_PRESERVE',
      amountPaise: 30000
    }));

    const evAndroid = await repo.saveEvidence(createTestEvidence({
      _id: 'ev_g_android',
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      utr: 'UTR_G_PRESERVE',
      amountPaise: 30000
    }));

    await service.matchEvidenceToPayment(merchantId, evEmail);
    await service.matchEvidenceToPayment(merchantId, evAndroid);

    // Check store
    const storedEmail = await repo.findEvidenceById(merchantId, 'ev_g_email');
    const storedAndroid = await repo.findEvidenceById(merchantId, 'ev_g_android');

    assert.ok(storedEmail, 'Email record must be preserved');
    assert.ok(storedAndroid, 'Android record must be preserved');
    assert.strictEqual(storedEmail.status, EvidenceStatus.MATCHED);
    assert.strictEqual(storedAndroid.status, EvidenceStatus.MATCHED);
    assert.strictEqual(storedEmail.matchedPaymentRequestId, payment._id);
    assert.strictEqual(storedAndroid.matchedPaymentRequestId, payment._id);
  });

  // Scenario H: If one channel is delayed, keep payment partial until second valid source arrives.
  test('Scenario H — Delayed channel keeps payment PARTIAL_SUCCESS until second source arrives', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const payment = await repo.savePayment(createTestPayment({ amountPaise: 7500 }));

    // Source 1 (Android) arrives first at T0
    const evAndroid = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      utr: 'UTR_H_DELAYED',
      amountPaise: 7500
    }));
    const res1 = await service.matchEvidenceToPayment(merchantId, evAndroid);
    assert.strictEqual(res1.newPaymentStatus, PaymentStatus.PARTIAL_SUCCESS);

    // Verify it stays partial
    let currentPayment = await repo.findPaymentById(merchantId, payment._id);
    assert.strictEqual(currentPayment.status, PaymentStatus.PARTIAL_SUCCESS);

    // Source 2 (Email) arrives later at T+10m
    const evEmail = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      utr: 'UTR_H_DELAYED',
      amountPaise: 7500
    }));
    const res2 = await service.matchEvidenceToPayment(merchantId, evEmail);
    assert.strictEqual(res2.newPaymentStatus, PaymentStatus.SUCCESS);

    currentPayment = await repo.findPaymentById(merchantId, payment._id);
    assert.strictEqual(currentPayment.status, PaymentStatus.SUCCESS);
  });

  // Scenario I: Evidence arriving after expiry follows reconciliation rules.
  test('Scenario I — Late evidence arriving for expired payment transitions to RECONCILIATION_REQUIRED', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    // Payment that expired 10 minutes ago
    const expiredPayment = await repo.savePayment(createTestPayment({
      amountPaise: 12000,
      status: PaymentStatus.EXPIRED,
      expiresAt: new Date(Date.now() - 10 * 60 * 1000)
    }));

    const evLate = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.EMAIL,
      utr: 'UTR_I_LATE',
      amountPaise: 12000
    }));

    const res = await service.matchEvidenceToPayment(merchantId, evLate);
    assert.strictEqual(res.matched, true);
    assert.strictEqual(res.newPaymentStatus, PaymentStatus.RECONCILIATION_REQUIRED);
    assert.strictEqual(res.reason, 'LATE_EVIDENCE_RECEIVED');

    const reloaded = await repo.findPaymentById(merchantId, expiredPayment._id);
    assert.strictEqual(reloaded.status, PaymentStatus.RECONCILIATION_REQUIRED);

    // Reconciliation case created
    const reconCase = repo.reconciliationCases.find((c) => c.paymentRequestId === expiredPayment._id);
    assert.ok(reconCase, 'Reconciliation case must be created for late evidence');
    assert.strictEqual(reconCase.reason, 'LATE_EVIDENCE');
  });

  // Scenario J: Concurrent ingestion safety.
  test('Scenario J — Concurrent ingestion of EMAIL and ANDROID safely produces SUCCESS and 2 associations', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const payment = await repo.savePayment(createTestPayment({ amountPaise: 40000 }));

    const evEmail = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.EMAIL,
      utr: 'UTR_J_CONCURRENT',
      amountPaise: 40000
    }));
    const evAndroid = await repo.saveEvidence(createTestEvidence({
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      utr: 'UTR_J_CONCURRENT',
      amountPaise: 40000
    }));

    // Concurrently trigger matching
    const [resEmail, resAndroid] = await Promise.all([
      service.matchEvidenceToPayment(merchantId, evEmail),
      service.matchEvidenceToPayment(merchantId, evAndroid)
    ]);

    assert.strictEqual(resEmail.matched, true);
    assert.strictEqual(resAndroid.matched, true);

    const reloaded = await repo.findPaymentById(merchantId, payment._id);
    assert.strictEqual(reloaded.status, PaymentStatus.SUCCESS);

    const assocs = await repo.findAssocsByPaymentId(merchantId, payment._id);
    assert.strictEqual(assocs.length, 2);
  });

  // Constraint: Missing or ambiguous UTR cannot be auto-matched
  test('Constraint — Missing UTR is rejected with MISSING_UTR_REFERENCE and cannot auto-match', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    await repo.savePayment(createTestPayment({ amountPaise: 10000 }));

    const evNoUtr = await repo.saveEvidence(createTestEvidence({
      utr: null,
      amountPaise: 10000
    }));

    const res = await service.matchEvidenceToPayment(merchantId, evNoUtr);
    assert.strictEqual(res.matched, false);
    assert.match(res.reason || '', /missing or ambiguous/i);

    const reloadedEv = await repo.findEvidenceById(merchantId, evNoUtr._id);
    assert.strictEqual(reloadedEv.status, EvidenceStatus.REVIEW_REQUIRED);
    assert.strictEqual(reloadedEv.rejectionReason, 'MISSING_UTR_REFERENCE');
  });

  // Constraint: Conflicting bank account identifiers do not match
  test('Constraint — Conflicting bank accounts prevent match even with identical amount', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    // Payment is on Union Bank (0562)
    const unionPayment = await repo.savePayment(createTestPayment({
      bankAccountId: bankAccountIdUnion,
      accountSuffix: '0562',
      amountPaise: 50000
    }));

    // Evidence arrives for HDFC Bank (9876)
    const hdfcEvidence = await repo.saveEvidence(createTestEvidence({
      bankAccountId: bankAccountIdHdfc,
      accountIdentifier: '9876',
      amountPaise: 50000,
      utr: 'UTR_ACC_MISMATCH'
    }));

    const res = await service.matchEvidenceToPayment(merchantId, hdfcEvidence);
    assert.strictEqual(res.matched, false);

    const reloadedPayment = await repo.findPaymentById(merchantId, unionPayment._id);
    assert.strictEqual(reloadedPayment.status, PaymentStatus.PENDING);
  });

  // Constraint: Cancelled payment never becomes SUCCESS automatically
  test('Constraint — Cancelled payment is never promoted to SUCCESS automatically', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const cancelledPayment = await repo.savePayment(createTestPayment({
      status: PaymentStatus.CANCELLED,
      amountPaise: 18000
    }));

    const ev = await repo.saveEvidence(createTestEvidence({
      utr: 'UTR_CANCELLED_TEST',
      amountPaise: 18000
    }));

    const res = await service.matchEvidenceToPayment(merchantId, ev);
    assert.strictEqual(res.matched, false);

    const reloaded = await repo.findPaymentById(merchantId, cancelledPayment._id);
    assert.strictEqual(reloaded.status, PaymentStatus.CANCELLED);
  });

  // Tenant Isolation: Merchant B cannot access Merchant A's payment or evidence
  test('Tenant Isolation — Merchant B cannot associate or match Merchant A evidence', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    // Payment belongs to Merchant A
    await repo.savePayment(createTestPayment({
      merchantId: merchantId,
      amountPaise: 10000
    }));

    // Evidence belongs to Merchant B
    const evMerchantB = await repo.saveEvidence(createTestEvidence({
      merchantId: merchantB,
      amountPaise: 10000,
      utr: 'UTR_MERCH_B'
    }));

    // Merchant A attempts to match Merchant B's evidence -> Denied
    const resA = await service.matchEvidenceToPayment(merchantId, evMerchantB);
    assert.strictEqual(resA.matched, false);

    // Merchant B attempts to match against Merchant B's payments -> None exist
    const resB = await service.matchEvidenceToPayment(merchantB, evMerchantB);
    assert.strictEqual(resB.matched, false);
    assert.match(resB.reason || '', /No pending/i);
  });

  // Manual Review Interface: Dual-source requirement strictly enforced
  test('Manual Review — Attempting to promote single source to SUCCESS throws error', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const payment = await repo.savePayment(createTestPayment({
      status: PaymentStatus.REVIEW_REQUIRED,
      amountPaise: 10000
    }));

    // Only EMAIL association exists
    await repo.createAssociation({
      merchantId,
      paymentRequestId: payment._id,
      evidenceId: 'ev_email_only',
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      matchedUtr: 'UTR_SINGLE_SOURCE',
      matchedAmountPaise: 10000
    });

    // Attempting manual resolve to SUCCESS must be rejected
    await assert.rejects(
      async () => service.manualReviewResolve(merchantId, payment._id, 'RESOLVE', 'Attempting bypass'),
      /CANNOT_PROMOTE_SINGLE_SOURCE_TO_SUCCESS/
    );

    const reloaded = await repo.findPaymentById(merchantId, payment._id);
    assert.strictEqual(reloaded.status, PaymentStatus.REVIEW_REQUIRED);
  });

  test('Manual Review — Successfully resolves to SUCCESS when BOTH Email and Android sources are verified', async () => {
    const repo = new InMemoryMatchingRepository();
    const service = new EvidenceMatchingService(repo);

    const payment = await repo.savePayment(createTestPayment({
      status: PaymentStatus.REVIEW_REQUIRED,
      amountPaise: 10000
    }));

    // Both EMAIL and ANDROID associations exist
    await repo.createAssociation({
      merchantId,
      paymentRequestId: payment._id,
      evidenceId: 'ev_email',
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      matchedUtr: 'UTR_DUAL_RESOLVE',
      matchedAmountPaise: 10000
    });
    await repo.createAssociation({
      merchantId,
      paymentRequestId: payment._id,
      evidenceId: 'ev_android',
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      matchedUtr: 'UTR_DUAL_RESOLVE',
      matchedAmountPaise: 10000
    });

    const result = await service.manualReviewResolve(
      merchantId,
      payment._id,
      'RESOLVE',
      'Merchant admin verified dual-source bank alerts'
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, PaymentStatus.SUCCESS);

    const reloaded = await repo.findPaymentById(merchantId, payment._id);
    assert.strictEqual(reloaded.status, PaymentStatus.SUCCESS);
  });
});
