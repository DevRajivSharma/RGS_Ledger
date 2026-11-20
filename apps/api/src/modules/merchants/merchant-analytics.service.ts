import mongoose from 'mongoose';
import {
  PaymentStatus,
  EvidenceChannel,
  EvidenceStatus
} from '@rgs-ledger/shared-types';
import {
  MerchantAnalyticsSummaryDto,
  MerchantAnalyticsTimeseriesDto,
  MerchantAnalyticsTimeseriesItemDto
} from '@rgs-ledger/api-contracts';
import {
  PaymentRequestModel,
  PaymentEvidenceModel,
  ReconciliationCaseModel
} from '../../database/models.js';

export interface DateRange {
  start: Date;
  end: Date;
  timeframe: string;
}

export interface AnalyticsFilterParams {
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  status?: PaymentStatus;
  bankAccountId?: string;
  source?: 'ALL' | 'LINK' | 'DIRECT';
}

export interface ReportExportParams extends AnalyticsFilterParams {
  reportType?: 'payments' | 'evidence' | 'reconciliation' | 'daily_summary';
  format?: 'csv';
}

/**
 * Escapes a single CSV cell value to strictly prevent CSV / Excel Formula Injection (OWASP).
 * Prefixes with a single quote (') if the content begins with '=', '+', '-', '@', '\t', or '\r'.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '""';
  }
  let str = String(val);
  const trimmed = str.trimStart();
  if (
    trimmed.startsWith('=') ||
    trimmed.startsWith('+') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@') ||
    trimmed.startsWith('\t') ||
    trimmed.startsWith('\r')
  ) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Resolves standard date ranges with clean UTC / ISO boundaries.
 */
export function resolveDateRange(timeframe?: string, startDate?: string, endDate?: string): DateRange {
  const now = new Date();
  const tf = timeframe || '7d';

  if (tf === 'custom' && startDate) {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    // If end date doesn't specify time, set to end of day
    if (endDate && !endDate.includes('T')) {
      end.setUTCHours(23, 59, 59, 999);
    }
    return {
      start: isNaN(start.getTime()) ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) : start,
      end: isNaN(end.getTime()) ? now : end,
      timeframe: 'custom'
    };
  }

  if (tf === 'today') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { start, end, timeframe: 'today' };
  }

  if (tf === 'yesterday') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const start = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 23, 59, 59, 999));
    return { start, end, timeframe: 'yesterday' };
  }

  if (tf === '30d') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, end: now, timeframe: '30d' };
  }

  // Default '7d'
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end: now, timeframe: '7d' };
}

export interface IMerchantAnalyticsRepository {
  aggregatePayments(pipeline: any[]): Promise<any[]>;
  aggregateEvidence(pipeline: any[]): Promise<any[]>;
  aggregateReconciliation(pipeline: any[]): Promise<any[]>;
  findPaymentsForExport(filter: any): Promise<any[]>;
  findEvidenceForExport(filter: any): Promise<any[]>;
  findReconciliationForExport(filter: any): Promise<any[]>;
}

export class MongoMerchantAnalyticsRepository implements IMerchantAnalyticsRepository {
  async aggregatePayments(pipeline: any[]): Promise<any[]> {
    return PaymentRequestModel.aggregate(pipeline).exec();
  }

  async aggregateEvidence(pipeline: any[]): Promise<any[]> {
    return PaymentEvidenceModel.aggregate(pipeline).exec();
  }

  async aggregateReconciliation(pipeline: any[]): Promise<any[]> {
    return ReconciliationCaseModel.aggregate(pipeline).exec();
  }

  async findPaymentsForExport(filter: any): Promise<any[]> {
    return PaymentRequestModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean()
      .exec();
  }

  async findEvidenceForExport(filter: any): Promise<any[]> {
    return PaymentEvidenceModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean()
      .exec();
  }

  async findReconciliationForExport(filter: any): Promise<any[]> {
    return ReconciliationCaseModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean()
      .exec();
  }
}

export class MerchantAnalyticsService {
  constructor(private repo: IMerchantAnalyticsRepository = new MongoMerchantAnalyticsRepository()) {}

  /**
   * Build the MongoDB match filter for payments scoped to a specific merchant.
   */
  private buildPaymentMatch(merchantId: string, range: DateRange, filters: AnalyticsFilterParams): any {
    const match: any = {
      merchantId: mongoose.isValidObjectId(merchantId) ? new mongoose.Types.ObjectId(merchantId) : merchantId,
      createdAt: { $gte: range.start, $lte: range.end }
    };

    if (filters.status) {
      match.status = filters.status;
    }

    if (filters.bankAccountId && filters.bankAccountId !== 'ALL' && mongoose.isValidObjectId(filters.bankAccountId)) {
      match.bankAccountId = new mongoose.Types.ObjectId(filters.bankAccountId);
    }

    if (filters.source === 'LINK') {
      match.paymentLinkRef = { $exists: true, $ne: null };
    } else if (filters.source === 'DIRECT') {
      match.$or = [{ paymentLinkRef: { $exists: false } }, { paymentLinkRef: null }];
    }

    return match;
  }

  /**
   * Compute aggregate KPI summary strictly isolated to the authenticated merchant.
   */
  async getAnalyticsSummary(
    merchantId: string,
    filters: AnalyticsFilterParams = {}
  ): Promise<MerchantAnalyticsSummaryDto> {
    const range = resolveDateRange(filters.timeframe, filters.startDate, filters.endDate);
    const match = this.buildPaymentMatch(merchantId, range, filters);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalPaymentRequests: { $sum: 1 },
          totalAmountRequestedPaise: { $sum: '$amountPaise' },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.SUCCESS] }, 1, 0] }
          },
          successAmountPaise: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.SUCCESS] }, '$amountPaise', 0] }
          },
          partialSuccessCount: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.PARTIAL_SUCCESS] }, 1, 0] }
          },
          partialSuccessAmountPaise: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.PARTIAL_SUCCESS] }, '$amountPaise', 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.PENDING] }, 1, 0] }
          },
          pendingAmountPaise: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.PENDING] }, '$amountPaise', 0] }
          },
          reviewRequiredCount: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.REVIEW_REQUIRED] }, 1, 0] }
          },
          reconciliationRequiredCount: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.RECONCILIATION_REQUIRED] }, 1, 0] }
          },
          expiredCount: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.EXPIRED] }, 1, 0] }
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.CANCELLED] }, 1, 0] }
          },
          totalMatchingTimeSeconds: {
            $sum: {
              $cond: [
                { $eq: ['$status', PaymentStatus.SUCCESS] },
                {
                  $divide: [
                    {
                      $subtract: [
                        { $ifNull: ['$evidenceSummary.verifiedAt', '$updatedAt'] },
                        '$createdAt'
                      ]
                    },
                    1000
                  ]
                },
                0
              ]
            }
          }
        }
      }
    ];

    const results = await this.repo.aggregatePayments(pipeline);
    const agg = results[0] || {};

    const totalPaymentRequests = agg.totalPaymentRequests || 0;
    const totalAmountRequestedPaise = agg.totalAmountRequestedPaise || 0;
    const successCount = agg.successCount || 0;
    const successAmountPaise = agg.successAmountPaise || 0;
    const partialSuccessCount = agg.partialSuccessCount || 0;
    const partialSuccessAmountPaise = agg.partialSuccessAmountPaise || 0;
    const pendingCount = agg.pendingCount || 0;
    const pendingAmountPaise = agg.pendingAmountPaise || 0;
    const reviewRequiredCount = agg.reviewRequiredCount || 0;
    const reconciliationRequiredCount = agg.reconciliationRequiredCount || 0;
    const expiredCount = agg.expiredCount || 0;
    const cancelledCount = agg.cancelledCount || 0;

    const evidenceMatchingRate =
      totalPaymentRequests > 0
        ? Number(((successCount / totalPaymentRequests) * 100).toFixed(1))
        : 0;

    const averageEvidenceMatchingTimeSeconds =
      successCount > 0
        ? Math.max(0, Math.round(agg.totalMatchingTimeSeconds / successCount))
        : 0;

    return {
      totalPaymentRequests,
      totalAmountRequestedPaise,
      totalAmountRequestedRupees: totalAmountRequestedPaise / 100,
      successCount,
      successAmountPaise,
      successAmountRupees: successAmountPaise / 100,
      partialSuccessCount,
      partialSuccessAmountPaise,
      partialSuccessAmountRupees: partialSuccessAmountPaise / 100,
      pendingCount,
      pendingAmountPaise,
      pendingAmountRupees: pendingAmountPaise / 100,
      reviewRequiredCount,
      reconciliationRequiredCount,
      expiredCount,
      cancelledCount,
      evidenceMatchingRate,
      averageEvidenceMatchingTimeSeconds,
      timeframe: range.timeframe,
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString()
    };
  }

  /**
   * Compute daily time series buckets across Payments, Evidence (Email vs Android), and Reconciliation cases.
   */
  async getTimeseries(
    merchantId: string,
    filters: AnalyticsFilterParams = {}
  ): Promise<MerchantAnalyticsTimeseriesDto> {
    const range = resolveDateRange(filters.timeframe, filters.startDate, filters.endDate);
    const paymentMatch = this.buildPaymentMatch(merchantId, range, filters);

    // 1. Payment Requests aggregate
    const paymentPipeline = [
      { $match: paymentMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          paymentRequestsCount: { $sum: 1 },
          amountRequestedPaise: { $sum: '$amountPaise' },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.SUCCESS] }, 1, 0] }
          },
          successAmountPaise: {
            $sum: { $cond: [{ $eq: ['$status', PaymentStatus.SUCCESS] }, '$amountPaise', 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ];

    // 2. Evidence aggregate (excluding DUPLICATE evidence)
    const evidenceMatch: any = {
      merchantId: mongoose.isValidObjectId(merchantId) ? new mongoose.Types.ObjectId(merchantId) : merchantId,
      createdAt: { $gte: range.start, $lte: range.end },
      status: { $ne: EvidenceStatus.DUPLICATE }
    };
    if (filters.bankAccountId && filters.bankAccountId !== 'ALL' && mongoose.isValidObjectId(filters.bankAccountId)) {
      evidenceMatch.bankAccountId = new mongoose.Types.ObjectId(filters.bankAccountId);
    }

    const evidencePipeline = [
      { $match: evidenceMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          emailEvidenceCount: {
            $sum: { $cond: [{ $eq: ['$channel', EvidenceChannel.EMAIL] }, 1, 0] }
          },
          androidEvidenceCount: {
            $sum: { $cond: [{ $eq: ['$channel', EvidenceChannel.ANDROID] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ];

    // 3. Reconciliation cases aggregate
    const reconMatch: any = {
      merchantId: mongoose.isValidObjectId(merchantId) ? new mongoose.Types.ObjectId(merchantId) : merchantId,
      createdAt: { $gte: range.start, $lte: range.end }
    };
    if (filters.bankAccountId && filters.bankAccountId !== 'ALL' && mongoose.isValidObjectId(filters.bankAccountId)) {
      reconMatch.bankAccountId = new mongoose.Types.ObjectId(filters.bankAccountId);
    }

    const reconPipeline = [
      { $match: reconMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          reconciliationCasesCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const [paymentBuckets, evidenceBuckets, reconBuckets] = await Promise.all([
      this.repo.aggregatePayments(paymentPipeline),
      this.repo.aggregateEvidence(evidencePipeline),
      this.repo.aggregateReconciliation(reconPipeline)
    ]);

    const dailyMap = new Map<string, MerchantAnalyticsTimeseriesItemDto>();

    // Seed every day in the range
    const cur = new Date(range.start);
    while (cur <= range.end) {
      const dateStr = cur.toISOString().slice(0, 10);
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, {
          date: dateStr,
          paymentRequestsCount: 0,
          amountRequestedPaise: 0,
          amountRequestedRupees: 0,
          successCount: 0,
          successAmountPaise: 0,
          successAmountRupees: 0,
          emailEvidenceCount: 0,
          androidEvidenceCount: 0,
          reconciliationCasesCount: 0
        });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    // Merge payments
    for (const p of paymentBuckets) {
      const existing = dailyMap.get(p._id) || {
        date: p._id,
        paymentRequestsCount: 0,
        amountRequestedPaise: 0,
        amountRequestedRupees: 0,
        successCount: 0,
        successAmountPaise: 0,
        successAmountRupees: 0,
        emailEvidenceCount: 0,
        androidEvidenceCount: 0,
        reconciliationCasesCount: 0
      };
      existing.paymentRequestsCount = p.paymentRequestsCount || 0;
      existing.amountRequestedPaise = p.amountRequestedPaise || 0;
      existing.amountRequestedRupees = (p.amountRequestedPaise || 0) / 100;
      existing.successCount = p.successCount || 0;
      existing.successAmountPaise = p.successAmountPaise || 0;
      existing.successAmountRupees = (p.successAmountPaise || 0) / 100;
      dailyMap.set(p._id, existing);
    }

    // Merge evidence
    for (const e of evidenceBuckets) {
      const existing = dailyMap.get(e._id);
      if (existing) {
        existing.emailEvidenceCount = e.emailEvidenceCount || 0;
        existing.androidEvidenceCount = e.androidEvidenceCount || 0;
      }
    }

    // Merge reconciliation cases
    for (const r of reconBuckets) {
      const existing = dailyMap.get(r._id);
      if (existing) {
        existing.reconciliationCasesCount = r.reconciliationCasesCount || 0;
      }
    }

    const items = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      items,
      timeframe: range.timeframe,
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString()
    };
  }

  /**
   * Generates a fully escaped, sanitized CSV report with formulas and sensitive data neutralized.
   */
  async generateCsvReport(
    merchantId: string,
    params: ReportExportParams = {}
  ): Promise<{ filename: string; csv: string }> {
    const range = resolveDateRange(params.timeframe, params.startDate, params.endDate);
    const reportType = params.reportType || 'payments';
    const timestampStr = new Date().toISOString().slice(0, 10);

    if (reportType === 'payments') {
      const match = this.buildPaymentMatch(merchantId, range, params);
      const docs = await this.repo.findPaymentsForExport(match);

      const headers = [
        'Payment Reference',
        'Order ID',
        'Amount (INR)',
        'Status',
        'Bank Name',
        'Account Suffix',
        'UTR',
        'Email Evidence',
        'Android Evidence',
        'Created At',
        'Verified At'
      ];

      const rows = docs.map((d: any) => [
        escapeCsvCell(d.checkoutReference),
        escapeCsvCell(d.orderId),
        escapeCsvCell(((d.amountPaise || 0) / 100).toFixed(2)),
        escapeCsvCell(d.status),
        escapeCsvCell(d.bankName || 'Default'),
        escapeCsvCell(d.accountSuffix ? `***${d.accountSuffix}` : 'N/A'),
        escapeCsvCell(d.evidenceSummary?.utr || 'N/A'),
        escapeCsvCell(d.evidenceSummary?.hasEmailEvidence ? 'YES' : 'NO'),
        escapeCsvCell(d.evidenceSummary?.hasAndroidEvidence ? 'YES' : 'NO'),
        escapeCsvCell(d.createdAt ? new Date(d.createdAt).toISOString() : ''),
        escapeCsvCell(d.evidenceSummary?.verifiedAt ? new Date(d.evidenceSummary.verifiedAt).toISOString() : '')
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      return { filename: `rgs-report-payments-${timestampStr}.csv`, csv };
    }

    if (reportType === 'evidence') {
      const match: any = {
        merchantId: mongoose.isValidObjectId(merchantId) ? new mongoose.Types.ObjectId(merchantId) : merchantId,
        createdAt: { $gte: range.start, $lte: range.end }
      };
      if (params.bankAccountId && params.bankAccountId !== 'ALL' && mongoose.isValidObjectId(params.bankAccountId)) {
        match.bankAccountId = new mongoose.Types.ObjectId(params.bankAccountId);
      }
      const docs = await this.repo.findEvidenceForExport(match);

      const headers = [
        'Evidence ID',
        'Channel',
        'Provider',
        'Amount (INR)',
        'Status',
        'UTR',
        'Account Suffix',
        'Transaction Type',
        'Sender / Package',
        'Received At',
        'Matched Payment ID'
      ];

      const rows = docs.map((d: any) => [
        escapeCsvCell((d._id || d.id || '').toString()),
        escapeCsvCell(d.channel),
        escapeCsvCell(d.provider),
        escapeCsvCell(((d.amountPaise || 0) / 100).toFixed(2)),
        escapeCsvCell(d.status),
        escapeCsvCell(d.utr || 'N/A'),
        escapeCsvCell(d.accountIdentifier ? `***${String(d.accountIdentifier).slice(-4)}` : 'N/A'),
        escapeCsvCell(d.transactionType),
        escapeCsvCell(d.senderOrPackage || ''),
        escapeCsvCell(d.receivedAt || d.createdAt ? new Date(d.receivedAt || d.createdAt).toISOString() : ''),
        escapeCsvCell(d.matchedPaymentRequestId ? d.matchedPaymentRequestId.toString() : 'UNMATCHED')
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      return { filename: `rgs-report-evidence-${timestampStr}.csv`, csv };
    }

    if (reportType === 'reconciliation') {
      const match: any = {
        merchantId: mongoose.isValidObjectId(merchantId) ? new mongoose.Types.ObjectId(merchantId) : merchantId,
        createdAt: { $gte: range.start, $lte: range.end }
      };
      if (params.bankAccountId && params.bankAccountId !== 'ALL' && mongoose.isValidObjectId(params.bankAccountId)) {
        match.bankAccountId = new mongoose.Types.ObjectId(params.bankAccountId);
      }
      const docs = await this.repo.findReconciliationForExport(match);

      const headers = [
        'Case ID',
        'Case Type',
        'Severity',
        'Status',
        'Payment Reference',
        'UTR',
        'Expected Amount (INR)',
        'Received Amount (INR)',
        'Reason',
        'Resolution Notes',
        'Created At',
        'Resolved At'
      ];

      const rows = docs.map((d: any) => [
        escapeCsvCell((d._id || d.id || '').toString()),
        escapeCsvCell(d.caseType),
        escapeCsvCell(d.severity),
        escapeCsvCell(d.status),
        escapeCsvCell(d.checkoutReference || d.paymentRequestId?.toString() || 'N/A'),
        escapeCsvCell(d.utr || 'N/A'),
        escapeCsvCell(d.expectedAmountPaise != null ? (d.expectedAmountPaise / 100).toFixed(2) : 'N/A'),
        escapeCsvCell(d.receivedAmountPaise != null ? (d.receivedAmountPaise / 100).toFixed(2) : 'N/A'),
        escapeCsvCell(d.reason || ''),
        escapeCsvCell(d.resolutionNotes || ''),
        escapeCsvCell(d.createdAt ? new Date(d.createdAt).toISOString() : ''),
        escapeCsvCell(d.resolvedAt ? new Date(d.resolvedAt).toISOString() : '')
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      return { filename: `rgs-report-reconciliation-${timestampStr}.csv`, csv };
    }

    // Default: 'daily_summary'
    const timeseries = await this.getTimeseries(merchantId, params);
    const headers = [
      'Date',
      'Payment Requests Count',
      'Amount Requested (INR)',
      'Dual-Source Success Count',
      'Success Amount (INR)',
      'Email Evidence Count',
      'Android Evidence Count',
      'Reconciliation Cases Count'
    ];

    const rows = timeseries.items.map((item) => [
      escapeCsvCell(item.date),
      escapeCsvCell(item.paymentRequestsCount),
      escapeCsvCell(item.amountRequestedRupees.toFixed(2)),
      escapeCsvCell(item.successCount),
      escapeCsvCell(item.successAmountRupees.toFixed(2)),
      escapeCsvCell(item.emailEvidenceCount),
      escapeCsvCell(item.androidEvidenceCount),
      escapeCsvCell(item.reconciliationCasesCount)
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    return { filename: `rgs-report-daily-summary-${timestampStr}.csv`, csv };
  }
}

export const merchantAnalyticsService = new MerchantAnalyticsService();
