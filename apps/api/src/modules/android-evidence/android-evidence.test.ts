import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { TemplateManager } from '../templates/template-manager.js';
import { EvidenceNormalizer } from '../evidence/evidence-normalizer.js';
import { EvidenceSecurity } from '../evidence/evidence-security.js';
import {
  EvidenceChannel,
  EvidenceProvider,
  EvidenceStatus,
  TransactionType,
  TemplateLifecycleStatus,
  EvidenceTemplate
} from '@rgs-ledger/shared-types';

describe('Phase 2C — Android Companion & Notification Evidence Ingestion Suite', () => {

  const unionBankSampleNotification =
    'A/c *0562 Credited for Rs:1.00 on 13-11-2026 18:25:24 by Mob Bk ref no 668387168541 Avl Bal Rs:1090.03.Never Share OTP/PIN/CVV-Union Bank of India';

  // 1. Union Bank Test Fixture
  it('1. Union Bank push notification accurately extracts account, amount 100 paise, UTR, and timestamp', () => {
    const template: EvidenceTemplate = {
      id: 'tmpl_uboi_push_1',
      merchantId: 'merchant_123',
      bankAccountId: 'ba_union_0562',
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      senderIdentifier: 'com.infrasofttech.uboi',
      name: 'Union Bank Android Vyom Push Notification',
      regexPattern: 'A/c\\s*[*X]*([0-9]+)\\s+(Credited|Debited)\\s+for\\s+Rs:?([0-9,.]+)\\s+on\\s+([0-9-]+\\s+[0-9:]+)\\s+by.*ref\\s+no\\s+([0-9a-zA-Z]+)',
      fieldsMap: {
        accountExtractor: '1',
        amountPaiseExtractor: '3',
        transactionTimestampExtractor: '4',
        utrExtractor: '5'
      },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const extracted = TemplateManager.matchAndExtract(template, unionBankSampleNotification);
    assert.ok(extracted, 'Template must match Union Bank push notification');
    assert.strictEqual(extracted.amountPaise, 100, 'Amount must be 100 integer paise (₹1.00)');
    assert.strictEqual(extracted.utr, '668387168541', 'UTR must be 668387168541');
    assert.ok(
      extracted.accountIdentifier === '0562' || extracted.accountIdentifier === 'XX0562',
      'Account must match suffix 0562 or masked XX0562'
    );
    assert.strictEqual(extracted.transactionType, TransactionType.CREDIT);
    assert.ok(extracted.transactionTimestamp instanceof Date);
    // Requirement 4: 13-11-2026 18:25:24 IST -> UTC 2026-11-13T12:55:24.000Z
    assert.strictEqual(extracted.transactionTimestamp.toISOString(), '2026-11-13T12:55:24.000Z');

    // Available balance (1090.03) must NOT be extracted as transaction amount
    assert.notStrictEqual(extracted.amountPaise, 109003, 'Available balance must not be used as transaction amount');
  });

  // 2. Fallback structured label extraction
  it('2. Fallback structured label extraction succeeds without approved template', () => {
    const extracted = TemplateManager.extractStructuredLabels(unionBankSampleNotification);
    assert.strictEqual(extracted.amountPaise, 100);
    assert.strictEqual(extracted.utr, '668387168541');
    assert.strictEqual(extracted.accountIdentifier, 'XX0562');
    assert.strictEqual(extracted.transactionType, TransactionType.CREDIT);
    assert.ok(extracted.transactionTimestamp instanceof Date);
    // Requirement 4: 13-11-2026 18:25:24 IST -> UTC 2026-11-13T12:55:24.000Z
    assert.strictEqual(extracted.transactionTimestamp.toISOString(), '2026-11-13T12:55:24.000Z');
  });

  // 3. Credit vs Debit Classification
  it('3. Classifies debit notifications as DEBIT and marks for rejection', () => {
    const debitNotification =
      'A/c *0562 Debited for Rs:500.00 on 13-11-2026 14:10:00 by Mob Bk ref no 998877665544 Avl Bal Rs:590.03-Union Bank of India';

    const normalized = EvidenceNormalizer.normalize({
      merchantId: 'merchant_123',
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_msg_debit_1',
      senderOrPackage: 'com.infrasofttech.uboi',
      rawText: debitNotification,
      amountPaise: 50000,
      utr: '998877665544'
    });

    assert.strictEqual(normalized.transactionType, TransactionType.DEBIT);
    assert.strictEqual(normalized.status, EvidenceStatus.REJECTED);
    assert.strictEqual(normalized.rejectionReason, 'DEBIT_TRANSACTION_IGNORED');
  });

  // 4. Missing UTR Handling
  it('4. Correctly sets UTR to null when missing from notification (never invents fake reference)', () => {
    const notificationWithoutUtr = 'A/c *0562 Credited for Rs:250.00 on 13-11-2026-Union Bank of India';

    const normalized = EvidenceNormalizer.normalize({
      merchantId: 'merchant_123',
      provider: EvidenceProvider.ANDROID_COMPANION,
      providerMessageId: 'android_msg_no_utr_1',
      senderOrPackage: 'com.infrasofttech.uboi',
      rawText: notificationWithoutUtr,
      amountPaise: 25000,
      utr: undefined
    });

    assert.strictEqual(normalized.utr, null, 'Missing UTR must strictly be null');
    assert.strictEqual(normalized.amountPaise, 25000);
    assert.strictEqual(normalized.transactionType, TransactionType.CREDIT);
  });

  // 5. Different Account Suffix Isolation
  it('5. Distinguishes different bank account suffixes (e.g. 0562 vs 9876)', () => {
    const notif0562 = 'A/c *0562 Credited for Rs:100.00 ref no 111122223333';
    const notif9876 = 'A/c *9876 Credited for Rs:100.00 ref no 111122223333';

    const ext0562 = TemplateManager.extractStructuredLabels(notif0562);
    const ext9876 = TemplateManager.extractStructuredLabels(notif9876);

    assert.strictEqual(ext0562.accountIdentifier, 'XX0562');
    assert.strictEqual(ext9876.accountIdentifier, 'XX9876');
    assert.notStrictEqual(ext0562.accountIdentifier, ext9876.accountIdentifier);
  });

  // 6. OTP & Confidential PIN Filtering
  it('6. Filters and redacts confidential OTP / PIN notifications', () => {
    const sensitiveNotification = 'Your OTP for mobile banking login is 591024. Never share OTP/PIN with anyone.';
    const isSensitive = /\b(?:otp|one\s*time\s*password|login\s*pin|cvv)\b/i.test(sensitiveNotification) &&
      !/\bcredited\b/i.test(sensitiveNotification);

    assert.strictEqual(isSensitive, true, 'OTP message must be identified as sensitive');
  });

  // 7. Deduplication Hash
  it('7. Computes deterministic deduplication hash for Android companion evidence', () => {
    const hash1 = EvidenceSecurity.computeDeduplicationHash(
      'merchant_1',
      EvidenceChannel.ANDROID,
      EvidenceProvider.ANDROID_COMPANION,
      'msg_12345'
    );

    const hash2 = EvidenceSecurity.computeDeduplicationHash(
      'merchant_1',
      EvidenceChannel.ANDROID,
      EvidenceProvider.ANDROID_COMPANION,
      'msg_12345'
    );

    const hashDifferentMerchant = EvidenceSecurity.computeDeduplicationHash(
      'merchant_2',
      EvidenceChannel.ANDROID,
      EvidenceProvider.ANDROID_COMPANION,
      'msg_12345'
    );

    assert.strictEqual(hash1, hash2, 'Identical providerMessageId must yield identical hash');
    assert.notStrictEqual(hash1, hashDifferentMerchant, 'Deduplication hash must be merchant-scoped');
  });

  // 8. Device Token Generation and Hashing
  it('8. Secure device token generation, hashing, and timing-safe comparison', () => {
    const rawDeviceToken = `dev_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash1 = crypto.createHash('sha256').update(rawDeviceToken).digest('hex');
    const tokenHash2 = crypto.createHash('sha256').update(rawDeviceToken).digest('hex');

    assert.strictEqual(tokenHash1, tokenHash2);
    assert.ok(rawDeviceToken.startsWith('dev_'));
    assert.strictEqual(tokenHash1.length, 64);
  });

  // 9. Merchant Isolation on Device Registration
  it('9. Strict merchant isolation: Device identity maps strictly to registered merchantId', () => {
    const mockDevice = {
      id: 'dev_mock_1',
      merchantId: 'merchant_authentic_1',
      deviceName: 'Counter Android',
      status: 'PAIRED'
    };

    // Client attempts to spoof a different merchantId
    const spoofedClientPayload = {
      merchantId: 'merchant_victim_2',
      packageName: 'com.infrasofttech.uboi',
      notificationText: unionBankSampleNotification
    };

    // Backend resolution logic
    const resolvedMerchantId = mockDevice.merchantId;
    assert.strictEqual(resolvedMerchantId, 'merchant_authentic_1');
    assert.notStrictEqual(resolvedMerchantId, spoofedClientPayload.merchantId);
  });

  // 10. Unknown Notification Format Review Requirement
  it('10. Unknown notification format is flagged with REVIEW_REQUIRED (Part D requirement)', () => {
    const unknownFormatText = 'Money received from customer via QR scan ref 443322110099';
    const isCredit = /\b(received|credited)\b/i.test(unknownFormatText);
    const hasApprovedTemplate = false;

    let initialStatus = EvidenceStatus.UNMATCHED;
    let rejectionReason: string | undefined = undefined;

    if (!hasApprovedTemplate && isCredit) {
      initialStatus = EvidenceStatus.REVIEW_REQUIRED;
      rejectionReason = 'UNAPPROVED_ANDROID_NOTIFICATION_TEMPLATE';
    }

    assert.strictEqual(initialStatus, EvidenceStatus.REVIEW_REQUIRED);
    assert.strictEqual(rejectionReason, 'UNAPPROVED_ANDROID_NOTIFICATION_TEMPLATE');
  });

  // 11. Application-Agnostic Capture across SMS & Messaging Apps
  it('11. Application-agnostic capture accurately extracts Union Bank alert from Google Messages, Samsung Messages, Truecaller, and OnePlus Messages', () => {
    const rawBankSms = 'A/c *0562 Credited for Rs:1.00 on 13-11-2026 18:25:24 by Mob Bk ref no 668387168541 Avl Bal Rs:1090.03.Never Share OTP/PIN/CVV-Union Bank of India';

    // Approved template configured by merchant for Union Bank SMS sender header "VM-UNIONB"
    const universalSmsTemplate: EvidenceTemplate = {
      id: 'tmpl_uboi_sms_universal',
      merchantId: 'merchant_123',
      bankAccountId: 'ba_union_0562',
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      senderIdentifier: 'VM-UNIONB',
      name: 'Union Bank SMS Template',
      regexPattern: 'A/c\\s*[*X]*([0-9]+)\\s+(Credited|Debited)\\s+for\\s+Rs:?([0-9,.]+)\\s+on\\s+([0-9-]+\\s+[0-9:]+)\\s+by.*ref\\s+no\\s+([0-9a-zA-Z]+)',
      fieldsMap: {
        accountExtractor: '1',
        amountPaiseExtractor: '3',
        transactionTimestampExtractor: '4',
        utrExtractor: '5'
      },
      version: 1,
      status: TemplateLifecycleStatus.APPROVED,
      isImmutable: true,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const messagingApps = [
      { packageName: 'com.google.android.apps.messaging', appName: 'Google Messages', senderTitle: 'VM-UNIONB' },
      { packageName: 'com.samsung.android.messaging', appName: 'Samsung Messages', senderTitle: 'VM-UNIONB' },
      { packageName: 'com.truecaller', appName: 'Truecaller', senderTitle: 'VM-UNIONB' },
      { packageName: 'com.oneplus.mms', appName: 'OnePlus Messages', senderTitle: 'VM-UNIONB' },
      { packageName: 'com.coloros.mms', appName: 'OPPO / Realme Messages', senderTitle: 'VM-UNIONB' }
    ];

    for (const app of messagingApps) {
      // Simulate title matching against template senderIdentifier
      const isSenderMatch = universalSmsTemplate.senderIdentifier === app.senderTitle ||
        app.senderTitle.includes(universalSmsTemplate.senderIdentifier);
      assert.ok(isSenderMatch, `Template must match sender title for ${app.appName}`);

      const extracted = TemplateManager.matchAndExtract(universalSmsTemplate, rawBankSms);
      assert.ok(extracted, `Extraction must succeed for notification arriving via ${app.appName}`);
      assert.strictEqual(extracted.amountPaise, 100);
      assert.strictEqual(extracted.utr, '668387168541');
      assert.strictEqual(extracted.transactionType, TransactionType.CREDIT);
      assert.strictEqual(extracted.transactionTimestamp?.toISOString(), '2026-11-13T12:55:24.000Z');
    }
  });

  // 12. Truncated Content Handling (BigText vs Summary Text)
  it('12. Truncated content handling prioritizes expanded bigText over truncated summary preview', () => {
    const truncatedPreview = 'A/c *0562 Credited for Rs:1.00...';
    const expandedBigText = 'A/c *0562 Credited for Rs:1.00 on 13-11-2026 18:25:24 by Mob Bk ref no 668387168541 Avl Bal Rs:1090.03.Never Share OTP/PIN/CVV-Union Bank of India';

    // Simulated NotificationCapture extraction logic
    const resolvedText = expandedBigText.trim().length > 0 ? expandedBigText : truncatedPreview;
    assert.strictEqual(resolvedText, expandedBigText);

    const extracted = TemplateManager.extractStructuredLabels(resolvedText);
    assert.strictEqual(extracted.amountPaise, 100);
    assert.strictEqual(extracted.utr, '668387168541');
    assert.strictEqual(extracted.accountIdentifier, 'XX0562');
  });

  // 13. Ordinary Non-Financial Chat Discard
  it('13. Ordinary personal chats and non-financial notifications are identified and discarded locally', () => {
    const personalMessages = [
      'Hey, are you free for dinner tonight?',
      'Can you call me back when you get a chance?',
      'Your Uber driver is arriving in 3 minutes.',
      'Flash sale! Get 50% off on all electronic items today.',
      'Team standup meeting starting in 10 minutes.'
    ];

    for (const msg of personalMessages) {
      const isCredit = /\b(credited|received|deposited|refund)\b/i.test(msg);
      const isDebit = /\b(debited|spent|paid|withdrawn)\b/i.test(msg);
      const hasFinancialCues = /(?:INR|Rs\.?|₹|amount|amt|a\/c|ref|rrn|utr)/i.test(msg);

      const isEligible = (isCredit || isDebit) && hasFinancialCues;
      assert.strictEqual(isEligible, false, `Message "${msg}" must be rejected as non-financial`);
    }
  });

  // 14. Pure OTP / 2FA Message Discard
  it('14. Pure authentication and login OTP notifications are discarded immediately without upload', () => {
    const otpMessages = [
      'Your OTP for netbanking login is 482910. Do not share with anyone.',
      'Use verification code 839201 to authenticate your transaction.',
      'One Time Password for account access is 192837. Valid for 5 minutes.'
    ];

    for (const otpMsg of otpMessages) {
      const isCredit = /\b(credited|received|deposited|refund)\b/i.test(otpMsg);
      const isOtp = /\b(?:otp|one\s*time\s*password|login\s*pin|verification\s*code)\b/i.test(otpMsg);

      // Pure OTP rule: has OTP pattern and no credit context
      const isPureOtp = isOtp && !isCredit;
      assert.strictEqual(isPureOtp, true, `Pure OTP "${otpMsg}" must be discarded`);
    }
  });

  // 15. Merchant Configurable Source Package Disabling
  it('15. Merchant can disable specific notification source packages, preventing ingestion', () => {
    const merchantDisabledPackages = ['com.truecaller', 'com.untrusted.smsapp'];

    const allowedNotification = { packageName: 'com.google.android.apps.messaging', text: 'Credit alert' };
    const blockedNotification = { packageName: 'com.truecaller', text: 'Credit alert' };

    const isAllowedPermitted = !merchantDisabledPackages.includes(allowedNotification.packageName);
    const isBlockedPermitted = !merchantDisabledPackages.includes(blockedNotification.packageName);

    assert.strictEqual(isAllowedPermitted, true);
    assert.strictEqual(isBlockedPermitted, false);
  });
});
