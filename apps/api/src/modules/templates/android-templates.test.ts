import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  EvidenceChannel,
  EvidenceProvider,
  TemplateLifecycleStatus,
  TransactionType,
  EvidenceTemplate
} from '@rgs-ledger/shared-types';
import {
  TemplateManager,
  ITemplateRepository
} from './template-manager.js';

class InMemoryTemplateRepository implements ITemplateRepository {
  public templates: Map<string, any> = new Map();
  private counter = 1;

  async create(merchantId: string, data: any): Promise<any> {
    const id = `tmpl_${this.counter++}`;
    const doc = { _id: id, id, merchantId, ...data };
    this.templates.set(`${merchantId}:${id}`, doc);
    return doc;
  }

  async findById(merchantId: string, templateId: string): Promise<any> {
    return this.templates.get(`${merchantId}:${templateId}`) || null;
  }

  async list(merchantId: string, filter?: { channel?: EvidenceChannel; status?: TemplateLifecycleStatus; bankAccountId?: string }): Promise<any[]> {
    const results: any[] = [];
    for (const t of this.templates.values()) {
      if (t.merchantId !== merchantId) continue;
      if (filter?.channel && t.channel !== filter.channel) continue;
      if (filter?.status && t.status !== filter.status) continue;
      if (filter?.bankAccountId && t.bankAccountId !== filter.bankAccountId) continue;
      results.push(t);
    }
    return results;
  }

  async save(templateDoc: any): Promise<any> {
    const key = `${templateDoc.merchantId}:${templateDoc._id || templateDoc.id}`;
    this.templates.set(key, templateDoc);
    return templateDoc;
  }
}

describe('Phase 2C.3 — Android Evidence Templates & Lifecycle Specification', () => {
  const merchantId = 'mer_test_tenant';
  const unionBankSms = 'A/c *0562 Credited for Rs:1.00 on 17-11-2026 by UPI ref no 123456789012 Avl Bal Rs:1090.03.';
  const unionBankRegex = 'A\\/c\\s*[*]?([a-zA-Z0-9]+)\\s*Credited\\s+for\\s*(?:Rs\\.?:?|INR|₹)?\\s*([0-9,.]+)\\s*on\\s*([0-9-]{10})\\s*by\\s*UPI\\s*ref\\s*no\\s*([0-9]+)';

  // 1. Actual Union Bank SMS format extraction
  test('1. Actual Union Bank SMS format extracts 100 paise, UTR 123456789012, suffix 0562, and timestamp without balance confusion', () => {
    const approvedTemplate: EvidenceTemplate = {
      id: 'tmpl_union_android_1',
      merchantId,
      bankAccountId: 'ba_union_0562',
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      senderIdentifier: 'com.google.android.apps.messaging',
      name: 'Union Bank SMS Template',
      regexPattern: unionBankRegex,
      fieldsMap: {
        accountExtractor: '1',
        amountPaiseExtractor: '2',
        transactionTimestampExtractor: '3',
        utrExtractor: '4'
      },
      samplePayload: unionBankSms,
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const extracted = TemplateManager.matchAndExtract(approvedTemplate, unionBankSms);
    assert.ok(extracted, 'Template must match Union Bank SMS text');
    assert.strictEqual(extracted.amountPaise, 100, 'Must extract 100 integer paise (Rs. 1.00), not Avl Bal 1090.03');
    assert.strictEqual(extracted.amountRupees, '1.00');
    assert.strictEqual(extracted.utr, '123456789012');
    assert.strictEqual(extracted.accountIdentifier, '0562');
    assert.ok(extracted.transactionTimestamp instanceof Date);
    assert.strictEqual(extracted.transactionTimestamp.getFullYear(), 2026);
    assert.strictEqual(extracted.transactionTimestamp.getMonth(), 10); // November (0-indexed 10)
    assert.strictEqual(extracted.transactionTimestamp.getDate(), 17);
  });

  // 2. Debit alerts rejected
  test('2. Debit notifications are classified as DEBIT and rejected', () => {
    const debitSms = 'A/c *0562 Debited for Rs:500.00 on 17-11-2026 by UPI ref no 998877665544 Avl Bal Rs:590.03.';
    const structured = TemplateManager.extractStructuredLabels(debitSms);

    assert.strictEqual(structured.transactionType, TransactionType.DEBIT);
    assert.strictEqual(structured.amountPaise, 50000);
    assert.strictEqual(structured.utr, '998877665544');
    assert.strictEqual(structured.accountIdentifier, 'XX0562');
  });

  // 3. Unknown notification format requires review
  test('3. Unknown notification format with no approved template returns null on match and requires review', () => {
    const approvedTemplates: EvidenceTemplate[] = [
      {
        id: 'tmpl_sbi',
        merchantId,
        channel: EvidenceChannel.ANDROID,
        senderIdentifier: 'sbi.bank',
        name: 'SBI Template',
        regexPattern: 'SBI Alert: Rs ([0-9,.]+) credited',
        fieldsMap: { amountPaiseExtractor: '1' },
        version: 1,
        status: TemplateLifecycleStatus.APPROVED,
        isImmutable: true,
        history: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Notification from unknown format (Kotak Bank alert)
    const unknownSms = 'Kotak Bank: Rs 250 received via UPI Ref 112233445566 to A/c 9999.';
    const resolved = TemplateManager.resolveTemplate(
      approvedTemplates,
      'com.google.android.apps.messaging',
      'KOTAKB',
      unknownSms
    );

    assert.strictEqual(resolved, null, 'Unapproved/unknown notification format must not resolve to any template');
  });

  // 4. Unapproved templates cannot extract trusted evidence
  test('4. Unapproved templates (PENDING_APPROVAL or DISCOVERED) cannot extract trusted evidence', () => {
    const pendingTemplate: EvidenceTemplate = {
      id: 'tmpl_pending',
      merchantId,
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'com.google.android.apps.messaging',
      name: 'Draft Union Bank Template',
      regexPattern: unionBankRegex,
      fieldsMap: {
        accountExtractor: '1',
        amountPaiseExtractor: '2',
        utrExtractor: '4'
      },
      version: 1,
      status: TemplateLifecycleStatus.PENDING_APPROVAL,
      isImmutable: false,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const extracted = TemplateManager.matchAndExtract(pendingTemplate, unionBankSms);
    assert.strictEqual(extracted, null, 'Unapproved template must strictly return null');
  });

  // 5. Merchant isolation
  test('5. Tenant isolation: Merchant B cannot access or match Merchant A templates', async () => {
    const repo = new InMemoryTemplateRepository();
    const manager = new TemplateManager(repo);

    // Merchant A creates and approves a template
    const tmplA = await manager.createTemplate('merchant_alpha', {
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'com.google.android.apps.messaging',
      name: 'Alpha Template',
      regexPattern: unionBankRegex,
      fieldsMap: { amountPaiseExtractor: '2' },
      samplePayload: unionBankSms
    });
    await manager.approveTemplate('merchant_alpha', tmplA.id, 1, 'user_alpha', 'Approved by alpha');

    // Merchant B lists templates -> Should be empty
    const merchantBTemplates = await manager.listTemplates('merchant_beta');
    assert.strictEqual(merchantBTemplates.length, 0);

    // Merchant B attempts to fetch Merchant A's template by ID -> Denied
    const fetched = await manager.getTemplateById('merchant_beta', tmplA.id);
    assert.strictEqual(fetched, null);
  });

  // 6. Bank account isolation and priority resolution
  test('6. Bank account isolation: Account-specific template takes precedence over generic template', () => {
    const genericTemplate: EvidenceTemplate = {
      id: 'tmpl_generic',
      merchantId,
      bankAccountId: null,
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: '*',
      name: 'Generic Android Template',
      regexPattern: '(?:Credited|received).*?(?:Rs\\.?|INR)?\\s*([0-9,.]+)',
      fieldsMap: { amountPaiseExtractor: '1' },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const unionSpecificTemplate: EvidenceTemplate = {
      id: 'tmpl_union_specific',
      merchantId,
      bankAccountId: 'ba_union_0562',
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'com.google.android.apps.messaging',
      name: 'Union Bank Account Specific Template',
      regexPattern: unionBankRegex,
      fieldsMap: {
        accountExtractor: '1',
        amountPaiseExtractor: '2',
        transactionTimestampExtractor: '3',
        utrExtractor: '4'
      },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const approvedList = [genericTemplate, unionSpecificTemplate];

    // When resolving with target bank account 'ba_union_0562':
    const resolution = TemplateManager.resolveTemplate(
      approvedList,
      'com.google.android.apps.messaging',
      'VM-UNIONB',
      unionBankSms,
      'ba_union_0562'
    );

    assert.ok(resolution);
    assert.strictEqual(resolution.matchedTemplate.id, 'tmpl_union_specific', 'Must prioritize account-specific template over generic');
    assert.strictEqual(resolution.extractedFields.utr, '123456789012');
  });

  // 7. Template Immutability & Version History on Update
  test('7. Editing an approved template creates version N+1 in PENDING_APPROVAL and archives previous version', async () => {
    const repo = new InMemoryTemplateRepository();
    const manager = new TemplateManager(repo);

    // 1. Create and approve version 1
    const created = await manager.createTemplate(merchantId, {
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'com.google.android.apps.messaging',
      name: 'Union Bank Template',
      regexPattern: unionBankRegex,
      fieldsMap: { amountPaiseExtractor: '2' },
      samplePayload: unionBankSms
    });
    const approvedV1 = await manager.approveTemplate(merchantId, created.id, 1, 'admin_user', 'Approved v1');
    assert.strictEqual(approvedV1.version, 1);
    assert.strictEqual(approvedV1.status, TemplateLifecycleStatus.APPROVED);

    // 2. Update regex pattern on approved template
    const updated = await manager.updateTemplate(merchantId, created.id, {
      regexPattern: 'New Pattern ([0-9]+)',
      fieldsMap: { amountPaiseExtractor: '1' },
      changeReason: 'Updated regex for bank format change'
    }, 'admin_user');

    // Must be incremented to version 2 and placed in PENDING_APPROVAL
    assert.strictEqual(updated.version, 2);
    assert.strictEqual(updated.status, TemplateLifecycleStatus.PENDING_APPROVAL);
    assert.strictEqual(updated.isImmutable, false);

    // History must contain archived version 1 with APPROVED status
    assert.ok(updated.history && updated.history.length >= 2);
    const archivedV1 = updated.history.filter((h) => h.version === 1 && h.status === TemplateLifecycleStatus.APPROVED);
    assert.ok(archivedV1.length >= 1, 'History must contain an approved version 1 entry');
  });

  // 8. Mandatory sample verification on template approval
  test('8. Approving a template with invalid sample text rejects with TEMPLATE_SAMPLE_VERIFICATION_FAILED', async () => {
    const repo = new InMemoryTemplateRepository();
    const manager = new TemplateManager(repo);

    const tmpl = await manager.createTemplate(merchantId, {
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'com.google.android.apps.messaging',
      name: 'Strict Template',
      regexPattern: 'A/c XX9999 Credited for Rs:([0-9.]+)',
      fieldsMap: { amountPaiseExtractor: '1' }
    });

    // Attempt approval with mismatching sample text
    await assert.rejects(
      async () => manager.approveTemplate(
        merchantId,
        tmpl.id,
        1,
        'admin_user',
        'Approve note',
        'Completely unrelated WhatsApp chat message'
      ),
      /TEMPLATE_SAMPLE_VERIFICATION_FAILED/
    );
  });

  // 9. Application-agnostic sender matching (Google Messages, Samsung Messages, SMS headers, Wildcards)
  test('9. Supports multiple SMS app packages and SMS headers via application-agnostic matching', () => {
    const template: EvidenceTemplate = {
      id: 'tmpl_header_match',
      merchantId,
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'VM-UNIONB', // Merchant configured the SMS sender header
      name: 'Union Bank SMS Header Template',
      regexPattern: unionBankRegex,
      fieldsMap: { amountPaiseExtractor: '2', utrExtractor: '4' },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Case A: Google Messages delivers with title 'VM-UNIONB'
    const matchA = TemplateManager.resolveTemplate(
      [template],
      'com.google.android.apps.messaging',
      'VM-UNIONB',
      unionBankSms
    );
    assert.ok(matchA, 'Must match when notificationTitle contains configured senderIdentifier');

    // Case B: Samsung Messages delivers with title 'VM-UNIONB'
    const matchB = TemplateManager.resolveTemplate(
      [template],
      'com.samsung.android.messaging',
      'VM-UNIONB',
      unionBankSms
    );
    assert.ok(matchB, 'Must match across different SMS applications');
  });

  // 10. Existing EMAIL and Gmail templates remain unaffected
  test('10. Existing EMAIL templates and Gmail matching remain completely independent from ANDROID templates', () => {
    const emailTemplate: EvidenceTemplate = {
      id: 'tmpl_email_union',
      merchantId,
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      senderIdentifier: 'alerts@unionbankofindia.bank',
      name: 'Union Bank Email Template',
      regexPattern: 'Account:.*Amount: Rs\\. ([0-9,.]+)',
      fieldsMap: { amountPaiseExtractor: '1' },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Resolving Android notification with Email template -> Must not match
    const androidMatch = TemplateManager.resolveTemplate(
      [emailTemplate],
      'com.google.android.apps.messaging',
      'VM-UNIONB',
      unionBankSms
    );
    assert.strictEqual(androidMatch, null, 'Android evidence must never resolve an EMAIL channel template');
  });

  // 11. Reproduction Fixture: Minimal regex extraction
  test('11. Reproduction Fixture — Minimal regex extracts account suffix 0562 and amount 1.71', () => {
    const fixtureBody = 'A/c *0562 Credited for Rs:1.71 on 19-11-2026 21:39:04 by Mob Bk ref no 632351257748 Avl Bal Rs:531.30.Never Share OTP/PIN/CVV-Union Bank of India';
    const minimalRegex = 'A/c\\s+\\*(\\d{4})\\s+Credited\\s+for\\s+Rs:\\s*([\\d.]+)';

    const template: EvidenceTemplate = {
      id: 'tmpl_fixture_min',
      merchantId,
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'VM-UNIONB',
      packageName: 'com.google.android.apps.messaging',
      senderHeader: 'VM-UNIONB',
      name: 'Union Bank Minimal Test Template',
      regexPattern: minimalRegex,
      fieldsMap: {
        accountExtractor: '1',
        amountPaiseExtractor: '2'
      },
      samplePayload: fixtureBody,
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const extracted = TemplateManager.matchAndExtract(template, fixtureBody);
    assert.ok(extracted, 'Minimal regex must match the reproduction fixture');
    assert.strictEqual(extracted.accountIdentifier, '0562', 'Group 1 must capture account suffix 0562');
    assert.strictEqual(extracted.amountRupees, '1.71', 'Group 2 must capture amount 1.71');
    assert.strictEqual(extracted.amountPaise, 171, 'Amount in paise must be exactly 171');
    assert.strictEqual(extracted.transactionType, TransactionType.CREDIT);
  });

  // 12. Reproduction Fixture: Full regex extraction of all 4 values
  test('12. Reproduction Fixture — Full regex extracts all four expected values (suffix, amount, timestamp, UTR)', () => {
    const fixtureBody = 'A/c *0562 Credited for Rs:1.71 on 19-11-2026 21:39:04 by Mob Bk ref no 632351257748 Avl Bal Rs:531.30.Never Share OTP/PIN/CVV-Union Bank of India';
    const fullRegex = 'A/c\\s+\\*(\\d{4})\\s+Credited\\s+for\\s+Rs:\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s+on\\s+(\\d{2}-\\d{2}-\\d{4}\\s+\\d{2}:\\d{2}:\\d{2}).*?ref\\s+no\\s+(\\d{12,})';

    const template: EvidenceTemplate = {
      id: 'tmpl_fixture_full',
      merchantId,
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'VM-UNIONB',
      packageName: 'com.google.android.apps.messaging',
      senderHeader: 'VM-UNIONB',
      name: 'Union Bank Full Test Template',
      regexPattern: fullRegex,
      fieldsMap: {
        accountExtractor: '1',
        amountPaiseExtractor: '2',
        transactionTimestampExtractor: '3',
        utrExtractor: '4'
      },
      samplePayload: fixtureBody,
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const extracted = TemplateManager.matchAndExtract(template, fixtureBody);
    assert.ok(extracted, 'Full regex must match the reproduction fixture');
    assert.strictEqual(extracted.accountIdentifier, '0562', 'Group 1 must capture account suffix 0562');
    assert.strictEqual(extracted.amountRupees, '1.71', 'Group 2 must capture amount 1.71');
    assert.strictEqual(extracted.amountPaise, 171, 'Amount in paise must be 171');
    assert.ok(extracted.transactionTimestamp instanceof Date, 'Group 3 must produce a Date instance');
    assert.strictEqual(extracted.transactionTimestamp.toISOString(), '2026-11-19T16:09:04.000Z', 'Timestamp must resolve to 19-11-2026 21:39:04 IST');
    assert.strictEqual(extracted.utr, '632351257748', 'Group 4 must capture UTR 632351257748');
    assert.strictEqual(extracted.transactionType, TransactionType.CREDIT);
  });

  // 13. Separate package name and SMS sender header handling
  test('13. Separate metadata fields for Android package name and SMS sender header are evaluated independently', () => {
    const template: EvidenceTemplate = {
      id: 'tmpl_separate_meta',
      merchantId,
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'VM-UNIONB',
      packageName: 'com.google.android.apps.messaging',
      senderHeader: 'VM-UNIONB',
      name: 'Strict Dual-Field SMS Template',
      regexPattern: 'A/c\\s+\\*(\\d{4})\\s+Credited\\s+for\\s+Rs:\\s*([\\d.]+)',
      fieldsMap: { accountExtractor: '1', amountPaiseExtractor: '2' },
      samplePayload: 'A/c *0562 Credited for Rs:1.71 on 19-11-2026 21:39:04 by Mob Bk ref no 632351257748 Avl Bal Rs:531.30.Never Share OTP/PIN/CVV-Union Bank of India',
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const body = template.samplePayload!;

    // A: Both match -> Success
    const matchSuccess = TemplateManager.resolveTemplate(
      [template],
      'com.google.android.apps.messaging',
      'VM-UNIONB',
      body
    );
    assert.ok(matchSuccess, 'Must match when both packageName and senderHeader match');

    // B: Package name matches but sender header is different -> Must NOT match
    const matchWrongHeader = TemplateManager.resolveTemplate(
      [template],
      'com.google.android.apps.messaging',
      'VK-HDFCBK',
      body
    );
    assert.strictEqual(matchWrongHeader, null, 'Must reject when sender header does not match');

    // C: Header matches but package name is different -> Must NOT match
    const matchWrongPkg = TemplateManager.resolveTemplate(
      [template],
      'com.unauthorized.malicious.app',
      'VM-UNIONB',
      body
    );
    assert.strictEqual(matchWrongPkg, null, 'Must reject when package name does not match');

    // D: Wildcard packageName with specific senderHeader -> Matches any package delivering that header
    const wildcardPkgTemplate: EvidenceTemplate = {
      ...template,
      packageName: '*',
      senderHeader: 'VM-UNIONB'
    };
    const matchAnyPkg = TemplateManager.resolveTemplate(
      [wildcardPkgTemplate],
      'com.samsung.android.messaging',
      'VM-UNIONB',
      body
    );
    assert.ok(matchAnyPkg, 'Wildcard package must match any messaging app delivering the specified header');
  });

  // 14. Failed patterns still cannot be approved (mandatory enforcement)
  test('14. Failed patterns still cannot be approved under any circumstances', async () => {
    const repo = new InMemoryTemplateRepository();
    const manager = new TemplateManager(repo);

    const fixtureBody = 'A/c *0562 Credited for Rs:1.71 on 19-11-2026 21:39:04 by Mob Bk ref no 632351257748 Avl Bal Rs:531.30.Never Share OTP/PIN/CVV-Union Bank of India';

    // Create a pending template with a non-matching pattern
    const created = await manager.createTemplate(merchantId, {
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'VM-UNIONB',
      packageName: 'com.google.android.apps.messaging',
      senderHeader: 'VM-UNIONB',
      name: 'Failing Pattern Template',
      regexPattern: 'COMPLETELY_NON_MATCHING_REGEX_PATTERN',
      fieldsMap: { amountPaiseExtractor: '1' },
      samplePayload: fixtureBody
    });

    // Approval must be rejected with TEMPLATE_SAMPLE_VERIFICATION_FAILED
    await assert.rejects(
      manager.approveTemplate(merchantId, created.id, 1, 'admin_user', 'Attempted approval', fixtureBody),
      /TEMPLATE_SAMPLE_VERIFICATION_FAILED: Template regex pattern did not match the provided sample text\./
    );
  });
});
