import {
  LedgerAccount,
  LedgerTransaction,
  LedgerEntry,
  ILedgerTransaction,
  ILedgerEntry
} from '../database/models';
import {
  JournalBatch,
  DoubleEntryLedger
} from '@rgs-ledger/payment-core';
import {
  LedgerEntryDirection,
  generateRandomId
} from '@rgs-ledger/shared';

export interface MerchantJournalItem extends ILedgerTransaction {
  entries: ILedgerEntry[];
}

export class LedgerService {
  /**
   * Commits a mathematically balanced double-entry journal batch
   */
  static async recordJournal(batch: JournalBatch): Promise<ILedgerTransaction> {
    // 1. Enforce mathematical double-entry balance: Debits === Credits
    DoubleEntryLedger.validateBalance(batch.entries);

    const transactionId = generateRandomId('ltx');

    const tx = await LedgerTransaction.create({
      _id: transactionId,
      merchantId: batch.merchantId,
      type: batch.transactionType,
      referenceId: batch.referenceId,
      currency: batch.currency || 'INR',
      description: `Journal for ${batch.transactionType} ref ${batch.referenceId}`
    });

    for (const entry of batch.entries) {
      const entryId = generateRandomId('len');

      await LedgerEntry.create({
        _id: entryId,
        transactionId,
        accountCode: entry.accountCode,
        direction: entry.direction,
        amountMinor: entry.amountMinor,
        description: entry.description
      });

      // Update or create account balance
      let account = await LedgerAccount.findOne({ code: entry.accountCode }).exec();
      if (!account) {
        account = await LedgerAccount.create({
          code: entry.accountCode,
          merchantId: batch.merchantId,
          name: entry.description,
          type: entry.accountType,
          currency: batch.currency || 'INR',
          balanceMinor: 0
        });
      }

      const isNormalCredit = ['LIABILITY', 'EQUITY', 'REVENUE'].includes(entry.accountType);
      
      let delta = entry.amountMinor;
      if (isNormalCredit) {
        delta = entry.direction === LedgerEntryDirection.CREDIT ? delta : -delta;
      } else {
        delta = entry.direction === LedgerEntryDirection.DEBIT ? delta : -delta;
      }

      account.balanceMinor += delta;
      await account.save();
    }

    return tx.toObject();
  }

  static async getMerchantBalance(merchantId: string): Promise<{ availablePaise: number; currency: string }> {
    const accountCode = `MERCHANT_PAYABLE_${merchantId}`;
    const account = await LedgerAccount.findOne({ code: accountCode }).exec();
    return {
      availablePaise: account ? account.balanceMinor : 0,
      currency: 'INR'
    };
  }

  static async getMerchantJournal(merchantId: string, limit: number = 50): Promise<MerchantJournalItem[]> {
    const txs = await LedgerTransaction.find({ merchantId }).sort({ createdAt: -1 }).limit(limit).lean();
    const txIds = txs.map(t => String(t._id));
    const entries = await LedgerEntry.find({ transactionId: { $in: txIds } }).lean();

    return txs.map((tx: any) => ({
      ...tx,
      entries: entries.filter((e: any) => String(e.transactionId) === String(tx._id))
    }));
  }
}
