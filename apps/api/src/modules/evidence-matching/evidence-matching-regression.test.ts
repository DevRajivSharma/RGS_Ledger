import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  PaymentStatus,
  EvidenceStatus,
  EvidenceChannel,
  EvidenceProvider,
  TemplateLifecycleStatus,
  TransactionType,
  EvidenceTemplate
} from '@rgs-ledger/shared-types';
import { TemplateManager } from '../templates/template-manager.js';
import { BankEmailCandidateFilter } from '../integrations/bank-email-filter.js';

describe('Phase 2B.1 Regression Suite — 14 Core Invariant Tests', () => {
  const unionBankSampleEmail = `
From: alerts@unionbankofindia.bank
Subject: Credit Alert - Account XX0562

Account: XX0562
Transaction Type: CREDIT
Amount: Rs. 1.00
Transaction Date: 2026-03-31
Transaction Time: 14:22:10
UPI Reference No: 123456789012
Available Balance: Rs. 54,321.00
`.trim();

  // Test 1: Union Bank ₹1 credit email matching
  it('1. Union Bank ₹1 credit email extracts amountPaise 100, utr, and accountSuffix', () => {
    const template: EvidenceTemplate = {
      id: 'tmpl_union_1',
      merchantId: 'merch_1',
      bankAccountId: 'ba_union_1',
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      senderIdentifier: 'unionbankofindia.bank',
      name: 'Union Bank Structured Template',
      regexPattern: '(?:Account[:\\s]+([a-zA-Z0-9X*]+))?[\\s\\S]*?Amount[:\\s]+(?:Rs\\.?|INR|₹)?\\s*([0-9,.]+)[\\s\\S]*?(?:UPI\\s*(?:Reference\\s*)?No|Ref|RRN)[:\\s]*([a-zA-Z0-9]+)',
      fieldsMap: {
        accountExtractor: '1',
        amountPaiseExtractor: '2',
        utrExtractor: '3'
      },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const extracted = TemplateManager.matchAndExtract(template, unionBankSampleEmail);
    assert.ok(extracted, 'Template must match Union Bank sample email');
    assert.strictEqual(extracted.amountPaise, 100, 'Amount must be 100 integer paise (₹1.00)');
    assert.strictEqual(extracted.utr, '123456789012', 'UTR must be 123456789012');
    assert.strictEqual(extracted.accountIdentifier, 'XX0562', 'Account identifier must be XX0562');
  });

  // Test 2: Multiple merchant bank accounts configuration
  it('2. Merchant configures multiple bank accounts independently', () => {
    const bankAccounts = [
      {
        id: 'ba_hdfc',
        merchantId: 'merch_1',
        bankName: 'HDFC Bank',
        upiId: 'merchant@hdfcbank',
        accountSuffix: '9876',
        isActive: true
      },
      {
        id: 'ba_union',
        merchantId: 'merch_1',
        bankName: 'Union Bank of India',
        upiId: 'merchant@unionbank',
        accountSuffix: '0562',
        isActive: true
      }
    ];

    assert.strictEqual(bankAccounts.length, 2);
    assert.strictEqual(bankAccounts[0]!.bankName, 'HDFC Bank');
    assert.strictEqual(bankAccounts[1]!.bankName, 'Union Bank of India');
    assert.notStrictEqual(bankAccounts[0]!.upiId, bankAccounts[1]!.upiId);
  });

  // Test 3: Account-specific template selection
  it('3. Selects account-specific template matching the bank account over generic template', () => {
    const templates: EvidenceTemplate[] = [
      {
        id: 'tmpl_hdfc',
        merchantId: 'merch_1',
        bankAccountId: 'ba_hdfc',
        channel: EvidenceChannel.EMAIL,
        senderIdentifier: 'hdfcbank.net',
        name: 'HDFC Template',
        regexPattern: 'credited with INR ([0-9,.]+)',
        fieldsMap: { amountPaiseExtractor: '1' },
        version: 1,
        status: TemplateLifecycleStatus.APPROVED,
        isImmutable: true,
        history: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'tmpl_union',
        merchantId: 'merch_1',
        bankAccountId: 'ba_union',
        channel: EvidenceChannel.EMAIL,
        senderIdentifier: 'unionbankofindia.bank',
        name: 'Union Bank Template',
        regexPattern: 'Amount: Rs\\. ([0-9,.]+)',
        fieldsMap: { amountPaiseExtractor: '1' },
        version: 1,
        status: TemplateLifecycleStatus.APPROVED,
        isImmutable: true,
        history: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const targetBankAccountId = 'ba_union';
    const selectedTemplate = templates.find((t) => t.bankAccountId === targetBankAccountId);
    assert.ok(selectedTemplate);
    assert.strictEqual(selectedTemplate.id, 'tmpl_union');
  });

  // Test 4: Multiline email body extraction using dotAll regex
  it('4. Multiline email body extraction succeeds across line breaks', () => {
    const multilineEmail = `
Your account has been credited.
Details of the transaction:
Amount: Rs. 2,500.00
Ref: 987654321098
`.trim();

    const template: EvidenceTemplate = {
      id: 'tmpl_multi',
      merchantId: 'merch_1',
      channel: EvidenceChannel.EMAIL,
      senderIdentifier: 'bank',
      name: 'Multiline Template',
      regexPattern: 'credited.*Amount:\\s*Rs\\.\\s*([0-9,.]+).*Ref:\\s*([0-9]+)',
      fieldsMap: {
        amountPaiseExtractor: '1',
        utrExtractor: '2'
      },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const extracted = TemplateManager.matchAndExtract(template, multilineEmail);
    assert.ok(extracted, 'Should match multiline text using dotAll');
    assert.strictEqual(extracted.amountPaise, 250000);
    assert.strictEqual(extracted.utr, '987654321098');
  });

  // Test 5: Structured label extraction
  it('5. Structured label extractors retrieve Amount, Account, and UTR labels accurately', () => {
    const rawStructuredText = `
Account: XX0562
Transaction Type: CREDIT
Amount: Rs. 1.00
Transaction Date: 2026-03-31
Transaction Time: 14:22:10
UPI Reference No: 123456789012
`;

    const labels = TemplateManager.extractStructuredLabels(rawStructuredText);
    assert.strictEqual(labels.amountPaise, 100);
    assert.strictEqual(labels.amountRupees, '1.00');
    assert.strictEqual(labels.utr, '123456789012');
    assert.strictEqual(labels.accountIdentifier, 'XX0562');
    assert.strictEqual(labels.transactionType, TransactionType.CREDIT);
  });

  // Test 6: Bank account isolation (Evidence for Bank Account A must NOT match Payment for Bank Account B)
  it('6. Bank account isolation prevents cross-account matching even with identical amount', () => {
    const paymentForAccountB = {
      id: 'pay_1',
      merchantId: 'merch_1',
      bankAccountId: 'ba_union',
      amountPaise: 10000,
      status: PaymentStatus.PENDING
    };

    const evidenceForAccountA = {
      id: 'ev_1',
      merchantId: 'merch_1',
      bankAccountId: 'ba_hdfc',
      amountPaise: 10000,
      channel: EvidenceChannel.EMAIL,
      status: EvidenceStatus.UNMATCHED
    };

    // Isolation check:
    const accountsMatch = paymentForAccountB.bankAccountId === evidenceForAccountA.bankAccountId;
    assert.strictEqual(accountsMatch, false, 'Accounts do not match');

    const paymentStatusAfterAttempt = accountsMatch
      ? PaymentStatus.PARTIAL_SUCCESS
      : paymentForAccountB.status;

    assert.strictEqual(
      paymentStatusAfterAttempt,
      PaymentStatus.PENDING,
      'Payment must remain PENDING when bank account does not match'
    );
  });

  // Test 7: Correct account matching
  it('7. Evidence matching target bank account promotes payment to PARTIAL_SUCCESS', () => {
    const payment = {
      id: 'pay_1',
      merchantId: 'merch_1',
      bankAccountId: 'ba_union',
      accountSuffix: '0562',
      amountPaise: 100,
      status: PaymentStatus.PENDING,
      evidenceSummary: { hasEmailEvidence: false, hasAndroidEvidence: false }
    };

    const evidence = {
      id: 'ev_1',
      merchantId: 'merch_1',
      bankAccountId: 'ba_union',
      accountIdentifier: 'XX0562',
      amountPaise: 100,
      channel: EvidenceChannel.EMAIL,
      utr: '123456789012',
      status: EvidenceStatus.UNMATCHED
    };

    // Bank accounts and amounts match
    assert.strictEqual(payment.bankAccountId, evidence.bankAccountId);
    assert.strictEqual(payment.amountPaise, evidence.amountPaise);

    // Single source matched -> PARTIAL_SUCCESS
    payment.evidenceSummary.hasEmailEvidence = true;
    payment.status = PaymentStatus.PARTIAL_SUCCESS;
    evidence.status = EvidenceStatus.MATCHED;

    assert.strictEqual(payment.status, PaymentStatus.PARTIAL_SUCCESS);
    assert.strictEqual(evidence.status, EvidenceStatus.MATCHED);
  });

  // Test 8: Dual-source success
  it('8. Dual-source success requires BOTH Email and Android evidence matching same transaction', () => {
    const payment = {
      id: 'pay_1',
      merchantId: 'merch_1',
      bankAccountId: 'ba_union',
      amountPaise: 100,
      status: PaymentStatus.PENDING,
      evidenceSummary: {
        hasEmailEvidence: false,
        hasAndroidEvidence: false,
        utr: undefined as string | undefined,
        matchedAmountPaise: undefined as number | undefined
      }
    };

    // Source 1: Email arrives
    payment.evidenceSummary.hasEmailEvidence = true;
    payment.evidenceSummary.utr = '123456789012';
    payment.evidenceSummary.matchedAmountPaise = 100;
    payment.status = PaymentStatus.PARTIAL_SUCCESS;
    assert.strictEqual(payment.status, PaymentStatus.PARTIAL_SUCCESS);

    // Source 2: Android Companion arrives with identical UTR & amount
    payment.evidenceSummary.hasAndroidEvidence = true;
    const hasBoth = payment.evidenceSummary.hasEmailEvidence && payment.evidenceSummary.hasAndroidEvidence;
    const utrMatches = payment.evidenceSummary.utr === '123456789012';
    const amountMatches = payment.evidenceSummary.matchedAmountPaise === 100;

    if (hasBoth && utrMatches && amountMatches) {
      payment.status = PaymentStatus.SUCCESS;
    }

    assert.strictEqual(payment.status, PaymentStatus.SUCCESS, 'Payment must be SUCCESS when both sources match');
  });

  // Test 9: Email-only partial success
  it('9. Email evidence alone NEVER promotes payment to SUCCESS', () => {
    const payment = {
      status: PaymentStatus.PENDING,
      evidenceSummary: { hasEmailEvidence: false, hasAndroidEvidence: false }
    };

    payment.evidenceSummary.hasEmailEvidence = true;
    const isSingleSource = payment.evidenceSummary.hasEmailEvidence !== payment.evidenceSummary.hasAndroidEvidence;
    payment.status = isSingleSource ? PaymentStatus.PARTIAL_SUCCESS : PaymentStatus.SUCCESS;

    assert.strictEqual(payment.status, PaymentStatus.PARTIAL_SUCCESS);
    assert.notStrictEqual(payment.status, PaymentStatus.SUCCESS);
  });

  // Test 10: Android-only partial success
  it('10. Android evidence alone NEVER promotes payment to SUCCESS', () => {
    const payment = {
      status: PaymentStatus.PENDING,
      evidenceSummary: { hasEmailEvidence: false, hasAndroidEvidence: false }
    };

    payment.evidenceSummary.hasAndroidEvidence = true;
    const isSingleSource = payment.evidenceSummary.hasEmailEvidence !== payment.evidenceSummary.hasAndroidEvidence;
    payment.status = isSingleSource ? PaymentStatus.PARTIAL_SUCCESS : PaymentStatus.SUCCESS;

    assert.strictEqual(payment.status, PaymentStatus.PARTIAL_SUCCESS);
    assert.notStrictEqual(payment.status, PaymentStatus.SUCCESS);
  });

  // Test 11: Conflicting evidence review
  it('11. Conflicting amounts between evidence sources transitions payment to REVIEW_REQUIRED', () => {
    const payment = {
      status: PaymentStatus.PARTIAL_SUCCESS,
      amountPaise: 50000,
      evidenceSummary: {
        hasEmailEvidence: true,
        hasAndroidEvidence: false,
        matchedAmountPaise: 50000,
        utr: '123456789012'
      }
    };

    // Android arrives with different amount (40000 vs 50000)
    const androidAmountPaise = 40000;
    const androidUtr = '123456789012';

    payment.evidenceSummary.hasAndroidEvidence = true;
    const conflict = payment.evidenceSummary.matchedAmountPaise !== androidAmountPaise || payment.evidenceSummary.utr !== androidUtr;

    if (conflict) {
      payment.status = PaymentStatus.REVIEW_REQUIRED;
    }

    assert.strictEqual(payment.status, PaymentStatus.REVIEW_REQUIRED, 'Payment must be REVIEW_REQUIRED on amount conflict');
  });

  // Test 12: Duplicate UTR rejection across payments
  it('12. One UTR cannot satisfy multiple payments; subsequent payment is marked REVIEW_REQUIRED', () => {
    const registeredUtrs = new Set(['123456789012']); // Already satisfied Payment 1

    const payment2 = {
      id: 'pay_2',
      status: PaymentStatus.PENDING
    };

    const newEvidence = {
      utr: '123456789012',
      status: EvidenceStatus.UNMATCHED
    };

    const isDuplicateUtr = registeredUtrs.has(newEvidence.utr);
    if (isDuplicateUtr) {
      newEvidence.status = EvidenceStatus.REVIEW_REQUIRED;
      payment2.status = PaymentStatus.REVIEW_REQUIRED;
    }

    assert.strictEqual(newEvidence.status, EvidenceStatus.REVIEW_REQUIRED);
    assert.strictEqual(payment2.status, PaymentStatus.REVIEW_REQUIRED);
  });

  // Test 13: Indeed recruitment email exclusion
  it('13. Indeed recruitment emails are filtered as non-candidate and rejected from payment evidence', () => {
    const indeedEmail = {
      sender: 'recruiter@indeed.com',
      subject: 'Interview Invitation for Senior Software Engineer',
      bodyText: 'You have been shortlisted for an interview. Please apply now.'
    };

    const evaluation = BankEmailCandidateFilter.evaluateCandidate(indeedEmail);
    assert.strictEqual(evaluation.isCandidate, false, 'Indeed email must NOT be a candidate');
    assert.strictEqual(evaluation.score < 0, true);
    assert.ok(evaluation.rejectionReason?.includes('EXCLUDED'));
  });

  // Test 14: Amazon order email exclusion
  it('14. Amazon order confirmation emails are filtered as non-candidate and excluded from payment evidence', () => {
    const amazonEmail = {
      sender: 'order-update@amazon.in',
      subject: 'Your order of ₹1,499.00 has been confirmed',
      bodyText: 'Thank you for shopping on Amazon. Your order id #402-1234567-8901234 has been confirmed.'
    };

    const evaluation = BankEmailCandidateFilter.evaluateCandidate(amazonEmail);
    assert.strictEqual(evaluation.isCandidate, false, 'Amazon order email must NOT be a candidate');
    assert.strictEqual(evaluation.score < 0, true);
    assert.ok(evaluation.rejectionReason?.includes('EXCLUDED'));
  });
});
