import {
  Settlement,
  ISettlement
} from '../database/models';
import {
  SettlementStatus,
  STANDARD_FEE_BPS,
  GST_RATE_BPS,
  calculateBasisPoints,
  addMinorUnits,
  subtractMinorUnits,
  generateRandomId
} from '@rgs-ledger/shared';
import { DoubleEntryLedger } from '@rgs-ledger/payment-core';
import { LedgerService } from './ledger.service';
import { enqueueWebhook } from '../queues/webhook-queue';

export class SettlementService {
  static async createSettlement(data: {
    merchantId: string;
    grossAmountMinor?: number;
  }): Promise<ISettlement> {
    const balance = await LedgerService.getMerchantBalance(data.merchantId);
    const gross = data.grossAmountMinor || Math.max(0, balance.availablePaise);

    if (gross <= 0) {
      const err: any = new Error('No unsettled balance available for payout.');
      err.status = 400;
      err.code = 'NO_UNSETTLED_BALANCE';
      throw err;
    }

    const feeAmount = calculateBasisPoints(gross, STANDARD_FEE_BPS);
    const taxAmount = calculateBasisPoints(feeAmount, GST_RATE_BPS);
    const totalDeductions = addMinorUnits(feeAmount, taxAmount);
    const netAmount = subtractMinorUnits(gross, totalDeductions);

    const settlementId = generateRandomId('set');
    const settlementRef = `SETTLE_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;

    const settlement = await Settlement.create({
      _id: settlementId,
      merchantId: data.merchantId,
      grossAmount: gross,
      feeAmount,
      taxAmount,
      netAmount,
      currency: 'INR',
      status: SettlementStatus.SETTLED,
      settlementReference: settlementRef,
      payoutDate: new Date(),
      bankAccountLast4: '8892'
    });

    // Record double-entry ledger payout journal
    const payoutJournal = DoubleEntryLedger.createSettlementPayoutJournal({
      merchantId: data.merchantId,
      settlementId: String(settlement._id),
      payoutAmountMinor: netAmount,
      currency: 'INR'
    });
    await LedgerService.recordJournal(payoutJournal);

    enqueueWebhook({
      merchantId: data.merchantId,
      event: 'settlement.processed',
      payload: {
        settlementId: String(settlement._id),
        reference: settlement.settlementReference,
        netAmount: settlement.netAmount,
        currency: settlement.currency,
        status: settlement.status
      }
    });

    return settlement;
  }

  static async listSettlements(params: { merchantId: string; page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const [settlements, total] = await Promise.all([
      Settlement.find({ merchantId: params.merchantId }).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Settlement.countDocuments({ merchantId: params.merchantId }).exec()
    ]);

    return {
      settlements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
