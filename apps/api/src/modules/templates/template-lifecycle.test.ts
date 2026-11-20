import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EvidenceChannel,
  EvidenceProvider,
  TemplateLifecycleStatus
} from '@rgs-ledger/shared-types';
import {
  TemplateManager,
  ITemplateRepository,
  CreateTemplateInput
} from './template-manager.js';

class MockTemplateRepository implements ITemplateRepository {
  private templates: Map<string, any> = new Map();
  private idCounter = 1;

  async create(merchantId: string, data: any): Promise<any> {
    const id = `tmpl_${this.idCounter++}`;
    const doc = {
      _id: id,
      id,
      merchantId,
      ...data,
      toObject() {
        return { ...this };
      }
    };
    this.templates.set(`${merchantId}:${id}`, doc);
    return doc;
  }

  async findById(merchantId: string, templateId: string): Promise<any> {
    const doc = this.templates.get(`${merchantId}:${templateId}`);
    return doc || null;
  }

  async list(merchantId: string, filter?: { channel?: EvidenceChannel; status?: TemplateLifecycleStatus }): Promise<any[]> {
    const list: any[] = [];
    for (const doc of this.templates.values()) {
      if (doc.merchantId === merchantId) {
        if (filter?.channel && doc.channel !== filter.channel) continue;
        if (filter?.status && doc.status !== filter.status) continue;
        list.push(doc);
      }
    }
    return list;
  }

  async save(templateDoc: any): Promise<any> {
    this.templates.set(`${templateDoc.merchantId}:${templateDoc._id}`, templateDoc);
    return templateDoc;
  }
}

describe('Phase 2A — Merchant Template Lifecycle & Version Immutability', () => {
  const merchantId = 'mer_abc123';
  const userId = 'usr_admin_1';

  test('creates a new template with version 1 in PENDING_APPROVAL and mutable', async () => {
    const repo = new MockTemplateRepository();
    const manager = new TemplateManager(repo);

    const input: CreateTemplateInput = {
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      senderIdentifier: 'alerts@hdfcbank.net',
      name: 'HDFC UPI Credit Email',
      regexPattern: 'credited with INR (?<amount>[0-9,.]+) on.*Ref: (?<utr>[0-9]{12})',
      fieldsMap: {
        amountPaiseExtractor: 'amount',
        utrExtractor: 'utr'
      }
    };

    const template = await manager.createTemplate(merchantId, input, userId);

    assert.equal(template.merchantId, merchantId);
    assert.equal(template.version, 1);
    assert.equal(template.status, TemplateLifecycleStatus.PENDING_APPROVAL);
    assert.equal(template.isImmutable, false);
    assert.equal(template.history.length, 1);
    assert.equal(template.history[0]?.status, TemplateLifecycleStatus.PENDING_APPROVAL);
  });

  test('approving a template makes it APPROVED and immutable', async () => {
    const repo = new MockTemplateRepository();
    const manager = new TemplateManager(repo);

    const template = await manager.createTemplate(
      merchantId,
      {
        channel: EvidenceChannel.EMAIL,
        senderIdentifier: 'alerts@icicibank.com',
        name: 'ICICI UPI Email',
        regexPattern: 'credited with Rs (?<amount>[0-9.]+) Ref (?<utr>[0-9]{12})',
        fieldsMap: { amountPaiseExtractor: 'amount', utrExtractor: 'utr' }
      },
      userId
    );

    const approved = await manager.approveTemplate(
      merchantId,
      template.id,
      1,
      userId,
      'Approved after verifying 5 live sample alerts'
    );

    assert.equal(approved.status, TemplateLifecycleStatus.APPROVED);
    assert.equal(approved.isImmutable, true);
    assert.equal(approved.approvedByUserId, userId);
    assert.ok(approved.approvedAt instanceof Date);
    assert.equal(approved.history.length, 2);
    assert.equal(approved.history[1]?.status, TemplateLifecycleStatus.APPROVED);
  });

  test('modifying an APPROVED template spawns version n+1 in PENDING_APPROVAL without mutating version n in history', async () => {
    const repo = new MockTemplateRepository();
    const manager = new TemplateManager(repo);

    // 1. Create and Approve version 1
    const v1 = await manager.createTemplate(
      merchantId,
      {
        channel: EvidenceChannel.ANDROID,
        senderIdentifier: 'com.google.android.apps.nbu.paisa.user',
        name: 'GPay Push Notification',
        regexPattern: 'Received Rs. (?<amount>[0-9]+) UPI Ref (?<utr>[0-9]{12})',
        fieldsMap: { amountPaiseExtractor: 'amount', utrExtractor: 'utr' }
      },
      userId
    );
    await manager.approveTemplate(merchantId, v1.id, 1, userId);

    // 2. Update regex to handle decimals
    const v2 = await manager.updateTemplate(
      merchantId,
      v1.id,
      {
        regexPattern: 'Received Rs. (?<amount>[0-9.]+) UPI Ref (?<utr>[0-9]{12})',
        changeReason: 'Support decimal payments'
      },
      userId
    );

    assert.equal(v2.version, 2);
    assert.equal(v2.status, TemplateLifecycleStatus.PENDING_APPROVAL);
    assert.equal(v2.isImmutable, false);
    assert.equal(v2.regexPattern, 'Received Rs. (?<amount>[0-9.]+) UPI Ref (?<utr>[0-9]{12})');

    // Verify history contains frozen version 1
    assert.equal(v2.history.length, 3);
    const archivedV1 = v2.history[1];
    assert.equal(archivedV1?.version, 1);
    assert.equal(archivedV1?.status, TemplateLifecycleStatus.APPROVED);
    assert.equal(archivedV1?.regexPattern, 'Received Rs. (?<amount>[0-9]+) UPI Ref (?<utr>[0-9]{12})');
  });

  test('disabled templates cannot be updated or used for extraction', async () => {
    const repo = new MockTemplateRepository();
    const manager = new TemplateManager(repo);

    const template = await manager.createTemplate(
      merchantId,
      {
        channel: EvidenceChannel.EMAIL,
        senderIdentifier: 'alerts@oldbank.com',
        name: 'Deprecated Bank',
        regexPattern: 'Credit (?<amount>[0-9]+)',
        fieldsMap: { amountPaiseExtractor: 'amount' }
      },
      userId
    );

    const disabled = await manager.disableTemplate(merchantId, template.id, userId, 'Bank deprecated notification format');
    assert.equal(disabled.status, TemplateLifecycleStatus.DISABLED);

    // Updating a disabled template must throw
    await assert.rejects(
      () => manager.updateTemplate(merchantId, template.id, { name: 'New Name' }),
      /Cannot update a DISABLED template/
    );

    // Extraction with disabled template returns null
    const extraction = TemplateManager.matchAndExtract(disabled, 'Credit 500');
    assert.equal(extraction, null);
  });

  test('matchAndExtract accurately extracts amount, UTR, and account from notification text', () => {
    const sampleTemplate = {
      id: 'tmpl_1',
      merchantId,
      channel: EvidenceChannel.EMAIL,
      senderIdentifier: 'alerts@bank.com',
      name: 'Standard Alert',
      regexPattern: 'A/c (?<account>\\d+) credited by Rs (?<amount>[0-9,.]+) on (?<date>[\\w-]+) UPI Ref (?<utr>\\d{12})',
      fieldsMap: {
        accountExtractor: 'account',
        amountPaiseExtractor: 'amount',
        utrExtractor: 'utr',
        transactionTimestampExtractor: 'date'
      },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const text = 'Dear user, your A/c 987654321012 credited by Rs 1,250.50 on 2026-11-12 UPI Ref 887766554433.';
    const extracted = TemplateManager.matchAndExtract(sampleTemplate, text);

    assert.ok(extracted);
    assert.equal(extracted.amountPaise, 125050);
    assert.equal(extracted.amountRupees, '1,250.50');
    assert.equal(extracted.utr, '887766554433');
    assert.equal(extracted.accountIdentifier, '987654321012');
    assert.ok(extracted.transactionTimestamp instanceof Date);
  });
});
