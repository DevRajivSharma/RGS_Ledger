import {
  EvidenceProvider,
  EvidenceStatus,
  TransactionType,
  getEvidenceChannel,
  NormalizedEvidence
} from '@rgs-ledger/shared-types';
import { EvidenceSecurity } from './evidence-security.js';

export interface RawEvidenceInput {
  merchantId: string;
  provider: EvidenceProvider;
  providerMessageId: string;
  senderOrPackage: string;
  rawText: string;
  bankAccountId?: string | null;
  amountPaise?: number;
  amountRupees?: number | string;
  utr?: string | null;
  accountIdentifier?: string | null;
  transactionTimestamp?: Date | string | null;
  transactionType?: TransactionType;
  metadata?: Record<string, unknown>;
  templateId?: string;
  templateVersion?: number;
  initialStatus?: EvidenceStatus;
  rejectionReason?: string;
}

export class EvidenceNormalizer {
  /**
   * Normalizes an amount into integer paise.
   * Handles string rupees with commas (e.g. "1,250.50"), numeric rupees, or direct integer paise.
   */
  public static parseAmountPaise(amountPaise?: number, amountRupees?: number | string): number {
    if (typeof amountPaise === 'number' && Number.isInteger(amountPaise) && amountPaise > 0) {
      return amountPaise;
    }

    if (amountRupees !== undefined && amountRupees !== null) {
      const cleanStr = String(amountRupees).replace(/,/g, '').trim();
      const num = parseFloat(cleanStr);
      if (!isNaN(num) && num > 0) {
        return Math.round(num * 100);
      }
    }

    throw new Error('Invalid amount: Evidence must specify a positive amount in paise or rupees.');
  }

  /**
   * Standardizes UTR / RRN reference numbers.
   * NPCI / RBI UPI UTR is typically 12 characters (alphanumeric or numeric).
   * Missing or invalid references strictly return null (never invent a fake UTR).
   */
  public static normalizeUtr(rawUtr?: string | null): string | null {
    if (!rawUtr || typeof rawUtr !== 'string') {
      return null;
    }

    const clean = rawUtr.trim();
    // Validate against 10-22 character alphanumeric UTR standard
    const utrRegex = /^[a-zA-Z0-9]{10,22}$/;
    if (utrRegex.test(clean)) {
      return clean;
    }

    return null;
  }

  /**
   * Classifies transaction type (CREDIT vs DEBIT) based on text content and explicit hints.
   */
  public static classifyTransactionType(rawText: string, explicitType?: TransactionType): TransactionType {
    if (explicitType) {
      return explicitType;
    }

    const text = rawText.toLowerCase();

    // Check debit patterns
    const debitKeywords = ['debited', 'paid to', 'sent to', 'transferred to', 'withdrawn', 'spent'];
    const creditKeywords = ['credited', 'received', 'deposited', 'added to', 'refund'];

    const hasDebit = debitKeywords.some((kw) => text.includes(kw));
    const hasCredit = creditKeywords.some((kw) => text.includes(kw));

    if (hasDebit && !hasCredit) {
      return TransactionType.DEBIT;
    }

    return TransactionType.CREDIT;
  }

  /**
   * Main normalization method: converts raw provider inputs into a standardized NormalizedEvidence domain model.
   */
  public static normalize(input: RawEvidenceInput): NormalizedEvidence {
    if (!input.merchantId) {
      throw new Error('Merchant ID is mandatory for evidence normalization.');
    }
    if (!input.provider) {
      throw new Error('Evidence provider is mandatory.');
    }
    if (!input.providerMessageId) {
      throw new Error('Provider message ID is mandatory for deduplication.');
    }
    if (!input.senderOrPackage) {
      throw new Error('Sender identifier or Android package name is mandatory.');
    }

    const channel = getEvidenceChannel(input.provider);
    const amountPaise = this.parseAmountPaise(input.amountPaise, input.amountRupees);
    const utr = this.normalizeUtr(input.utr);
    const transactionType = this.classifyTransactionType(input.rawText, input.transactionType);

    // Compute hashes
    const rawPayloadHash = EvidenceSecurity.computeRawPayloadHash(input.rawText);
    const deduplicationHash = EvidenceSecurity.computeDeduplicationHash(
      input.merchantId,
      channel,
      input.provider,
      input.providerMessageId
    );

    // Encrypt raw payload at rest
    const encryptedRawPayload = EvidenceSecurity.encryptPayload(input.rawText);

    // Mask account identifier if provided; strictly null otherwise
    const accountIdentifier = input.accountIdentifier
      ? EvidenceSecurity.maskAccountNumber(input.accountIdentifier)
      : null;

    // Transaction timestamp: parse if available, otherwise null
    let transactionTimestamp: Date | null = null;
    if (input.transactionTimestamp) {
      const parsed = new Date(input.transactionTimestamp);
      if (!isNaN(parsed.getTime())) {
        transactionTimestamp = parsed;
      }
    }

    const now = new Date();

    // Determine initial evidence status
    let status = input.initialStatus || EvidenceStatus.NORMALIZED;
    let rejectionReason: string | undefined = input.rejectionReason;

    if (transactionType === TransactionType.DEBIT) {
      status = EvidenceStatus.REJECTED;
      rejectionReason = 'DEBIT_TRANSACTION_IGNORED';
    }

    return {
      id: '', // Generated on database persistence
      merchantId: input.merchantId,
      bankAccountId: input.bankAccountId || null,
      channel,
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      senderOrPackage: input.senderOrPackage,
      accountIdentifier,
      transactionType,
      amountPaise,
      currency: 'INR',
      utr,
      transactionTimestamp,
      receivedAt: now,
      status,
      rejectionReason,
      deduplicationHash,
      rawPayloadHash,
      encryptedRawPayload,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      metadata: input.metadata ? EvidenceSecurity.redactObject(input.metadata) : undefined,
      createdAt: now,
      updatedAt: now
    };
  }
}
