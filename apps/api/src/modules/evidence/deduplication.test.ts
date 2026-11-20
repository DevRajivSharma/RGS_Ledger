import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EvidenceProvider,
  EvidenceStatus
} from '@rgs-ledger/shared-types';
import { EvidenceSecurity } from './evidence-security.js';
import {
  EvidenceIngestionService,
  IEvidenceIngestionRepository
} from './evidence-ingestion.service.js';

class MockEvidenceIngestionRepository implements IEvidenceIngestionRepository {
  public evidenceStore: Map<string, any> = new Map();
  public attemptsStore: any[] = [];
  private idCounter = 1;

  async findEvidenceByDeduplicationHash(merchantId: string, deduplicationHash: string): Promise<any> {
    const key = `${merchantId}:${deduplicationHash}`;
    return this.evidenceStore.get(key) || null;
  }

  async createEvidence(merchantId: string, data: any): Promise<any> {
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

describe('Phase 2A — Evidence Deduplication & Ingestion Safety', () => {
  const merchantId = 'mer_tenant_alpha';

  test('generates deterministic deduplication hash and enforces merchant isolation', () => {
    const hash1 = EvidenceSecurity.computeDeduplicationHash(
      'mer_tenant_alpha',
      'EMAIL',
      'GMAIL',
      'msg_12345'
    );
    const hash2 = EvidenceSecurity.computeDeduplicationHash(
      'mer_tenant_alpha',
      'EMAIL',
      'GMAIL',
      'msg_12345'
    );
    const hashDifferentMerchant = EvidenceSecurity.computeDeduplicationHash(
      'mer_tenant_beta',
      'EMAIL',
      'GMAIL',
      'msg_12345'
    );
    const hashDifferentMsgId = EvidenceSecurity.computeDeduplicationHash(
      'mer_tenant_alpha',
      'EMAIL',
      'GMAIL',
      'msg_99999'
    );

    assert.equal(hash1, hash2);
    assert.notEqual(hash1, hashDifferentMerchant);
    assert.notEqual(hash1, hashDifferentMsgId);
  });

  test('successfully ingests new credit evidence and stores with UNMATCHED status', async () => {
    const repo = new MockEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const result = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.GMAIL,
      providerMessageId: 'gmail_first_ingest_01',
      senderOrPackage: 'alerts@hdfcbank.net',
      rawText: 'Rs 1,000 credited to account XX1234. Ref: 123456789012',
      amountPaise: 100000,
      utr: '123456789012'
    });

    assert.equal(result.isDuplicate, false);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.evidenceStatus, EvidenceStatus.UNMATCHED);
    assert.ok(result.evidenceId);
    assert.equal(repo.evidenceStore.size, 1);
    assert.equal(repo.attemptsStore.length, 1);
    assert.equal(repo.attemptsStore[0]?.status, 'SUCCESS');
  });

  test('idempotently catches duplicate evidence on resubmission without creating duplicate records', async () => {
    const repo = new MockEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const input = {
      merchantId,
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_unique_notif_99',
      senderOrPackage: 'com.google.android.apps.nbu.paisa.user',
      rawText: 'Received Rs. 250 via UPI Ref: 987654321012',
      amountPaise: 25000,
      utr: '987654321012'
    };

    // First attempt: success
    const firstResult = await service.ingestEvidence(input);
    assert.equal(firstResult.status, 'SUCCESS');
    assert.equal(firstResult.isDuplicate, false);
    const originalEvidenceId = firstResult.evidenceId;

    // Second attempt: identical message
    const secondResult = await service.ingestEvidence(input);
    assert.equal(secondResult.status, 'DUPLICATE');
    assert.equal(secondResult.isDuplicate, true);
    assert.equal(secondResult.evidenceId, originalEvidenceId);

    // Verify database only has ONE evidence record, but TWO attempts
    assert.equal(repo.evidenceStore.size, 1);
    assert.equal(repo.attemptsStore.length, 2);
    assert.equal(repo.attemptsStore[0]?.status, 'SUCCESS');
    assert.equal(repo.attemptsStore[1]?.status, 'DUPLICATE');
  });

  test('ingests debit notifications with REJECTED status and DEBIT_TRANSACTION_IGNORED reason', async () => {
    const repo = new MockEvidenceIngestionRepository();
    const service = new EvidenceIngestionService(repo);

    const result = await service.ingestEvidence({
      merchantId,
      provider: EvidenceProvider.OUTLOOK,
      providerMessageId: 'outlook_debit_alert_02',
      senderOrPackage: 'notify@bank.com',
      rawText: 'Dear Customer, your account XX9999 has been debited by Rs 500 for UPI purchase.',
      amountRupees: 500
    });

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.evidenceStatus, EvidenceStatus.REJECTED);
    assert.equal(result.rejectionReason, 'DEBIT_TRANSACTION_IGNORED');

    // Verify stored evidence status is REJECTED
    const stored = Array.from(repo.evidenceStore.values())[0];
    assert.equal(stored.status, EvidenceStatus.REJECTED);
    assert.equal(stored.rejectionReason, 'DEBIT_TRANSACTION_IGNORED');
  });
});
