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
  ITemplateRepository,
  CreateTemplateInput,
  TemplateFilter
} from './template-manager.js';

class MockLifecycleTemplateRepository implements ITemplateRepository {
  public templates: Map<string, any> = new Map();
  public evidenceRecords: Array<{ merchantId: string; templateId: string }> = [];
  private idCounter = 1;

  async create(merchantId: string, data: any): Promise<any> {
    const id = `tmpl_m_${this.idCounter++}`;
    const doc = {
      _id: id,
      id,
      merchantId,
      ...data,
      history: [...(data.history || [])],
      toObject() {
        return {
          ...this,
          history: [...this.history]
        };
      }
    };
    this.templates.set(`${merchantId}:${id}`, doc);
    return doc;
  }

  async findById(merchantId: string, templateId: string): Promise<any> {
    const doc = this.templates.get(`${merchantId}:${templateId}`);
    return doc ? { ...doc, history: [...doc.history] } : null;
  }

  async list(merchantId: string, filter?: TemplateFilter): Promise<any[]> {
    const list: any[] = [];
    for (const doc of this.templates.values()) {
      if (doc.merchantId === merchantId) {
        if (filter?.channel && doc.channel !== filter.channel) continue;
        if (filter?.status) {
          if (doc.status !== filter.status) continue;
        } else if (filter?.includeArchived !== true) {
          if (doc.status === TemplateLifecycleStatus.ARCHIVED || doc.isArchived) continue;
        }
        if (filter?.isActive !== undefined && Boolean(doc.isActive) !== filter.isActive) continue;
        if (filter?.bankAccountId && doc.bankAccountId !== filter.bankAccountId) continue;
        list.push({ ...doc, history: [...doc.history] });
      }
    }
    return list;
  }

  async findActive(merchantId: string, filter?: { channel?: EvidenceChannel; bankAccountId?: string }): Promise<any[]> {
    const list: any[] = [];
    for (const doc of this.templates.values()) {
      if (doc.merchantId === merchantId && doc.status === TemplateLifecycleStatus.APPROVED && doc.isActive === true && !doc.isArchived) {
        if (filter?.channel && doc.channel !== filter.channel) continue;
        if (filter?.bankAccountId && doc.bankAccountId !== filter.bankAccountId) continue;
        list.push(doc);
      }
    }
    return list;
  }

  async delete(merchantId: string, templateId: string): Promise<any> {
    const key = `${merchantId}:${templateId}`;
    const exists = this.templates.has(key);
    this.templates.delete(key);
    return { deletedCount: exists ? 1 : 0 };
  }

  async hasEvidenceDependencies(merchantId: string, templateId: string): Promise<boolean> {
    return this.evidenceRecords.some(
      (e) => e.merchantId === merchantId && e.templateId === templateId
    );
  }

  async save(templateDoc: any): Promise<any> {
    const doc = {
      ...templateDoc,
      history: [...(templateDoc.history || [])],
      toObject() {
        return { ...this, history: [...this.history] };
      }
    };
    this.templates.set(`${templateDoc.merchantId}:${templateDoc._id || templateDoc.id}`, doc);
    return doc;
  }
}

describe('Phase 5A.2 — Part B: Evidence Parser Reliability & Normalization', () => {
  test('1. Normalizes harmless whitespace, non-breaking spaces, and CRLF linebreaks without regex failure', () => {
    const pattern = 'A\\/c\\s*[*]?([a-zA-Z0-9]+)\\s*Credited\\s+for\\s*(?:Rs\\.?:?|INR|₹)?\\s*([0-9,.]+)\\s*on\\s*([0-9-]{10})\\s*by\\s*UPI\\s*ref\\s*no\\s*([0-9]+)';
    const template: EvidenceTemplate = {
      id: 'tmpl_norm_test',
      merchantId: 'mer_1',
      channel: EvidenceChannel.ANDROID,
      senderIdentifier: 'com.google.android.apps.messaging',
      name: 'Union Bank Pattern',
      regexPattern: pattern,
      fieldsMap: {
        accountExtractor: '1',
        amountPaiseExtractor: '2',
        transactionTimestampExtractor: '3',
        utrExtractor: '4'
      },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isActive: true,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Text variations with \u00A0 (non-breaking space), multiple spaces, \r\n Windows linebreaks, and zero-width spaces
    const variations = [
      // Variation A: Non-breaking space \u00A0 and multiple spaces
      'A/c\u00A0*0562\u00A0Credited\u00A0for\u00A0Rs:1.00\u00A0\u00A0on\u00A017-11-2026\u00A0by\u00A0UPI\u00A0ref\u00A0no\u00A0123456789012 Avl Bal Rs:1090.03.',
      // Variation B: CRLF Windows line breaks
      'A/c *0562 Credited for Rs:1.00\r\non 17-11-2026 by UPI ref no 123456789012\r\nAvl Bal Rs:1090.03.',
      // Variation C: Narrow non-breaking space \u202F and zero-width space \u200B
      'A/c\u200B *0562 Credited for\u202F Rs:1.00 on 17-11-2026 by UPI ref no 123456789012 Avl Bal Rs:1090.03.',
      // Variation D: Trailing spaces on each line
      'A/c *0562 Credited for Rs:1.00   \non 17-11-2026 by UPI ref no 123456789012   \nAvl Bal Rs:1090.03.'
    ];

    for (const v of variations) {
      const extracted = TemplateManager.matchAndExtract(template, v);
      assert.ok(extracted, `Failed to match notification variation: ${JSON.stringify(v)}`);
      assert.equal(extracted.amountPaise, 100);
      assert.equal(extracted.utr, '123456789012');
      assert.equal(extracted.accountIdentifier, '0562');
    }
  });

  test('2. Multi-bank structured label extraction supports major Indian bank notification formats', () => {
    // 1. Union Bank
    const unionSms = 'A/c *0562 Credited for Rs:1.00 on 17-11-2026 by UPI ref no 123456789012 Avl Bal Rs:1090.03.';
    const unionExt = TemplateManager.extractStructuredLabels(unionSms);
    assert.equal(unionExt.amountPaise, 100);
    assert.equal(unionExt.utr, '123456789012');
    assert.equal(unionExt.accountIdentifier, 'XX0562');
    assert.equal(unionExt.transactionType, TransactionType.CREDIT);

    // 2. HDFC Bank (Amount precedes credited, date has month name)
    const hdfcSms = 'Dear Customer, INR 500.00 credited to HDFC Bank A/c ending 1234 on 18-Nov-2026 by UPI (Ref No: 668387168541). Available Balance: INR 15,450.25.';
    const hdfcExt = TemplateManager.extractStructuredLabels(hdfcSms);
    assert.equal(hdfcExt.amountPaise, 50000);
    assert.equal(hdfcExt.utr, '668387168541');
    assert.equal(hdfcExt.accountIdentifier, 'XX1234');
    assert.equal(hdfcExt.transactionType, TransactionType.CREDIT);
    assert.ok(hdfcExt.transactionTimestamp instanceof Date);

    // 3. ICICI Bank (Info: UPI/UTR/Payment)
    const iciciSms = 'Dear Customer, Your Acct XX5678 is credited with Rs 2,500.00 on 19-11-2026. Info: UPI/123456789012/Payment. Avl Bal: Rs 45,200.00.';
    const iciciExt = TemplateManager.extractStructuredLabels(iciciSms);
    assert.equal(iciciExt.amountPaise, 250000);
    assert.equal(iciciExt.utr, '123456789012');
    assert.equal(iciciExt.accountIdentifier, 'XX5678');

    // 4. State Bank of India (SBI)
    const sbiSms = 'Your a/c no. XXXXXXXX1234 is credited by INR 750.00 on 19-11-2026 by a/c linked to UPI/DR/668387168541/Payment (Ref no 668387168541).';
    const sbiExt = TemplateManager.extractStructuredLabels(sbiSms);
    assert.equal(sbiExt.amountPaise, 75000);
    assert.equal(sbiExt.utr, '668387168541');
    assert.equal(sbiExt.accountIdentifier, 'XX1234');

    // 5. Kotak Mahindra Bank
    const kotakSms = 'Kotak Bank: Rs. 150.00 received in your A/c ending with 8765 on 20-11-2026 through UPI Ref No 668387168541.';
    const kotakExt = TemplateManager.extractStructuredLabels(kotakSms);
    assert.equal(kotakExt.amountPaise, 15000);
    assert.equal(kotakExt.utr, '668387168541');
    assert.equal(kotakExt.accountIdentifier, 'XX8765');

    // 6. Canara Bank
    const canaraSms = 'Your Canara Bank A/c ending 9876 has been Credited with Rs. 890.00 on 20-11-2026 by UPI Ref 668387168541. Total Bal Rs. 9,000.00.';
    const canaraExt = TemplateManager.extractStructuredLabels(canaraSms);
    assert.equal(canaraExt.amountPaise, 89000);
    assert.equal(canaraExt.utr, '668387168541');
    assert.equal(canaraExt.accountIdentifier, 'XX9876');

    // 7. Punjab National Bank (PNB)
    const pnbSms = 'A/c *4567 is credited with INR 120.00 on 20-11-2026 thru UPI: 668387168541. Avl Bal: INR 3,450.00.';
    const pnbExt = TemplateManager.extractStructuredLabels(pnbSms);
    assert.equal(pnbExt.amountPaise, 12000);
    assert.equal(pnbExt.utr, '668387168541');
    assert.equal(pnbExt.accountIdentifier, 'XX4567');
  });

  test('3. Strictly rejects DEBIT notifications and never treats debits as credit evidence', () => {
    const debitNotifications = [
      'Your A/c XX1234 is debited for Rs. 500.00 on 17-11-2026 by UPI Ref 123456789012.',
      'A/c *0562 Debited for Rs:100.00 on 17-11-2026 by UPI ref no 998877665544 Avl Bal Rs:990.03.',
      'Dear Customer, INR 350.00 debited from your A/c ending 4321 on 20-11-2026 to merchant@upi.'
    ];

    for (const text of debitNotifications) {
      const parsed = TemplateManager.extractStructuredLabels(text);
      assert.equal(parsed.transactionType, TransactionType.DEBIT, `Expected DEBIT for: ${text}`);
    }
  });

  test('4. Incomplete extraction without UTR or account is marked incomplete and never auto-matched', () => {
    const incompleteAlert = 'Amount: Rs. 500.00 received in your account.';
    const structured = TemplateManager.extractStructuredLabels(incompleteAlert);
    assert.equal(structured.amountPaise, 50000);
    assert.equal(structured.utr, undefined, 'Missing UTR must be undefined');
    assert.equal(structured.accountIdentifier, undefined, 'Missing account must be undefined');
  });
});

describe('Phase 5A.2 — Part C: Evidence Template Lifecycle Management', () => {
  const merchantA = 'mer_tenant_alpha';
  const merchantB = 'mer_tenant_bravo';
  const userId = 'usr_operator_1';

  const samplePattern = 'A\\/c\\s*[*]?([a-zA-Z0-9]+)\\s*Credited\\s+for\\s*Rs:([0-9.]+)\\s*on\\s*([0-9-]+)\\s*by\\s*UPI\\s*ref\\s*no\\s*([0-9]+)';
  const sampleText = 'A/c *0562 Credited for Rs:1.00 on 17-11-2026 by UPI ref no 123456789012 Avl Bal Rs:1090.03.';

  const baseTemplateInput: CreateTemplateInput = {
    channel: EvidenceChannel.ANDROID,
    provider: EvidenceProvider.ANDROID_COMPANION,
    bankAccountId: 'ba_axis_001',
    senderIdentifier: 'com.google.android.apps.messaging',
    packageName: 'com.google.android.apps.messaging',
    senderHeader: 'VM-UNIONB',
    name: 'Union Bank Alert Template',
    description: 'Ingests credit SMS from Union Bank of India',
    regexPattern: samplePattern,
    fieldsMap: {
      accountExtractor: '1',
      amountPaiseExtractor: '2',
      transactionTimestampExtractor: '3',
      utrExtractor: '4'
    },
    samplePayload: sampleText
  };

  test('1. Disable and reactivate an existing approved Email template', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    // 1. Create Email template
    const tmpl = await manager.createTemplate(merchantA, {
      ...baseTemplateInput,
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      senderIdentifier: 'alerts@bank.com'
    }, userId);

    // 2. Approve template v1
    const approved = await manager.approveTemplate(merchantA, tmpl.id, 1, userId, 'Initial approval');
    assert.equal(approved.status, TemplateLifecycleStatus.APPROVED);
    assert.equal(approved.isActive, true);

    // 3. Disable template
    const disabled = await manager.disableTemplate(merchantA, tmpl.id, userId, 'Temporary merchant maintenance');
    assert.equal(disabled.status, TemplateLifecycleStatus.DISABLED);
    assert.equal(disabled.isActive, false);

    // 4. Reactivate template without creating a duplicate
    const reactivated = await manager.reactivateTemplate(merchantA, tmpl.id, {
      userId,
      notes: 'Reactivated after bank maintenance'
    });
    assert.equal(reactivated.id, tmpl.id, 'Must reuse the exact same template ID');
    assert.equal(reactivated.version, 1, 'Must preserve original approved version');
    assert.equal(reactivated.status, TemplateLifecycleStatus.APPROVED);
    assert.equal(reactivated.isActive, true);
  });

  test('2. Disable and reactivate an existing approved Android template', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    const tmpl = await manager.createTemplate(merchantA, baseTemplateInput, userId);
    await manager.approveTemplate(merchantA, tmpl.id, 1, userId, 'Approved');

    // Disable
    const disabled = await manager.disableTemplate(merchantA, tmpl.id, userId, 'Switching companion phone');
    assert.equal(disabled.status, TemplateLifecycleStatus.DISABLED);
    assert.equal(disabled.isActive, false);

    // Reactivate
    const reactivated = await manager.reactivateTemplate(merchantA, tmpl.id, { userId });
    assert.equal(reactivated.status, TemplateLifecycleStatus.APPROVED);
    assert.equal(reactivated.isActive, true);
  });

  test('3. Reactivate without creating a duplicate template', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    const tmpl = await manager.createTemplate(merchantA, baseTemplateInput, userId);
    await manager.approveTemplate(merchantA, tmpl.id, 1, userId);
    await manager.disableTemplate(merchantA, tmpl.id, userId);

    // Reactivate
    await manager.reactivateTemplate(merchantA, tmpl.id, { userId });

    // Verify total template count for merchant remains exactly 1
    const allTemplates = await manager.listTemplates(merchantA);
    assert.equal(allTemplates.length, 1, 'Reactivation must not create duplicate template records');
    assert.equal(allTemplates[0]!.id, tmpl.id);
  });

  test('4. Prevent activation of pending or unapproved templates', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    // Template in PENDING_APPROVAL (never approved)
    const tmpl = await manager.createTemplate(merchantA, baseTemplateInput, userId);
    assert.equal(tmpl.status, TemplateLifecycleStatus.PENDING_APPROVAL);

    // Attempting to reactivate unapproved template must be rejected
    await assert.rejects(
      async () => {
        await manager.reactivateTemplate(merchantA, tmpl.id, { userId });
      },
      /CANNOT_REACTIVATE_UNAPPROVED_TEMPLATE/
    );
  });

  test('5. Conflicting active templates: detects conflict and provides safe switch workflow', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    // Create and approve Template 1 for Bank Account ba_axis_001
    const tmpl1 = await manager.createTemplate(merchantA, {
      ...baseTemplateInput,
      name: 'Template 1 (Primary)'
    }, userId);
    await manager.approveTemplate(merchantA, tmpl1.id, 1, userId);

    // Create, approve, then disable Template 2 for the same bank account ba_axis_001
    const tmpl2 = await manager.createTemplate(merchantA, {
      ...baseTemplateInput,
      name: 'Template 2 (Alternative)'
    }, userId);
    await manager.approveTemplate(merchantA, tmpl2.id, 1, userId);
    await manager.disableTemplate(merchantA, tmpl2.id, userId);

    // Make sure Template 1 is currently active
    const activeBefore = await manager.getTemplateById(merchantA, tmpl1.id);
    assert.equal(activeBefore?.isActive, true);

    // Attempting to reactivate Template 2 without switchConflicting raises 409 CONFLICTING_ACTIVE_TEMPLATE
    await assert.rejects(
      async () => {
        await manager.reactivateTemplate(merchantA, tmpl2.id, { switchConflicting: false });
      },
      (err: any) => {
        assert.equal(err.code, 'CONFLICTING_ACTIVE_TEMPLATE');
        return true;
      }
    );

    // Reactivating Template 2 with switchConflicting: true deactivates Template 1 and activates Template 2 atomically
    const reactivated2 = await manager.reactivateTemplate(merchantA, tmpl2.id, { switchConflicting: true, userId });
    assert.equal(reactivated2.isActive, true);
    assert.equal(reactivated2.status, TemplateLifecycleStatus.APPROVED);

    // Check Template 1: was deactivated automatically
    const tmpl1After = await manager.getTemplateById(merchantA, tmpl1.id);
    assert.equal(tmpl1After?.isActive, false);
    assert.equal(tmpl1After?.status, TemplateLifecycleStatus.DISABLED);
  });

  test('6. Merchant tenant isolation: Merchant B cannot view, modify, or reactivate Merchant A templates', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    const tmplA = await manager.createTemplate(merchantA, baseTemplateInput, userId);
    await manager.approveTemplate(merchantA, tmplA.id, 1, userId);
    await manager.disableTemplate(merchantA, tmplA.id, userId);

    // Merchant B attempts to fetch Merchant A template
    const notFound = await manager.getTemplateById(merchantB, tmplA.id);
    assert.equal(notFound, null, 'Merchant B cannot find Merchant A template');

    // Merchant B attempts to reactivate Merchant A template
    await assert.rejects(
      async () => {
        await manager.reactivateTemplate(merchantB, tmplA.id, { userId });
      },
      /Template not found or access denied/
    );

    // Merchant B attempts to archive Merchant A template
    await assert.rejects(
      async () => {
        await manager.archiveTemplate(merchantB, tmplA.id, userId);
      },
      /Template not found or access denied/
    );
  });

  test('7. Editing an approved template creates a new version in PENDING_APPROVAL and archives previous version in history', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    const tmpl = await manager.createTemplate(merchantA, baseTemplateInput, userId);
    await manager.approveTemplate(merchantA, tmpl.id, 1, userId);

    // Update regex pattern on approved template
    const newPattern = 'A\\/c\\s*[*]?([a-zA-Z0-9]+)\\s*Credited\\s+for\\s*Rs:([0-9.]+)\\s*on\\s*([0-9-]+)\\s*via\\s*UPI\\s*Ref\\s*([0-9]+)';
    const upgraded = await manager.updateTemplate(merchantA, tmpl.id, {
      regexPattern: newPattern,
      changeReason: 'Updated keyword from by to via'
    }, userId);

    assert.equal(upgraded.version, 2, 'Version must be incremented to 2');
    assert.equal(upgraded.status, TemplateLifecycleStatus.PENDING_APPROVAL, 'New version must be PENDING_APPROVAL');
    assert.equal(upgraded.isActive, false, 'Unapproved new version must not be active');

    // Check version history preserves v1
    const history = await manager.getVersionHistory(merchantA, tmpl.id);
    assert.ok(history.length >= 2);
    const v1 = history.find((h: any) => h.version === 1);
    assert.ok(v1);
    assert.equal(v1.regexPattern, samplePattern);
  });

  test('8. Historical evidence remains intact after archival; permanent delete is forbidden when evidence exists', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    const tmpl = await manager.createTemplate(merchantA, baseTemplateInput, userId);
    await manager.approveTemplate(merchantA, tmpl.id, 1, userId);

    // Simulate an evidence record that was extracted using this template
    repo.evidenceRecords.push({
      merchantId: merchantA,
      templateId: tmpl.id
    });

    // Attempting permanent deletion must be blocked
    await assert.rejects(
      async () => {
        await manager.deleteTemplate(merchantA, tmpl.id, userId);
      },
      /CANNOT_DELETE_TEMPLATE_WITH_DEPENDENCIES/
    );

    // Safe archival succeeds
    const archived = await manager.archiveTemplate(merchantA, tmpl.id, userId, 'Archived for audit compliance');
    assert.equal(archived.status, TemplateLifecycleStatus.ARCHIVED);
    assert.equal(archived.isArchived, true);
    assert.equal(archived.isActive, false);

    // Archived template cannot extract new evidence
    const matchAttempt = TemplateManager.matchAndExtract(archived, sampleText);
    assert.equal(matchAttempt, null, 'Archived template must never match new incoming evidence');

    // Restore archived template
    const restored = await manager.restoreTemplate(merchantA, tmpl.id, userId);
    assert.equal(restored.status, TemplateLifecycleStatus.DISABLED);
    assert.equal(restored.isArchived, false);
  });

  test('9. Reactivation works seamlessly after another template was temporarily used', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    // 1. Template A active
    const tmplA = await manager.createTemplate(merchantA, { ...baseTemplateInput, name: 'Template Alpha' }, userId);
    await manager.approveTemplate(merchantA, tmplA.id, 1, userId);

    // 2. Switch to Template B
    const tmplB = await manager.createTemplate(merchantA, { ...baseTemplateInput, name: 'Template Beta' }, userId);
    await manager.approveTemplate(merchantA, tmplB.id, 1, userId);
    await manager.disableTemplate(merchantA, tmplA.id, userId);

    let activeList = await repo.findActive(merchantA, { channel: EvidenceChannel.ANDROID });
    assert.equal(activeList[0]._id, tmplB.id);

    // 3. Switch back to Template A
    const reactivatedA = await manager.reactivateTemplate(merchantA, tmplA.id, { switchConflicting: true, userId });
    assert.equal(reactivatedA.isActive, true);

    activeList = await repo.findActive(merchantA, { channel: EvidenceChannel.ANDROID });
    assert.equal(activeList.length, 1);
    assert.equal(activeList[0]._id, tmplA.id);
  });

  test('10. Concurrent activation attempts are safely serialized without duplicate active states', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    const tmpl = await manager.createTemplate(merchantA, baseTemplateInput, userId);
    await manager.approveTemplate(merchantA, tmpl.id, 1, userId);
    await manager.disableTemplate(merchantA, tmpl.id, userId);

    // Run parallel reactivation calls
    const results = await Promise.allSettled([
      manager.reactivateTemplate(merchantA, tmpl.id, { userId }),
      manager.reactivateTemplate(merchantA, tmpl.id, { userId })
    ]);

    // At least one succeeded, and final state is cleanly active and approved
    const successes = results.filter((r) => r.status === 'fulfilled');
    assert.ok(successes.length >= 1);

    const finalState = await manager.getTemplateById(merchantA, tmpl.id);
    assert.equal(finalState?.status, TemplateLifecycleStatus.APPROVED);
    assert.equal(finalState?.isActive, true);
  });

  test('11. Existing template approval and extraction regressions: independent Android and Email channels', async () => {
    const repo = new MockLifecycleTemplateRepository();
    const manager = new TemplateManager(repo);

    // Android Template
    const androidTmpl = await manager.createTemplate(merchantA, baseTemplateInput, userId);
    await manager.approveTemplate(merchantA, androidTmpl.id, 1, userId);

    // Email Template for the same bank account
    const hdfcSample = 'HDFC Alert: INR 1,500.00 credited to A/c 1234 on 18-11-2026 UPI Ref 668387168541';
    const emailTmpl = await manager.createTemplate(merchantA, {
      ...baseTemplateInput,
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      senderIdentifier: 'alerts@hdfcbank.net',
      name: 'HDFC Email Template',
      regexPattern: 'HDFC Alert: INR ([0-9,.]+) credited to A\\/c ([0-9]+) on ([0-9-]+) UPI Ref ([0-9]+)',
      samplePayload: hdfcSample
    }, userId);
    await manager.approveTemplate(merchantA, emailTmpl.id, 1, userId);

    // Both should be independently active because their channels are different
    const activeAndroid = await repo.findActive(merchantA, { channel: EvidenceChannel.ANDROID });
    const activeEmail = await repo.findActive(merchantA, { channel: EvidenceChannel.EMAIL });

    assert.equal(activeAndroid.length, 1);
    assert.equal(activeAndroid[0]._id, androidTmpl.id);
    assert.equal(activeEmail.length, 1);
    assert.equal(activeEmail[0]._id, emailTmpl.id);

    // Disabling Android template does NOT disable Email template
    await manager.disableTemplate(merchantA, androidTmpl.id, userId);

    const activeAndroidAfter = await repo.findActive(merchantA, { channel: EvidenceChannel.ANDROID });
    const activeEmailAfter = await repo.findActive(merchantA, { channel: EvidenceChannel.EMAIL });

    assert.equal(activeAndroidAfter.length, 0, 'Android template should be disabled');
    assert.equal(activeEmailAfter.length, 1, 'Email template must remain active and unaffected');
  });
});
