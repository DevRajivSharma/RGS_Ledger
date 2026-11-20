import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PaymentStatus,
  EvidenceStatus,
  EvidenceChannel,
  EvidenceProvider,
  ReconciliationCaseType,
  ReconciliationCaseSeverity,
  ReconciliationCaseStatus,
  WebhookEventType
} from '@rgs-ledger/shared-types';
import {
  ReconciliationService,
  InMemoryReconciliationRepository
} from './reconciliation.service.js';

describe('Phase 2E — Reconciliation & Exception Management Engine Specification', () => {
  const merchantA = 'merch_recon_alpha_123';
  const merchantB = 'merch_recon_beta_456';
  const bankAccountIdUnion = 'ba_union_0562';

  // Helper to create test payment request
  function createTestPayment(overrides: Partial<any> = {}) {
    return {
      _id: overrides._id || `pay_${Math.random().toString(36).substring(7)}`,
      merchantId: overrides.merchantId || merchantA,
      orderId: overrides.orderId || `ORD-${Date.now()}`,
      checkoutReference: overrides.checkoutReference || `chk_${Math.random().toString(36).substring(7)}`,
      amountPaise: overrides.amountPaise ?? 50000, // ₹500.00
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
      merchantId: overrides.merchantId || merchantA,
      channel: overrides.channel || EvidenceChannel.EMAIL,
      provider: overrides.provider || EvidenceProvider.GMAIL,
      amountPaise: overrides.amountPaise ?? 50000,
      utr: overrides.utr || '123456789012',
      accountIdentifier: overrides.accountIdentifier || '0562',
      bankAccountId: overrides.bankAccountId !== undefined ? overrides.bankAccountId : bankAccountIdUnion,
      status: overrides.status || EvidenceStatus.UNMATCHED,
      transactionTimestamp: overrides.transactionTimestamp || new Date(),
      receivedAt: overrides.receivedAt || new Date(),
      ...overrides
    };
  }

  function setupService() {
    const repo = new InMemoryReconciliationRepository();
    const mockWebhookService = {
      dispatchEvent: async (merchantId: string, eventType: string, payload: any) => {
        repo.outbox.push({ merchantId, eventType, payload });
        return { eventId: `evt_${Date.now()}`, endpointsNotified: 1 };
      }
    };
    const service = new ReconciliationService(repo, mockWebhookService as any);
    return { repo, service };
  }

  // 1. Idempotent Case Creation & Duplicate Prevention
  test('1. Idempotent case creation & duplicate case prevention', async () => {
    const { repo, service } = setupService();

    const payment = await repo.savePayment(createTestPayment({ orderId: 'ORD-IDEMPOTENT-1' }));
    const ev1 = await repo.saveEvidence(createTestEvidence({ utr: 'UTR999999' }));

    // Create first case
    const case1 = await service.createOrUpdateCase({
      merchantId: merchantA,
      paymentRequestId: payment._id,
      evidenceIds: [ev1._id],
      caseType: ReconciliationCaseType.LATE_EVIDENCE,
      reason: 'Late payment credit evidence ingested after 15m window',
      expectedAmountPaise: payment.amountPaise,
      receivedAmountPaise: ev1.amountPaise,
      utr: ev1.utr
    });

    assert.ok(case1);
    assert.strictEqual(case1.status, ReconciliationCaseStatus.OPEN);
    assert.strictEqual(case1.severity, ReconciliationCaseSeverity.MEDIUM);
    assert.strictEqual(case1.evidenceIds.length, 1);
    assert.strictEqual(case1.history.length, 1);
    assert.strictEqual(case1.history[0]?.action, 'CASE_CREATED');

    // Attempt to create second case with same paymentRequestId and caseType
    const ev2 = await repo.saveEvidence(createTestEvidence({ utr: 'UTR999999' }));
    const case2 = await service.createOrUpdateCase({
      merchantId: merchantA,
      paymentRequestId: payment._id,
      evidenceIds: [ev2._id],
      caseType: ReconciliationCaseType.LATE_EVIDENCE,
      reason: 'Second late alert detected',
      expectedAmountPaise: payment.amountPaise,
      receivedAmountPaise: ev2.amountPaise,
      utr: ev2.utr
    });

    // Must return the SAME case document, appending evidence reference and adding audit entry
    assert.strictEqual(case2.id, case1.id);
    assert.strictEqual(case2.evidenceIds.length, 2);
    assert.ok(case2.evidenceIds.includes(ev2._id));
    assert.strictEqual(case2.history.length, 2);
    assert.strictEqual(case2.history[1]?.action, 'ADDITIONAL_EVIDENCE_ATTACHED');

    // Verify repository only has 1 case document
    const listRes = await service.listCases(merchantA, {});
    assert.strictEqual(listRes.total, 1);
  });

  // 2. Automatic Severity Assignment
  test('2. Automatic severity calculation across exception types', async () => {
    const { service } = setupService();

    const cases = [
      { type: ReconciliationCaseType.DUPLICATE_UTR, expectedSeverity: ReconciliationCaseSeverity.CRITICAL },
      { type: ReconciliationCaseType.AMOUNT_MISMATCH, expectedSeverity: ReconciliationCaseSeverity.HIGH },
      { type: ReconciliationCaseType.CANCELLED_PAYMENT_EVIDENCE, expectedSeverity: ReconciliationCaseSeverity.HIGH },
      { type: ReconciliationCaseType.MISSING_UTR, expectedSeverity: ReconciliationCaseSeverity.MEDIUM },
      { type: ReconciliationCaseType.LATE_EVIDENCE, expectedSeverity: ReconciliationCaseSeverity.MEDIUM },
      { type: ReconciliationCaseType.MISSING_SECOND_SOURCE, expectedSeverity: ReconciliationCaseSeverity.LOW },
      { type: ReconciliationCaseType.MANUAL_FLAG, expectedSeverity: ReconciliationCaseSeverity.MEDIUM }
    ];

    for (const item of cases) {
      const c = await service.createOrUpdateCase({
        merchantId: merchantA,
        caseType: item.type,
        reason: `Testing severity for ${item.type}`
      });
      assert.strictEqual(c.severity, item.expectedSeverity, `Severity for ${item.type} should be ${item.expectedSeverity}`);
    }
  });

  // 3. Status Transitions and Immutable Audit History
  test('3. Status transitions (OPEN -> INVESTIGATING -> RESOLVED / DISMISSED) with full audit history', async () => {
    const { service } = setupService();

    const c = await service.createOrUpdateCase({
      merchantId: merchantA,
      caseType: ReconciliationCaseType.AMOUNT_MISMATCH,
      reason: 'Expected 50000 paise, received 40000 paise'
    });

    assert.strictEqual(c.status, ReconciliationCaseStatus.OPEN);

    // Transition to INVESTIGATING
    const cInvestigating = await service.updateCaseStatus(
      merchantA,
      c.id,
      ReconciliationCaseStatus.INVESTIGATING,
      'Merchant agent checking bank statement',
      'user_analyst_1'
    );
    assert.strictEqual(cInvestigating.status, ReconciliationCaseStatus.INVESTIGATING);
    assert.strictEqual(cInvestigating.history.length, 2);
    assert.strictEqual(cInvestigating.history[1]?.action, 'STATUS_UPDATED');
    assert.strictEqual(cInvestigating.history[1]?.previousStatus, ReconciliationCaseStatus.OPEN);
    assert.strictEqual(cInvestigating.history[1]?.newStatus, ReconciliationCaseStatus.INVESTIGATING);

    // Add notes during investigation
    const cWithNotes = await service.addCaseNotes(
      merchantA,
      c.id,
      'Contacted payer to request proof of deduction',
      'user_analyst_1'
    );
    assert.strictEqual(cWithNotes.history.length, 3);
    assert.strictEqual(cWithNotes.history[2]?.action, 'NOTE_ADDED');
    assert.strictEqual(cWithNotes.history[2]?.notes, 'Contacted payer to request proof of deduction');

    // Dismiss case
    const cDismissed = await service.updateCaseStatus(
      merchantA,
      c.id,
      ReconciliationCaseStatus.DISMISSED,
      'Payer confirmed incorrect QR was scanned',
      'user_manager_1'
    );
    assert.strictEqual(cDismissed.status, ReconciliationCaseStatus.DISMISSED);
    assert.strictEqual(cDismissed.history.length, 4);
    assert.strictEqual(cDismissed.history[3]?.newStatus, ReconciliationCaseStatus.DISMISSED);
  });

  // 4. Invariant: Single Source CANNOT be Promoted to SUCCESS
  test('4. Invariant: Manual resolution with CONFIRM_PAYMENT on single source throws CANNOT_PROMOTE_SINGLE_SOURCE_TO_SUCCESS', async () => {
    const { repo, service } = setupService();

    // Create a payment that ONLY has EMAIL evidence
    const payment = await repo.savePayment(createTestPayment({
      status: PaymentStatus.PARTIAL_SUCCESS,
      evidenceSummary: {
        hasEmailEvidence: true,
        hasAndroidEvidence: false, // MISSING ANDROID
        emailEvidenceId: 'ev_email_1',
        utr: 'UTR112233'
      }
    }));

    const c = await service.createOrUpdateCase({
      merchantId: merchantA,
      paymentRequestId: payment._id,
      caseType: ReconciliationCaseType.MISSING_SECOND_SOURCE,
      reason: 'Partial payment missing Android evidence after expiry'
    });

    // Attempting to resolve with CONFIRM_PAYMENT MUST throw invariant violation
    await assert.rejects(
      async () => {
        await service.resolveCase({
          merchantId: merchantA,
          caseId: c.id,
          action: 'CONFIRM_PAYMENT',
          notes: 'Customer insists they paid and provided SMS screenshot',
          userId: 'user_support_1'
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('CANNOT_PROMOTE_SINGLE_SOURCE_TO_SUCCESS'));
        return true;
      }
    );

    // Verify payment status remains strictly PARTIAL_SUCCESS and was NOT promoted
    const payCheck = await repo.getPaymentById(payment._id);
    assert.strictEqual(payCheck.status, PaymentStatus.PARTIAL_SUCCESS);

    // Verify case remains OPEN
    const caseCheck = await repo.getCaseById(c.id);
    assert.strictEqual(caseCheck.status, ReconciliationCaseStatus.OPEN);
  });

  // 5. Dual-Source Valid Resolution with CONFIRM_PAYMENT Succeeds
  test('5. Dual-source valid resolution with CONFIRM_PAYMENT transitions payment to SUCCESS', async () => {
    const { repo, service } = setupService();

    // Create a payment that HAS BOTH Email and Android evidence, but was flagged under review for late arrival
    const payment = await repo.savePayment(createTestPayment({
      status: PaymentStatus.RECONCILIATION_REQUIRED,
      evidenceSummary: {
        hasEmailEvidence: true,
        hasAndroidEvidence: true, // BOTH PRESENT
        emailEvidenceId: 'ev_email_1',
        androidEvidenceId: 'ev_android_1',
        utr: 'UTR887766'
      }
    }));

    const c = await service.createOrUpdateCase({
      merchantId: merchantA,
      paymentRequestId: payment._id,
      caseType: ReconciliationCaseType.LATE_EVIDENCE,
      reason: 'Both evidence sources arrived after payment expired',
      hasEmailEvidence: true,
      hasAndroidEvidence: true,
      utr: 'UTR887766'
    });

    const resolved = await service.resolveCase({
      merchantId: merchantA,
      caseId: c.id,
      action: 'CONFIRM_PAYMENT',
      notes: 'Reviewed both verified evidence records. Reconciled payment.',
      userId: 'user_manager_1'
    });

    assert.strictEqual(resolved.status, ReconciliationCaseStatus.RESOLVED);
    assert.strictEqual(resolved.resolvedByUserId, 'user_manager_1');

    // Payment MUST now be SUCCESS
    const payCheck = await repo.getPaymentById(payment._id);
    assert.strictEqual(payCheck.status, PaymentStatus.SUCCESS);
  });

  // 6. Non-Success Resolution Actions (FLAG_FRAUD, REFUND_RECOMMENDED)
  test('6. Resolution actions FLAG_FRAUD and REFUND_RECOMMENDED handle fraud/exceptions safely', async () => {
    const { repo, service } = setupService();

    const payment = await repo.savePayment(createTestPayment({
      status: PaymentStatus.PENDING
    }));
    const ev = await repo.saveEvidence(createTestEvidence({
      status: EvidenceStatus.UNMATCHED
    }));

    const c = await service.createOrUpdateCase({
      merchantId: merchantA,
      paymentRequestId: payment._id,
      evidenceIds: [ev._id],
      caseType: ReconciliationCaseType.DUPLICATE_UTR,
      reason: 'UTR reuse detected from different payer'
    });

    // Execute FLAG_FRAUD
    const resolved = await service.resolveCase({
      merchantId: merchantA,
      caseId: c.id,
      action: 'FLAG_FRAUD',
      notes: 'Suspected fraudulent UTR collision',
      userId: 'fraud_investigator'
    });

    assert.strictEqual(resolved.status, ReconciliationCaseStatus.RESOLVED);

    // Payment marked REVIEW_REQUIRED and evidence marked CONFLICTING
    const payCheck = await repo.getPaymentById(payment._id);
    assert.strictEqual(payCheck.status, PaymentStatus.REVIEW_REQUIRED);

    const evCheck = await repo.getEvidenceById(ev._id);
    assert.strictEqual(evCheck.status, EvidenceStatus.REVIEW_REQUIRED);
  });

  // 7. Auto-Reconciliation Process
  test('7. autoReconcile detects expired partial payments and auto-resolves when counterpart arrives', async () => {
    const { repo, service } = setupService();

    // A: Expired payment with single source
    const expiredPayment = await repo.savePayment(createTestPayment({
      orderId: 'ORD-EXPIRED-PARTIAL',
      status: PaymentStatus.PARTIAL_SUCCESS,
      expiresAt: new Date(Date.now() - 1000 * 60 * 5), // Expired 5 mins ago
      evidenceSummary: {
        hasEmailEvidence: true,
        hasAndroidEvidence: false,
        utr: 'UTR_PARTIAL_99'
      }
    }));

    // Run autoReconcile
    const run1 = await service.autoReconcile(merchantA);
    assert.strictEqual(run1.newCasesCreated, 1);

    // Verify a MISSING_SECOND_SOURCE case was created
    const cases = await service.listCases(merchantA, { paymentRequestId: expiredPayment._id });
    assert.strictEqual(cases.total, 1);
    assert.strictEqual(cases.cases[0]?.caseType, ReconciliationCaseType.MISSING_SECOND_SOURCE);
    const caseId = cases.cases[0]?.id;

    // Running autoReconcile again does not create a duplicate case
    const run2 = await service.autoReconcile(merchantA);
    assert.strictEqual(run2.newCasesCreated, 0);

    // B: Counterpart arrives and payment transitions to SUCCESS
    expiredPayment.status = PaymentStatus.SUCCESS;
    expiredPayment.evidenceSummary.hasAndroidEvidence = true;
    await repo.savePayment(expiredPayment);

    // Run autoReconcile now -> should auto-resolve the open case
    const run3 = await service.autoReconcile(merchantA);
    assert.strictEqual(run3.autoResolvedCases, 1);

    const caseCheck = await repo.getCaseById(caseId!);
    assert.strictEqual(caseCheck.status, ReconciliationCaseStatus.RESOLVED);
    assert.ok(caseCheck.resolutionNotes?.includes('Auto-reconciled'));
  });

  // 8. Tenant Isolation
  test('8. Strict tenant isolation: Merchant B cannot access or resolve Merchant A cases', async () => {
    const { service } = setupService();

    const caseA = await service.createOrUpdateCase({
      merchantId: merchantA,
      caseType: ReconciliationCaseType.LATE_EVIDENCE,
      reason: 'Late evidence for Merchant A'
    });

    // Merchant B listing cases sees 0 cases
    const listB = await service.listCases(merchantB, {});
    assert.strictEqual(listB.total, 0);

    // Merchant B fetching Case A returns null
    const getB = await service.getCaseById(merchantB, caseA.id);
    assert.strictEqual(getB, null);

    // Merchant B attempting to update status throws not found
    await assert.rejects(
      async () => {
        await service.updateCaseStatus(merchantB, caseA.id, ReconciliationCaseStatus.INVESTIGATING);
      },
      (err: any) => {
        assert.ok(err.message.includes('not found'));
        return true;
      }
    );

    // Merchant B attempting to resolve throws not found
    await assert.rejects(
      async () => {
        await service.resolveCase({
          merchantId: merchantB,
          caseId: caseA.id,
          action: 'DISMISS',
          notes: 'Unauthorized resolution attempt'
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('not found'));
        return true;
      }
    );
  });

  // 9. Webhook Outbox Events Emission
  test('9. Webhook outbox events emitted: case_created, case_updated, case_resolved', async () => {
    const { repo, service } = setupService();

    const c = await service.createOrUpdateCase({
      merchantId: merchantA,
      caseType: ReconciliationCaseType.AMOUNT_MISMATCH,
      reason: 'Amount discrepancy detected'
    });

    // Check outbox for case_created
    assert.strictEqual(repo.outbox.length, 1);
    assert.strictEqual(repo.outbox[0]?.eventType, WebhookEventType.RECONCILIATION_CASE_CREATED);
    assert.strictEqual(repo.outbox[0]?.payload?.caseId, c.id);

    // Update status to INVESTIGATING
    await service.updateCaseStatus(merchantA, c.id, ReconciliationCaseStatus.INVESTIGATING, 'Starting review');
    assert.strictEqual(repo.outbox.length, 2);
    assert.strictEqual(repo.outbox[1]?.eventType, WebhookEventType.RECONCILIATION_CASE_UPDATED);
    assert.strictEqual(repo.outbox[1]?.payload?.newStatus, ReconciliationCaseStatus.INVESTIGATING);

    // Resolve case with REFUND_RECOMMENDED
    await service.resolveCase({
      merchantId: merchantA,
      caseId: c.id,
      action: 'REFUND_RECOMMENDED',
      notes: 'Customer refunded externally'
    });
    assert.strictEqual(repo.outbox.length, 3);
    assert.strictEqual(repo.outbox[2]?.eventType, WebhookEventType.RECONCILIATION_CASE_RESOLVED);
    assert.strictEqual(repo.outbox[2]?.payload?.action, 'REFUND_RECOMMENDED');
  });
});
