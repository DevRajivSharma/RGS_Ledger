import {
  LedgerAccountType,
  LedgerEntryDirection,
  LedgerTransactionType,
  STANDARD_FEE_BPS,
  GST_RATE_BPS,
  calculateBasisPoints,
  addMinorUnits,
  subtractMinorUnits
} from '@rgs-ledger/shared';

export interface UnbalancedLedgerErrorDetails {
  totalDebits: number;
  totalCredits: number;
  difference: number;
}

export class UnbalancedLedgerError extends Error {
  public details: UnbalancedLedgerErrorDetails;

  constructor(details: UnbalancedLedgerErrorDetails) {
    super(
      `Ledger journal is unbalanced! Total Debits (${details.totalDebits} paise) != Total Credits (${details.totalCredits} paise). Difference: ${details.difference} paise.`
    );
    this.name = 'UnbalancedLedgerError';
    this.details = details;
  }
}

export interface ProposedLedgerEntry {
  accountCode: string;
  accountType: LedgerAccountType;
  direction: LedgerEntryDirection;
  amountMinor: number;
  description: string;
}

export interface JournalBatch {
  transactionType: LedgerTransactionType;
  referenceId: string;
  merchantId: string;
  currency: string;
  entries: ProposedLedgerEntry[];
}

export class DoubleEntryLedger {
  /**
   * Asserts that a journal batch is mathematically balanced to the exact single minor unit (paise)
   */
  static validateBalance(entries: ProposedLedgerEntry[]): void {
    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of entries) {
      if (!Number.isInteger(entry.amountMinor) || entry.amountMinor <= 0) {
        throw new Error(`Invalid ledger entry amount: ${entry.amountMinor}. Must be positive integer paise.`);
      }

      if (entry.direction === LedgerEntryDirection.DEBIT) {
        totalDebits = addMinorUnits(totalDebits, entry.amountMinor);
      } else if (entry.direction === LedgerEntryDirection.CREDIT) {
        totalCredits = addMinorUnits(totalCredits, entry.amountMinor);
      } else {
        throw new Error(`Invalid direction: ${entry.direction}`);
      }
    }

    if (totalDebits !== totalCredits) {
      throw new UnbalancedLedgerError({
        totalDebits,
        totalCredits,
        difference: Math.abs(totalDebits - totalCredits)
      });
    }
  }

  /**
   * Builds balanced journal entries for a captured payment.
   * Total captured = Net merchant payable + Platform Fee + GST on fee.
   *
   * Journal:
   * Debit:  CLEARING_ACCOUNT (Total gross payment) [Asset]
   * Credit: MERCHANT_PAYABLE (Net amount payable to merchant) [Liability]
   * Credit: PLATFORM_FEE_REVENUE (Gateway service fee) [Revenue]
   * Credit: GST_PAYABLE (18% tax on service fee) [Liability]
   */
  static createPaymentCaptureJournal(params: {
    merchantId: string;
    paymentId: string;
    grossAmountMinor: number;
    feeBps?: number;
    gstBps?: number;
    currency?: string;
  }): JournalBatch {
    const gross = params.grossAmountMinor;
    const feeBps = params.feeBps ?? STANDARD_FEE_BPS;
    const gstBps = params.gstBps ?? GST_RATE_BPS;

    const baseFee = calculateBasisPoints(gross, feeBps);
    const gstAmount = calculateBasisPoints(baseFee, gstBps);
    const totalDeductions = addMinorUnits(baseFee, gstAmount);
    const netMerchantPayable = subtractMinorUnits(gross, totalDeductions);

    const entries: ProposedLedgerEntry[] = [
      {
        accountCode: `GATEWAY_CLEARING_${params.currency || 'INR'}`,
        accountType: LedgerAccountType.ASSET,
        direction: LedgerEntryDirection.DEBIT,
        amountMinor: gross,
        description: `Payment captured for ${params.paymentId}`
      },
      {
        accountCode: `MERCHANT_PAYABLE_${params.merchantId}`,
        accountType: LedgerAccountType.LIABILITY,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: netMerchantPayable,
        description: `Net payable to merchant for payment ${params.paymentId}`
      },
      {
        accountCode: 'PLATFORM_FEE_REVENUE',
        accountType: LedgerAccountType.REVENUE,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: baseFee,
        description: `Gateway fee for payment ${params.paymentId}`
      },
      {
        accountCode: 'TAX_GST_PAYABLE',
        accountType: LedgerAccountType.LIABILITY,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: gstAmount,
        description: `GST on fee for payment ${params.paymentId}`
      }
    ];

    // Assert mathematical balance
    this.validateBalance(entries);

    return {
      transactionType: LedgerTransactionType.PAYMENT_CAPTURE,
      referenceId: params.paymentId,
      merchantId: params.merchantId,
      currency: params.currency || 'INR',
      entries
    };
  }

  /**
   * Builds balanced journal entries for a processed refund.
   *
   * Journal:
   * Debit:  MERCHANT_PAYABLE (Merchant funds reversed) [Liability]
   * Credit: GATEWAY_CLEARING (Funds sent back to customer) [Asset]
   */
  static createRefundJournal(params: {
    merchantId: string;
    refundId: string;
    refundAmountMinor: number;
    currency?: string;
  }): JournalBatch {
    const amount = params.refundAmountMinor;

    const entries: ProposedLedgerEntry[] = [
      {
        accountCode: `MERCHANT_PAYABLE_${params.merchantId}`,
        accountType: LedgerAccountType.LIABILITY,
        direction: LedgerEntryDirection.DEBIT,
        amountMinor: amount,
        description: `Refund deduction for ${params.refundId}`
      },
      {
        accountCode: `GATEWAY_CLEARING_${params.currency || 'INR'}`,
        accountType: LedgerAccountType.ASSET,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: amount,
        description: `Refund payout to customer for ${params.refundId}`
      }
    ];

    this.validateBalance(entries);

    return {
      transactionType: LedgerTransactionType.PAYMENT_REFUND,
      referenceId: params.refundId,
      merchantId: params.merchantId,
      currency: params.currency || 'INR',
      entries
    };
  }

  /**
   * Builds balanced journal entries for a settlement payout to merchant bank account.
   *
   * Journal:
   * Debit:  MERCHANT_PAYABLE (Liability cleared) [Liability]
   * Credit: BANK_SETTLEMENT_ESCROW (Bank funds paid out) [Asset]
   */
  static createSettlementPayoutJournal(params: {
    merchantId: string;
    settlementId: string;
    payoutAmountMinor: number;
    currency?: string;
  }): JournalBatch {
    const amount = params.payoutAmountMinor;

    const entries: ProposedLedgerEntry[] = [
      {
        accountCode: `MERCHANT_PAYABLE_${params.merchantId}`,
        accountType: LedgerAccountType.LIABILITY,
        direction: LedgerEntryDirection.DEBIT,
        amountMinor: amount,
        description: `Settlement payout liability discharge for ${params.settlementId}`
      },
      {
        accountCode: 'BANK_SETTLEMENT_ESCROW',
        accountType: LedgerAccountType.ASSET,
        direction: LedgerEntryDirection.CREDIT,
        amountMinor: amount,
        description: `Bank nodal / clearing transfer for ${params.settlementId}`
      }
    ];

    this.validateBalance(entries);

    return {
      transactionType: LedgerTransactionType.MERCHANT_PAYOUT,
      referenceId: params.settlementId,
      merchantId: params.merchantId,
      currency: params.currency || 'INR',
      entries
    };
  }
}
