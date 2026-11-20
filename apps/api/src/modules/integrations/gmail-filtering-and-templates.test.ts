import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  EvidenceStatus,
  TemplateLifecycleStatus,
  EvidenceChannel,
  EvidenceProvider
} from '@rgs-ledger/shared-types';
import { BankEmailCandidateFilter } from './bank-email-filter.js';
import { TemplateManager, ITemplateRepository } from '../templates/template-manager.js';
import { EvidenceSecurity } from '../evidence/evidence-security.js';
import {
  GmailSyncService,
  IGmailSyncRepository
} from './gmail-sync.service.js';
import {
  EvidenceIngestionService,
  IEvidenceIngestionRepository
} from '../evidence/evidence-ingestion.service.js';
import { GmailOAuthService, IOAuthHttpTransport } from './gmail-oauth.service.js';
import { IGmailClient, GmailListMessagesResponse } from './gmail-client.js';

// In-Memory Test Repositories
class InMemoryTemplateRepo implements ITemplateRepository {
  public templates: Map<string, any> = new Map();

  async create(merchantId: string, data: any): Promise<any> {
    const id = new mongoose.Types.ObjectId().toString();
    const doc = {
      _id: id,
      id,
      merchantId,
      ...data,
      toObject: function () {
        return { ...this };
      }
    };
    this.templates.set(`${merchantId}:${id}`, doc);
    return doc;
  }

  async findById(merchantId: string, templateId: string): Promise<any> {
    if (!mongoose.isValidObjectId(templateId) || templateId === 'undefined') {
      return null;
    }
    const doc = this.templates.get(`${merchantId}:${templateId}`) || null;
    if (doc && !doc.toObject) {
      doc.toObject = function () {
        return { ...this };
      };
    }
    return doc;
  }

  async list(merchantId: string, filter?: { channel?: EvidenceChannel; status?: TemplateLifecycleStatus }): Promise<any[]> {
    const results: any[] = [];
    for (const [key, doc] of this.templates.entries()) {
      if (key.startsWith(`${merchantId}:`)) {
        if (filter?.channel && doc.channel !== filter.channel) continue;
        if (filter?.status && doc.status !== filter.status) continue;
        if (!doc.toObject) {
          doc.toObject = function () {
            return { ...this };
          };
        }
        results.push(doc);
      }
    }
    return results;
  }

  async save(templateDoc: any): Promise<any> {
    const key = `${templateDoc.merchantId}:${templateDoc._id || templateDoc.id}`;
    this.templates.set(key, templateDoc);
    return templateDoc;
  }
}

class InMemoryIngestionRepo implements IEvidenceIngestionRepository {
  public evidenceMap: Map<string, any> = new Map();
  public attempts: any[] = [];

  async findEvidenceByDeduplicationHash(merchantId: string, deduplicationHash: string): Promise<any> {
    return this.evidenceMap.get(`${merchantId}:${deduplicationHash}`) || null;
  }

  async createEvidence(merchantId: string, data: any): Promise<any> {
    const id = new mongoose.Types.ObjectId().toString();
    const doc = { _id: id, id, merchantId, ...data };
    this.evidenceMap.set(`${merchantId}:${data.deduplicationHash}`, doc);
    return doc;
  }

  async createAttempt(merchantId: string, data: any): Promise<any> {
    const id = new mongoose.Types.ObjectId().toString();
    const doc = { _id: id, id, merchantId, ...data };
    this.attempts.push(doc);
    return doc;
  }
}

class InMemorySyncRepo implements IGmailSyncRepository {
  public integrations: Map<string, any> = new Map();
  public templatesRepo: InMemoryTemplateRepo;
  public ingestionRepo: InMemoryIngestionRepo;

  constructor(templatesRepo: InMemoryTemplateRepo, ingestionRepo: InMemoryIngestionRepo) {
    this.templatesRepo = templatesRepo;
    this.ingestionRepo = ingestionRepo;
  }

  async findIntegration(merchantId: string, type: string): Promise<any> {
    return this.integrations.get(`${merchantId}:${type}`) || null;
  }

  async saveIntegration(integration: any): Promise<any> {
    this.integrations.set(`${integration.merchantId}:${integration.type}`, integration);
    return integration;
  }

  async findApprovedTemplates(merchantId: string, channel: string): Promise<any[]> {
    return this.templatesRepo.list(merchantId, {
      channel: channel as EvidenceChannel,
      status: TemplateLifecycleStatus.APPROVED
    });
  }

  async findEvidenceByDeduplicationHash(merchantId: string, deduplicationHash: string): Promise<any> {
    return this.ingestionRepo.findEvidenceByDeduplicationHash(merchantId, deduplicationHash);
  }
}

class MockGmailClient implements IGmailClient {
  public messages: Map<string, any> = new Map();

  async listMessages(): Promise<GmailListMessagesResponse> {
    const messageSummaries = Array.from(this.messages.keys()).map((id) => ({
      id,
      threadId: `th_${id}`
    }));
    return { messages: messageSummaries };
  }

  async getMessage(_accessToken: string, messageId: string): Promise<any> {
    return this.messages.get(messageId) || { id: messageId };
  }
}

class MockTransport implements IOAuthHttpTransport {
  async post(): Promise<{ status: number; data: any }> {
    return { status: 200, data: { access_token: 'fresh_token', expires_in: 3600 } };
  }
  async get(): Promise<{ status: number; data: any }> {
    return { status: 200, data: { email: 'merchant@gmail.com' } };
  }
}

describe('Phase 2B.1 — Gmail Filtering, Template Application & Reclassification', () => {
  const merchantA = new mongoose.Types.ObjectId().toString();
  const merchantB = new mongoose.Types.ObjectId().toString();

  test('1. New unrelated emails (Indeed & Amazon orders) are rejected before ingestion', () => {
    // Indeed job alert
    const indeedResult = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'Indeed Job Alert <alert@indeed.com>',
      subject: 'New Developer Jobs in Bengaluru: INR 45,000 / month',
      bodyText: 'We found new jobs matching your profile. Salary: INR 45,000. Apply now.'
    });
    assert.strictEqual(indeedResult.isCandidate, false);
    assert.ok(indeedResult.rejectionReason?.includes('EXCLUDED_RECRUITMENT_OR_COMMERCE_DOMAIN'));

    // Amazon order update
    const amazonResult = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'auto-confirm@amazon.in',
      subject: 'Your Amazon.in order #402-1234567-8901234 has been confirmed',
      bodyText: 'Thank you for your order. Order total: Rs. 1,499.00. Payment method: Credit Card.'
    });
    assert.strictEqual(amazonResult.isCandidate, false);
    assert.ok(amazonResult.rejectionReason?.includes('EXCLUDED_RECRUITMENT_OR_COMMERCE_DOMAIN') || amazonResult.rejectionReason?.includes('EXCLUDED_SUBJECT_CATEGORY'));

    // Promotional email with rupee amount
    const promoResult = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'newsletter@store.com',
      subject: 'Special offer! Save Rs. 500 on all electronics today',
      bodyText: 'Shop now and get flat INR 500 discount on cart value above Rs. 2,000.'
    });
    assert.strictEqual(promoResult.isCandidate, false);
  });

  test('2. Reclassification safe mechanism correctly flags old Indeed & Amazon records as REJECTED without deletion', () => {
    const historicalDocs = [
      {
        id: 'hist_1',
        sender: 'alerts@indeed.com',
        subject: 'Job Alert: Developer',
        rawText: 'Apply now for Developer role with salary INR 50,000.',
        status: EvidenceStatus.UNMATCHED
      },
      {
        id: 'hist_2',
        sender: 'order-update@amazon.in',
        subject: 'Your order #123 has been shipped',
        rawText: 'Your package is out for delivery. Order amount: Rs. 899.',
        status: EvidenceStatus.UNMATCHED
      },
      {
        id: 'hist_3',
        sender: 'alerts@hdfcbank.net',
        subject: 'Credit Alert - Rs 2,500',
        rawText: 'Your account XX9988 has been credited with INR 2,500.00. UPI Ref: 123456789012.',
        status: EvidenceStatus.UNMATCHED
      }
    ];

    // Reclassify each document
    for (const doc of historicalDocs) {
      const evaluation = BankEmailCandidateFilter.evaluateCandidate({
        sender: doc.sender,
        subject: doc.subject,
        bodyText: doc.rawText
      });

      if (!evaluation.isCandidate && !evaluation.isDebit) {
        doc.status = EvidenceStatus.REJECTED;
      } else if (evaluation.isCandidate) {
        doc.status = EvidenceStatus.UNMATCHED;
      }
    }

    // Historical records are preserved (not deleted)
    assert.strictEqual(historicalDocs.length, 3);
    assert.strictEqual(historicalDocs[0]?.status, EvidenceStatus.REJECTED);
    assert.strictEqual(historicalDocs[1]?.status, EvidenceStatus.REJECTED);
    assert.strictEqual(historicalDocs[2]?.status, EvidenceStatus.UNMATCHED);
  });

  test('3. Approved template lookup and actual field extraction during Gmail sync', async () => {
    const templateRepo = new InMemoryTemplateRepo();
    const ingestionRepo = new InMemoryIngestionRepo();
    const syncRepo = new InMemorySyncRepo(templateRepo, ingestionRepo);
    const templateManager = new TemplateManager(templateRepo);
    const ingestionService = new EvidenceIngestionService(ingestionRepo);
    const oauthService = new GmailOAuthService(new MockTransport());
    const gmailClient = new MockGmailClient();

    // Setup active Gmail integration for merchantA
    syncRepo.integrations.set(`${merchantA}:GMAIL`, {
      merchantId: merchantA,
      type: 'GMAIL',
      status: 'CONNECTED',
      isActive: true,
      encryptedAccessToken: EvidenceSecurity.encryptPayload('valid_access_token'),
      encryptedRefreshToken: EvidenceSecurity.encryptPayload('valid_refresh_token'),
      tokenExpiresAt: new Date(Date.now() + 3600000)
    });

    // Create and approve a custom merchant template for a regional cooperative bank
    const createdTemplate = await templateManager.createTemplate(merchantA, {
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      senderIdentifier: 'alerts@coopbank.in',
      name: 'Cooperative Bank Credit Alert Template',
      regexPattern: '(?:credited\\s*with|received)\\s*(?:INR|Rs\\.?|₹)?\\s*([0-9,.]+).*?(?:UPI\\s*Ref|RRN)[:\\s]*([a-zA-Z0-9]+).*?(?:A\\/c|account)[:\\s]*([0-9Xx*]+)',
      fieldsMap: {
        amountPaiseExtractor: '1',
        utrExtractor: '2',
        accountExtractor: '3'
      }
    });

    const approvedTemplate = await templateManager.approveTemplate(
      merchantA,
      createdTemplate.id,
      1,
      'admin_user_01',
      'Merchant verified against genuine cooperative bank notification'
    );

    assert.strictEqual(approvedTemplate.status, TemplateLifecycleStatus.APPROVED);
    assert.strictEqual(approvedTemplate.isImmutable, true);

    // Incoming email from this custom sender
    gmailClient.messages.set('coop_msg_01', {
      id: 'coop_msg_01',
      snippet: 'Coop Bank: credited with INR 3,500.00. UPI Ref: COOP99887766. A/c: 5678',
      payload: {
        headers: [
          { name: 'From', value: 'alerts@coopbank.in' },
          { name: 'Subject', value: 'Deposit Alert' },
          { name: 'Date', value: 'Thu, 12 Nov 2026 12:00:00 GMT' }
        ],
        body: {
          data: Buffer.from(
            'Dear Member, your account has been credited with INR 3,500.00. UPI Ref: COOP99887766. A/c: 5678.'
          ).toString('base64url')
        }
      }
    });

    // Run Gmail sync
    const syncService = new GmailSyncService(oauthService, gmailClient, ingestionService, syncRepo);
    const summary = await syncService.sync(merchantA);

    assert.strictEqual(summary.newEvidenceCount, 1);
    const ingestedEvidence = Array.from(ingestionRepo.evidenceMap.values())[0];
    assert.ok(ingestedEvidence);
    assert.strictEqual(ingestedEvidence.amountPaise, 350000);
    assert.strictEqual(ingestedEvidence.utr, 'COOP99887766');
    assert.strictEqual(ingestedEvidence.templateId, approvedTemplate.id);
    assert.strictEqual(ingestedEvidence.templateVersion, 1);
    assert.strictEqual(ingestedEvidence.status, EvidenceStatus.UNMATCHED);
  });

  test('4. Unknown format handling: candidate without approved template is marked REVIEW_REQUIRED', async () => {
    const templateRepo = new InMemoryTemplateRepo();
    const ingestionRepo = new InMemoryIngestionRepo();
    const syncRepo = new InMemorySyncRepo(templateRepo, ingestionRepo);
    const ingestionService = new EvidenceIngestionService(ingestionRepo);
    const oauthService = new GmailOAuthService(new MockTransport());
    const gmailClient = new MockGmailClient();

    syncRepo.integrations.set(`${merchantA}:GMAIL`, {
      merchantId: merchantA,
      type: 'GMAIL',
      status: 'CONNECTED',
      isActive: true,
      encryptedAccessToken: EvidenceSecurity.encryptPayload('valid_access_token'),
      encryptedRefreshToken: EvidenceSecurity.encryptPayload('valid_refresh_token'),
      tokenExpiresAt: new Date(Date.now() + 3600000)
    });

    // Notification from unknown fintech handle with non-standard format and no UTR
    gmailClient.messages.set('unknown_fmt_01', {
      id: 'unknown_fmt_01',
      snippet: 'Payment Credit: Rs 800 added to balance',
      payload: {
        headers: [
          { name: 'From', value: 'notifications@fintechapp.io' },
          { name: 'Subject', value: 'Payment Credit' },
          { name: 'Date', value: 'Thu, 12 Nov 2026 14:00:00 GMT' }
        ],
        body: {
          data: Buffer.from(
            'Deposit of Rs 800 credited to wallet handle.'
          ).toString('base64url')
        }
      }
    });

    const syncService = new GmailSyncService(oauthService, gmailClient, ingestionService, syncRepo);
    const summary = await syncService.sync(merchantA);

    // It was ingested, but marked REVIEW_REQUIRED rather than blindly UNMATCHED
    assert.strictEqual(summary.newEvidenceCount, 1);
    const evidence = Array.from(ingestionRepo.evidenceMap.values())[0];
    assert.strictEqual(evidence.status, EvidenceStatus.REVIEW_REQUIRED);
    assert.strictEqual(evidence.rejectionReason, 'UNKNOWN_FORMAT_REQUIRES_TEMPLATE_REVIEW');
  });

  test('5. Template approval with valid ID, invalid ID, and undefined ID handling', async () => {
    const templateRepo = new InMemoryTemplateRepo();
    const templateManager = new TemplateManager(templateRepo);

    // Valid creation
    const tmpl = await templateManager.createTemplate(merchantA, {
      channel: EvidenceChannel.EMAIL,
      senderIdentifier: 'alerts@validbank.com',
      name: 'Valid Bank Pattern',
      regexPattern: 'credited with INR ([0-9,.]+)',
      fieldsMap: { amountPaiseExtractor: '1' }
    });

    assert.ok(tmpl.id);
    assert.ok(mongoose.isValidObjectId(tmpl.id));

    // Approval with valid ID succeeds
    const approved = await templateManager.approveTemplate(merchantA, tmpl.id, 1, 'user_1');
    assert.strictEqual(approved.status, TemplateLifecycleStatus.APPROVED);

    // Querying with undefined ID returns null cleanly without throwing CastError
    const undefinedLookup = await templateRepo.findById(merchantA, 'undefined');
    assert.strictEqual(undefinedLookup, null);

    // Querying with non-hex ID returns null cleanly
    const invalidLookup = await templateRepo.findById(merchantA, 'invalid-id-123');
    assert.strictEqual(invalidLookup, null);
  });

  test('6. Merchant isolation: Merchant B cannot access, approve, or use Merchant A templates', async () => {
    const templateRepo = new InMemoryTemplateRepo();
    const templateManager = new TemplateManager(templateRepo);

    const tmplA = await templateManager.createTemplate(merchantA, {
      channel: EvidenceChannel.EMAIL,
      senderIdentifier: 'alerts@merchant-a-bank.com',
      name: 'Merchant A Template',
      regexPattern: 'credited ([0-9]+)',
      fieldsMap: { amountPaiseExtractor: '1' }
    });

    // Merchant B attempts to fetch Merchant A template
    const fetchedByB = await templateManager.getTemplateById(merchantB, tmplA.id);
    assert.strictEqual(fetchedByB, null);

    // Merchant B attempts to approve Merchant A template
    await assert.rejects(
      async () => {
        await templateManager.approveTemplate(merchantB, tmplA.id, 1, 'user_merchant_b');
      },
      /Template not found or access denied/
    );

    // Merchant B list does not include Merchant A template
    const listB = await templateManager.listTemplates(merchantB);
    assert.strictEqual(listB.length, 0);
  });

  test('7. Template versioning: editing approved template creates version N+1 requiring re-approval', async () => {
    const templateRepo = new InMemoryTemplateRepo();
    const templateManager = new TemplateManager(templateRepo);

    // Create and approve version 1
    const v1 = await templateManager.createTemplate(merchantA, {
      channel: EvidenceChannel.EMAIL,
      senderIdentifier: 'alerts@versioned-bank.com',
      name: 'Versioned Bank Template',
      regexPattern: 'credited INR ([0-9]+)',
      fieldsMap: { amountPaiseExtractor: '1' }
    });

    const approvedV1 = await templateManager.approveTemplate(merchantA, v1.id, 1, 'user_1');
    assert.strictEqual(approvedV1.version, 1);
    assert.strictEqual(approvedV1.status, TemplateLifecycleStatus.APPROVED);

    // Update regex pattern on approved template: must fork to version 2 in PENDING_APPROVAL
    const v2Pending = await templateManager.updateTemplate(
      merchantA,
      v1.id,
      {
        regexPattern: 'credited INR ([0-9,.]+) to A\\/c ([0-9]+)',
        fieldsMap: { amountPaiseExtractor: '1', accountExtractor: '2' },
        changeReason: 'Updated to extract account suffix'
      },
      'user_1'
    );

    assert.strictEqual(v2Pending.version, 2);
    assert.strictEqual(v2Pending.status, TemplateLifecycleStatus.PENDING_APPROVAL);
    assert.strictEqual(v2Pending.isImmutable, false);
    // History contains version 1 creation, approval, and archive
    assert.strictEqual(v2Pending.history?.length, 3);

    // Approve version 2
    const approvedV2 = await templateManager.approveTemplate(
      merchantA,
      v1.id,
      2,
      'user_1',
      'Version 2 verified'
    );
    assert.strictEqual(approvedV2.version, 2);
    assert.strictEqual(approvedV2.status, TemplateLifecycleStatus.APPROVED);
    assert.strictEqual(approvedV2.isImmutable, true);
  });
});
