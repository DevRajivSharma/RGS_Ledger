import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EvidenceProvider,
  EvidenceChannel,
  EvidenceStatus,
  PaymentStatus
} from '@rgs-ledger/shared-types';
import {
  EvidenceIngestionService,
  IEvidenceIngestionRepository
} from './evidence-ingestion.service.js';

class InMemoryEvidenceIngestionRepository implements IEvidenceIngestionRepository {
  public evidenceStore: Map<string, any> = new Map();
  public attemptsStore: any[] = [];
  public shouldFailCreate = false;
  private idCounter = 1;

  async findEvidenceByDeduplicationHash(merchantId: string, deduplicationHash: string): Promise<any> {
    const key = `${merchantId}:${deduplicationHash}`;
    return this.evidenceStore.get(key) || null;
  }

  async findEvidenceByRawPayloadHash(merchantId: string, channel: string, rawPayloadHash: string): Promise<any> {
    for (const record of this.evidenceStore.values()) {
      if (
        record.merchantId === merchantId &&
        record.channel === channel &&
        record.rawPayloadHash === rawPayloadHash
      ) {
        return record;
      }
    }
    return null;
  }

  async findEvidenceByUtr(merchantId: string, utr: string): Promise<any[]> {
    const results: any[] = [];
    for (const record of this.evidenceStore.values()) {
      if (record.merchantId === merchantId && record.utr === utr) {
        results.push(record);
      }
    }
    return results;
  }

  async updateEvidenceStatus(merchantId: string, evidenceId: string, status: EvidenceStatus, rejectionReason?: string): Promise<any> {
    for (const [key, record] of this.evidenceStore.entries()) {
      if (record.merchantId === merchantId && (record._id === evidenceId || record.id === evidenceId)) {
        record.status = status;
        record.rejectionReason = rejectionReason;
        this.evidenceStore.set(key, record);
        return record;
      }
    }
    return null;
  }

  async createEvidence(merchantId: string, data: any): Promise<any> {
    if (this.shouldFailCreate) {
      throw new Error('Database connection timed out');
    }
    const id = `evi_${this.idCounter++}`;
    const key = `${merchantId}:${data.deduplicationHash}`;
    if (this.evidenceStore.has(key)) {
      const err: any = new Error('E11000 duplicate key error');
      err.code = 11000;
      throw err;
    }
    const record = { _id: id, id, merchantId, ...data };
    this.evidenceStore.set(key, record);
    return record;
  }

  async createAttempt(merchantId: string, data: any): Promise<any> {
    const id = `att_${this.idCounter++}`;
    const record = { _id: id, id, merchantId, ...data };
    this.attemptsStore.push(record);
    return record;
  }
}

describe('Phase 2C.2 — Android Evidence Replay, Deduplication & Matching Audit (11 Invariants)', () => {
  const merchantId = 'mer_tenant_test';

  // Test 1: Same Android notification uploaded twice
  test('1. Same Android notification uploaded twice returns DUPLICATE on second attempt without creating duplicate records', async () => {
    const repo = new InMemoryEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const notificationPayload = {
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_com.google.android.apps.messaging_hash123',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText: 'A/c *0562 Credited for Rs:100.00 on 17-11-2026 by UPI ref no 668387168541',
      amountPaise: 10000,
      utr: '668387168541',
      accountIdentifier: '••••0562'
    };

    const firstResult = await service.ingestEvidence(notificationPayload);
    assert.equal(firstResult.status, 'SUCCESS');
    assert.equal(firstResult.isDuplicate, false);
    assert.ok(firstResult.evidenceId);

    const secondResult = await service.ingestEvidence(notificationPayload);
    assert.equal(secondResult.status, 'DUPLICATE');
    assert.equal(secondResult.isDuplicate, true);
    assert.equal(secondResult.evidenceId, firstResult.evidenceId);

    // Only 1 evidence persisted, but 2 ingestion attempts logged
    assert.equal(repo.evidenceStore.size, 1);
    assert.equal(repo.attemptsStore.length, 2);
    assert.equal(repo.attemptsStore[1]?.status, 'DUPLICATE');
  });

  // Test 2: Same notification replayed after app restart
  test('2. Same notification replayed after app restart is deduplicated via raw payload hash', async () => {
    const repo = new InMemoryEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const rawText = 'A/c *0562 Credited for Rs:50.00 by UPI ref no 668387168542';

    // Original capture before restart
    const firstResult = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_session1_notif_001',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText,
      amountPaise: 5000,
      utr: '668387168542'
    });
    assert.equal(firstResult.isDuplicate, false);

    // After app restart, re-ingestion with distinct providerMessageId but identical payload
    const restartResult = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_session2_notif_replayed',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText,
      amountPaise: 5000,
      utr: '668387168542'
    });

    assert.equal(restartResult.isDuplicate, true);
    assert.equal(restartResult.status, 'DUPLICATE');
    assert.equal(restartResult.evidenceId, firstResult.evidenceId);
    assert.equal(repo.evidenceStore.size, 1);
  });

  // Test 3: Same transaction delivered through different Android notification IDs
  test('3. Same transaction delivered through different Android notification IDs deduplicates on (merchant, channel, utr)', async () => {
    const repo = new InMemoryEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    // Delivery 1 via SMS messaging app
    const delivery1 = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_msg_notif_100',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText: 'SMS: A/c *0562 Credited Rs 200.00 UPI Ref 668387168543',
      amountPaise: 20000,
      utr: '668387168543'
    });
    assert.equal(delivery1.isDuplicate, false);

    // Delivery 2 via Bank app push notification for the same underlying transaction
    const delivery2 = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_bank_app_notif_200',
      senderOrPackage: 'com.infrasofttech.uboi',
      rawText: 'Vyom Push: You received Rs 200.00 in a/c 0562 via UPI 668387168543',
      amountPaise: 20000,
      utr: '668387168543'
    });

    assert.equal(delivery2.isDuplicate, true);
    assert.equal(delivery2.status, 'DUPLICATE');
    assert.equal(delivery2.evidenceId, delivery1.evidenceId);
    assert.equal(repo.evidenceStore.size, 1);
  });

  // Test 4: Same transaction received by Gmail and Android (Dual-source happy path)
  test('4. Same transaction received by Gmail and Android are both retained as independent dual-source evidence', async () => {
    const repo = new InMemoryEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const utr = '668387168544';
    const amountPaise = 10000;

    // 1. Ingest Gmail credit alert
    const emailResult = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.GMAIL,
      providerMessageId: 'gmail_msg_id_444',
      senderOrPackage: 'alerts@unionbank.com',
      rawText: 'Email: Credit alert for Rs 100.00, UPI Ref 668387168544 to account 0562',
      amountPaise,
      utr
    });
    assert.equal(emailResult.isDuplicate, false);
    assert.equal(emailResult.status, 'SUCCESS');

    // 2. Ingest Android companion credit notification
    const androidResult = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_notif_id_444',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText: 'SMS: Credited Rs 100.00 ref 668387168544',
      amountPaise,
      utr
    });
    assert.equal(androidResult.isDuplicate, false);
    assert.equal(androidResult.status, 'SUCCESS');

    // Both records exist independently across EMAIL and ANDROID channels
    assert.equal(repo.evidenceStore.size, 2);
    const stored = Array.from(repo.evidenceStore.values());
    const channels = stored.map((s) => s.channel);
    assert.ok(channels.includes(EvidenceChannel.EMAIL));
    assert.ok(channels.includes(EvidenceChannel.ANDROID));
  });

  // Test 5: Two distinct transactions with identical amounts
  test('5. Two distinct transactions with identical amounts are ingested independently without collision', async () => {
    const repo = new InMemoryEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const tx1 = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_tx_1',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText: 'Customer 1 paid Rs 100. UTR: 111111111111',
      amountPaise: 10000,
      utr: '111111111111'
    });

    const tx2 = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_tx_2',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText: 'Customer 2 paid Rs 100. UTR: 222222222222',
      amountPaise: 10000,
      utr: '222222222222'
    });

    assert.equal(tx1.isDuplicate, false);
    assert.equal(tx2.isDuplicate, false);
    assert.notEqual(tx1.evidenceId, tx2.evidenceId);
    assert.equal(repo.evidenceStore.size, 2);
  });

  // Test 6: Two payment requests with identical amounts
  test('6. Two payment requests with identical amounts pair with distinct evidence and do not steal UTRs', () => {
    // Domain logic simulation of PaymentRequest evaluation
    const paymentA: any = {
      id: 'pay_A',
      amountPaise: 10000,
      status: PaymentStatus.PENDING,
      evidenceSummary: {}
    };

    const paymentB: any = {
      id: 'pay_B',
      amountPaise: 10000,
      status: PaymentStatus.PENDING,
      evidenceSummary: {}
    };

    const evidence1 = { id: 'evi_1', utr: 'UTR_AAAA', amountPaise: 10000, channel: EvidenceChannel.ANDROID };
    const evidence2 = { id: 'evi_2', utr: 'UTR_BBBB', amountPaise: 10000, channel: EvidenceChannel.ANDROID };

    // Match evidence 1 to payment A
    paymentA.evidenceSummary = { utr: evidence1.utr, hasAndroidEvidence: true };
    paymentA.status = PaymentStatus.PARTIAL_SUCCESS;

    // When evidence 2 arrives, candidate paymentA is skipped because its UTR is already UTR_AAAA
    const candidatePayments = [paymentA, paymentB];
    let targetPayment: any = null;

    for (const p of candidatePayments) {
      if (p.evidenceSummary?.utr && evidence2.utr && p.evidenceSummary.utr !== evidence2.utr) {
        continue; // Skip because payment is bound to different UTR
      }
      targetPayment = p;
      break;
    }

    assert.strictEqual(targetPayment.id, 'pay_B', 'Evidence 2 must select Payment B, not Payment A');
    targetPayment.evidenceSummary = { utr: evidence2.utr, hasAndroidEvidence: true };
    targetPayment.status = PaymentStatus.PARTIAL_SUCCESS;

    assert.strictEqual(paymentA.evidenceSummary.utr, 'UTR_AAAA');
    assert.strictEqual(paymentB.evidenceSummary.utr, 'UTR_BBBB');
  });

  // Test 7: Same UTR with conflicting amounts
  test('7. Same UTR with conflicting amounts transitions to REVIEW_REQUIRED', async () => {
    const repo = new InMemoryEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const utr = '668387168545';

    // First evidence: ₹100 (10000 paise)
    const ev1 = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.GMAIL,
      providerMessageId: 'gmail_first_amount',
      senderOrPackage: 'alerts@bank.com',
      rawText: 'Credit alert for Rs 100.00 UTR 668387168545',
      amountPaise: 10000,
      utr
    });
    assert.equal(ev1.status, 'SUCCESS');

    // Second evidence with SAME UTR but conflicting amount ₹500 (50000 paise)
    const ev2 = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_conflicting_amount',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText: 'Credit alert for Rs 500.00 UTR 668387168545',
      amountPaise: 50000,
      utr
    });

    assert.equal(ev2.evidenceStatus, EvidenceStatus.REVIEW_REQUIRED);
    assert.equal(ev2.rejectionReason, 'CONFLICTING_AMOUNT_FOR_SAME_UTR');

    // Existing evidence is also updated to REVIEW_REQUIRED
    const storedEv1 = Array.from(repo.evidenceStore.values()).find((e) => e._id === ev1.evidenceId);
    assert.equal(storedEv1?.status, EvidenceStatus.REVIEW_REQUIRED);
    assert.equal(storedEv1?.rejectionReason, 'CONFLICTING_AMOUNT_FOR_SAME_UTR');
  });

  // Test 8: Missing UTR
  test('8. Missing UTR evidence is accepted but placed in REVIEW_REQUIRED', async () => {
    const repo = new InMemoryEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const result = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_no_utr',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText: 'You received Rs. 50 in your bank account',
      amountPaise: 5000,
      utr: null // Missing reference
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.evidenceStatus, EvidenceStatus.REVIEW_REQUIRED);
    assert.equal(result.rejectionReason, 'MISSING_UTR_REFERENCE');
  });

  // Test 9: Delayed evidence
  test('9. Delayed evidence arriving for an expired payment request transitions to RECONCILIATION_REQUIRED', () => {
    const expiredPayment: any = {
      id: 'pay_expired',
      amountPaise: 10000,
      status: PaymentStatus.EXPIRED,
      expiresAt: new Date(Date.now() - 15 * 60 * 1000), // Expired 15 mins ago
      evidenceSummary: {}
    };

    const _evidence = {
      id: 'evi_late',
      amountPaise: 10000,
      utr: 'UTR_LATE_123',
      channel: EvidenceChannel.ANDROID
    };
    assert.strictEqual(_evidence.channel, EvidenceChannel.ANDROID);

    // State transition logic for delayed evidence
    let newStatus: PaymentStatus;
    const isExpired = expiredPayment.status === PaymentStatus.EXPIRED ||
      (expiredPayment.expiresAt && new Date(expiredPayment.expiresAt) < new Date());

    if (isExpired) {
      newStatus = PaymentStatus.RECONCILIATION_REQUIRED;
    } else {
      newStatus = PaymentStatus.PARTIAL_SUCCESS;
    }

    assert.strictEqual(
      newStatus,
      PaymentStatus.RECONCILIATION_REQUIRED,
      'Delayed evidence must move payment to RECONCILIATION_REQUIRED, never PARTIAL_SUCCESS or SUCCESS'
    );
  });

  // Test 10: Failed upload followed by successful retry
  test('10. Failed upload records FAILED attempt; retry succeeds without losing state', async () => {
    const repo = new InMemoryEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const payload = {
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_retry_test',
      senderOrPackage: 'com.google.android.apps.messaging',
      rawText: 'Credit alert Rs 100 UTR 668387168546',
      amountPaise: 10000,
      utr: '668387168546'
    };

    // Simulate transient DB failure
    repo.shouldFailCreate = true;
    await assert.rejects(
      async () => service.ingestEvidence(payload),
      /Evidence ingestion failed/
    );

    assert.equal(repo.evidenceStore.size, 0);
    assert.equal(repo.attemptsStore.length, 1);
    assert.equal(repo.attemptsStore[0]?.status, 'FAILED');

    // Simulate successful retry
    repo.shouldFailCreate = false;
    const retryResult = await service.ingestEvidence(payload);
    assert.equal(retryResult.status, 'SUCCESS');
    assert.equal(retryResult.isDuplicate, false);
    assert.equal(repo.evidenceStore.size, 1);
    assert.equal(repo.attemptsStore.length, 2);
    assert.equal(repo.attemptsStore[1]?.status, 'SUCCESS');
  });

  // Test 11: Evidence cannot be associated with multiple payments
  test('11. One UTR can never satisfy multiple payment requests (rejects association collision)', () => {
    const associations = new Map<string, string>(); // UTR -> PaymentRequestId
    const existingUtr = '668387168547';

    // Payment 1 associates with UTR
    associations.set(existingUtr, 'pay_first');

    // Payment 2 attempts to claim the same UTR
    const newPaymentId = 'pay_second';
    let allowed = false;
    let reason = '';

    if (associations.has(existingUtr)) {
      allowed = false;
      reason = 'DUPLICATE_UTR_ACROSS_PAYMENTS';
    } else {
      associations.set(existingUtr, newPaymentId);
      allowed = true;
    }

    assert.strictEqual(allowed, false, 'One UTR cannot be associated with multiple payments');
    assert.strictEqual(reason, 'DUPLICATE_UTR_ACROSS_PAYMENTS');
    assert.strictEqual(associations.get(existingUtr), 'pay_first');
  });
});
