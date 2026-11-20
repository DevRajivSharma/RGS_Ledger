import { describe, it } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { PaymentStatus, EvidenceChannel, EvidenceStatus, EvidenceProvider } from '@rgs-ledger/shared-types';
import {
  MerchantAnalyticsService,
  IMerchantAnalyticsRepository,
  resolveDateRange,
  escapeCsvCell
} from './merchant-analytics.service.js';

class MockAnalyticsRepository implements IMerchantAnalyticsRepository {
  payments: any[] = [];
  evidence: any[] = [];
  reconciliation: any[] = [];

  async aggregatePayments(pipeline: any[]): Promise<any[]> {
    const match = pipeline[0]?.$match || {};
    let filtered = this.payments.filter((p) => {
      if (match.merchantId && p.merchantId.toString() !== match.merchantId.toString()) return false;
      if (match.status && p.status !== match.status) return false;
      if (match.bankAccountId && p.bankAccountId?.toString() !== match.bankAccountId.toString()) return false;
      if (match.paymentLinkRef) {
        if (match.paymentLinkRef.$exists === true && !p.paymentLinkRef) return false;
      }
      if (match.$or) {
        // Direct payments (no paymentLinkRef)
        if (p.paymentLinkRef) return false;
      }
      if (match.createdAt?.$gte && new Date(p.createdAt) < new Date(match.createdAt.$gte)) return false;
      if (match.createdAt?.$lte && new Date(p.createdAt) > new Date(match.createdAt.$lte)) return false;
      return true;
    });

    if (pipeline[1]?.$group) {
      const groupSpec = pipeline[1].$group;
      if (groupSpec._id === null) {
        // Summary aggregation
        let totalRequests = 0;
        let totalAmountPaise = 0;
        let successCount = 0;
        let successAmountPaise = 0;
        let partialSuccessCount = 0;
        let partialSuccessAmountPaise = 0;
        let pendingCount = 0;
        let pendingAmountPaise = 0;
        let reviewRequiredCount = 0;
        let reconciliationRequiredCount = 0;
        let expiredCount = 0;
        let cancelledCount = 0;
        let totalMatchingTimeSeconds = 0;

        for (const p of filtered) {
          totalRequests++;
          totalAmountPaise += p.amountPaise || 0;
          if (p.status === PaymentStatus.SUCCESS) {
            successCount++;
            successAmountPaise += p.amountPaise || 0;
            const verified = p.evidenceSummary?.verifiedAt ? new Date(p.evidenceSummary.verifiedAt).getTime() : new Date(p.updatedAt || p.createdAt).getTime();
            const created = new Date(p.createdAt).getTime();
            totalMatchingTimeSeconds += Math.max(0, (verified - created) / 1000);
          } else if (p.status === PaymentStatus.PARTIAL_SUCCESS) {
            partialSuccessCount++;
            partialSuccessAmountPaise += p.amountPaise || 0;
          } else if (p.status === PaymentStatus.PENDING) {
            pendingCount++;
            pendingAmountPaise += p.amountPaise || 0;
          } else if (p.status === PaymentStatus.REVIEW_REQUIRED) {
            reviewRequiredCount++;
          } else if (p.status === PaymentStatus.RECONCILIATION_REQUIRED) {
            reconciliationRequiredCount++;
          } else if (p.status === PaymentStatus.EXPIRED) {
            expiredCount++;
          } else if (p.status === PaymentStatus.CANCELLED) {
            cancelledCount++;
          }
        }

        return [
          {
            _id: null,
            totalPaymentRequests: totalRequests,
            totalAmountRequestedPaise: totalAmountPaise,
            successCount,
            successAmountPaise,
            partialSuccessCount,
            partialSuccessAmountPaise,
            pendingCount,
            pendingAmountPaise,
            reviewRequiredCount,
            reconciliationRequiredCount,
            expiredCount,
            cancelledCount,
            totalMatchingTimeSeconds
          }
        ];
      } else {
        // Group by date
        const dateMap = new Map<string, any>();
        for (const p of filtered) {
          const dStr = new Date(p.createdAt).toISOString().slice(0, 10);
          const entry = dateMap.get(dStr) || {
            _id: dStr,
            paymentRequestsCount: 0,
            amountRequestedPaise: 0,
            successCount: 0,
            successAmountPaise: 0
          };
          entry.paymentRequestsCount++;
          entry.amountRequestedPaise += p.amountPaise || 0;
          if (p.status === PaymentStatus.SUCCESS) {
            entry.successCount++;
            entry.successAmountPaise += p.amountPaise || 0;
          }
          dateMap.set(dStr, entry);
        }
        return Array.from(dateMap.values());
      }
    }

    return filtered;
  }

  async aggregateEvidence(pipeline: any[]): Promise<any[]> {
    const match = pipeline[0]?.$match || {};
    let filtered = this.evidence.filter((e) => {
      if (match.merchantId && e.merchantId.toString() !== match.merchantId.toString()) return false;
      if (match.status?.$ne && e.status === match.status.$ne) return false;
      if (match.bankAccountId && e.bankAccountId?.toString() !== match.bankAccountId.toString()) return false;
      if (match.createdAt?.$gte && new Date(e.createdAt) < new Date(match.createdAt.$gte)) return false;
      if (match.createdAt?.$lte && new Date(e.createdAt) > new Date(match.createdAt.$lte)) return false;
      return true;
    });

    const dateMap = new Map<string, any>();
    for (const e of filtered) {
      const dStr = new Date(e.createdAt).toISOString().slice(0, 10);
      const entry = dateMap.get(dStr) || {
        _id: dStr,
        emailEvidenceCount: 0,
        androidEvidenceCount: 0
      };
      if (e.channel === EvidenceChannel.EMAIL) {
        entry.emailEvidenceCount++;
      } else if (e.channel === EvidenceChannel.ANDROID) {
        entry.androidEvidenceCount++;
      }
      dateMap.set(dStr, entry);
    }
    return Array.from(dateMap.values());
  }

  async aggregateReconciliation(pipeline: any[]): Promise<any[]> {
    const match = pipeline[0]?.$match || {};
    let filtered = this.reconciliation.filter((r) => {
      if (match.merchantId && r.merchantId.toString() !== match.merchantId.toString()) return false;
      if (match.bankAccountId && r.bankAccountId?.toString() !== match.bankAccountId.toString()) return false;
      if (match.createdAt?.$gte && new Date(r.createdAt) < new Date(match.createdAt.$gte)) return false;
      if (match.createdAt?.$lte && new Date(r.createdAt) > new Date(match.createdAt.$lte)) return false;
      return true;
    });

    const dateMap = new Map<string, any>();
    for (const r of filtered) {
      const dStr = new Date(r.createdAt).toISOString().slice(0, 10);
      const entry = dateMap.get(dStr) || {
        _id: dStr,
        reconciliationCasesCount: 0
      };
      entry.reconciliationCasesCount++;
      dateMap.set(dStr, entry);
    }
    return Array.from(dateMap.values());
  }

  async findPaymentsForExport(filter: any): Promise<any[]> {
    return this.payments.filter((p) => {
      if (filter.merchantId && p.merchantId.toString() !== filter.merchantId.toString()) return false;
      if (filter.status && p.status !== filter.status) return false;
      if (filter.createdAt?.$gte && new Date(p.createdAt) < new Date(filter.createdAt.$gte)) return false;
      if (filter.createdAt?.$lte && new Date(p.createdAt) > new Date(filter.createdAt.$lte)) return false;
      return true;
    });
  }

  async findEvidenceForExport(filter: any): Promise<any[]> {
    return this.evidence.filter((e) => {
      if (filter.merchantId && e.merchantId.toString() !== filter.merchantId.toString()) return false;
      if (filter.createdAt?.$gte && new Date(e.createdAt) < new Date(filter.createdAt.$gte)) return false;
      if (filter.createdAt?.$lte && new Date(e.createdAt) > new Date(filter.createdAt.$lte)) return false;
      return true;
    });
  }

  async findReconciliationForExport(filter: any): Promise<any[]> {
    return this.reconciliation.filter((r) => {
      if (filter.merchantId && r.merchantId.toString() !== filter.merchantId.toString()) return false;
      if (filter.createdAt?.$gte && new Date(r.createdAt) < new Date(filter.createdAt.$gte)) return false;
      if (filter.createdAt?.$lte && new Date(r.createdAt) > new Date(filter.createdAt.$lte)) return false;
      return true;
    });
  }
}

describe('Phase 4A: Merchant Analytics & Reporting Service', () => {
  const merchant1Id = new mongoose.Types.ObjectId().toString();
  const merchant2Id = new mongoose.Types.ObjectId().toString();
  const bankAccount1Id = new mongoose.Types.ObjectId().toString();

  it('correctly resolves timeframe boundaries (today, yesterday, 7d, 30d, custom)', () => {
    const todayRange = resolveDateRange('today');
    assert.strictEqual(todayRange.timeframe, 'today');
    assert.strictEqual(todayRange.start.getUTCHours(), 0);
    assert.strictEqual(todayRange.end.getUTCHours(), 23);

    const yestRange = resolveDateRange('yesterday');
    assert.strictEqual(yestRange.timeframe, 'yesterday');
    assert.ok(yestRange.start < todayRange.start);

    const sevenDays = resolveDateRange('7d');
    assert.strictEqual(sevenDays.timeframe, '7d');
    const diffDays = Math.round((sevenDays.end.getTime() - sevenDays.start.getTime()) / (1000 * 3600 * 24));
    assert.strictEqual(diffDays, 7);

    const custom = resolveDateRange('custom', '2026-11-01T00:00:00Z', '2026-11-10T23:59:59Z');
    assert.strictEqual(custom.timeframe, 'custom');
    assert.strictEqual(custom.start.toISOString(), '2026-11-01T00:00:00.000Z');
  });

  it('computes accurate KPI metrics, paise-to-Rupees conversions, and matching rates', async () => {
    const repo = new MockAnalyticsRepository();
    const service = new MerchantAnalyticsService(repo);

    const now = new Date();
    // Payment 1: SUCCESS (100 INR = 10000 paise), verified 120s after creation
    repo.payments.push({
      _id: 'p1',
      merchantId: merchant1Id,
      orderId: 'ORD-101',
      amountPaise: 10000,
      status: PaymentStatus.SUCCESS,
      checkoutReference: 'chk_1',
      createdAt: new Date(now.getTime() - 1000 * 200).toISOString(),
      updatedAt: now.toISOString(),
      evidenceSummary: {
        hasEmailEvidence: true,
        hasAndroidEvidence: true,
        utr: 'UTR123456789012',
        verifiedAt: new Date(now.getTime() - 1000 * 80).toISOString() // 120s diff
      }
    });

    // Payment 2: PARTIAL_SUCCESS (50 INR = 5000 paise)
    repo.payments.push({
      _id: 'p2',
      merchantId: merchant1Id,
      orderId: 'ORD-102',
      amountPaise: 5000,
      status: PaymentStatus.PARTIAL_SUCCESS,
      checkoutReference: 'chk_2',
      createdAt: new Date(now.getTime() - 1000 * 300).toISOString(),
      evidenceSummary: {
        hasEmailEvidence: true,
        hasAndroidEvidence: false
      }
    });

    // Payment 3: PENDING (20 INR = 2000 paise)
    repo.payments.push({
      _id: 'p3',
      merchantId: merchant1Id,
      orderId: 'ORD-103',
      amountPaise: 2000,
      status: PaymentStatus.PENDING,
      checkoutReference: 'chk_3',
      createdAt: new Date(now.getTime() - 1000 * 400).toISOString()
    });

    // Payment 4: EXPIRED (10 INR = 1000 paise)
    repo.payments.push({
      _id: 'p4',
      merchantId: merchant1Id,
      orderId: 'ORD-104',
      amountPaise: 1000,
      status: PaymentStatus.EXPIRED,
      checkoutReference: 'chk_4',
      createdAt: new Date(now.getTime() - 1000 * 500).toISOString()
    });

    const summary = await service.getAnalyticsSummary(merchant1Id, { timeframe: '7d' });

    assert.strictEqual(summary.totalPaymentRequests, 4);
    assert.strictEqual(summary.totalAmountRequestedPaise, 18000);
    assert.strictEqual(summary.totalAmountRequestedRupees, 180);

    // Dual-source verified SUCCESS
    assert.strictEqual(summary.successCount, 1);
    assert.strictEqual(summary.successAmountPaise, 10000);
    assert.strictEqual(summary.successAmountRupees, 100);

    assert.strictEqual(summary.partialSuccessCount, 1);
    assert.strictEqual(summary.partialSuccessAmountPaise, 5000);
    assert.strictEqual(summary.partialSuccessAmountRupees, 50);

    assert.strictEqual(summary.pendingCount, 1);
    assert.strictEqual(summary.expiredCount, 1);

    // Evidence matching rate: 1 SUCCESS / 4 Total = 25%
    assert.strictEqual(summary.evidenceMatchingRate, 25);

    // Average time to dual-source match: 120 seconds
    assert.strictEqual(summary.averageEvidenceMatchingTimeSeconds, 120);
  });

  it('strictly enforces merchant tenant isolation (merchant A never sees merchant B data)', async () => {
    const repo = new MockAnalyticsRepository();
    const service = new MerchantAnalyticsService(repo);
    const now = new Date();

    // Merchant 1 payment
    repo.payments.push({
      _id: 'm1_p',
      merchantId: merchant1Id,
      orderId: 'ORD-M1',
      amountPaise: 50000,
      status: PaymentStatus.SUCCESS,
      createdAt: now.toISOString()
    });

    // Merchant 2 payment
    repo.payments.push({
      _id: 'm2_p',
      merchantId: merchant2Id,
      orderId: 'ORD-M2',
      amountPaise: 99900,
      status: PaymentStatus.SUCCESS,
      createdAt: now.toISOString()
    });

    const m1Summary = await service.getAnalyticsSummary(merchant1Id, { timeframe: '7d' });
    const m2Summary = await service.getAnalyticsSummary(merchant2Id, { timeframe: '7d' });

    assert.strictEqual(m1Summary.totalPaymentRequests, 1);
    assert.strictEqual(m1Summary.totalAmountRequestedRupees, 500);

    assert.strictEqual(m2Summary.totalPaymentRequests, 1);
    assert.strictEqual(m2Summary.totalAmountRequestedRupees, 999);
  });

  it('filters analytics by bank account and source (LINK vs DIRECT)', async () => {
    const repo = new MockAnalyticsRepository();
    const service = new MerchantAnalyticsService(repo);
    const now = new Date();

    repo.payments.push({
      _id: 'link_pay',
      merchantId: merchant1Id,
      bankAccountId: bankAccount1Id,
      orderId: 'ORD-LINK',
      amountPaise: 15000,
      paymentLinkRef: 'pl_xyz123',
      status: PaymentStatus.SUCCESS,
      createdAt: now.toISOString()
    });

    repo.payments.push({
      _id: 'direct_pay',
      merchantId: merchant1Id,
      bankAccountId: new mongoose.Types.ObjectId().toString(),
      orderId: 'ORD-DIR',
      amountPaise: 25000,
      paymentLinkRef: undefined,
      status: PaymentStatus.PENDING,
      createdAt: now.toISOString()
    });

    // Filter by bank account
    const bankFiltered = await service.getAnalyticsSummary(merchant1Id, {
      timeframe: '7d',
      bankAccountId: bankAccount1Id
    });
    assert.strictEqual(bankFiltered.totalPaymentRequests, 1);
    assert.strictEqual(bankFiltered.totalAmountRequestedRupees, 150);

    // Filter by source: LINK
    const linkFiltered = await service.getAnalyticsSummary(merchant1Id, {
      timeframe: '7d',
      source: 'LINK'
    });
    assert.strictEqual(linkFiltered.totalPaymentRequests, 1);
    assert.strictEqual(linkFiltered.successCount, 1);

    // Filter by source: DIRECT
    const directFiltered = await service.getAnalyticsSummary(merchant1Id, {
      timeframe: '7d',
      source: 'DIRECT'
    });
    assert.strictEqual(directFiltered.totalPaymentRequests, 1);
    assert.strictEqual(directFiltered.pendingCount, 1);
  });

  it('excludes DUPLICATE evidence records from timeseries arrival trends', async () => {
    const repo = new MockAnalyticsRepository();
    const service = new MerchantAnalyticsService(repo);
    const now = new Date();

    // Valid Email Evidence
    repo.evidence.push({
      _id: 'e1',
      merchantId: merchant1Id,
      channel: EvidenceChannel.EMAIL,
      provider: EvidenceProvider.GMAIL,
      status: EvidenceStatus.MATCHED,
      createdAt: now.toISOString()
    });

    // Valid Android Evidence
    repo.evidence.push({
      _id: 'e2',
      merchantId: merchant1Id,
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      status: EvidenceStatus.MATCHED,
      createdAt: now.toISOString()
    });

    // Duplicate Replayed Android Evidence (must be ignored in incoming counts)
    repo.evidence.push({
      _id: 'e3',
      merchantId: merchant1Id,
      channel: EvidenceChannel.ANDROID,
      provider: EvidenceProvider.ANDROID_COMPANION,
      status: EvidenceStatus.DUPLICATE,
      createdAt: now.toISOString()
    });

    const timeseries = await service.getTimeseries(merchant1Id, { timeframe: 'today' });
    const todayItem = timeseries.items.find((i) => i.date === now.toISOString().slice(0, 10));

    assert.ok(todayItem);
    assert.strictEqual(todayItem.emailEvidenceCount, 1);
    assert.strictEqual(todayItem.androidEvidenceCount, 1, 'Duplicate Android evidence was properly excluded');
  });

  it('neutralizes CSV formula injection threats (OWASP)', () => {
    // Leading dangerous characters: =, +, -, @, \t, \r
    assert.strictEqual(escapeCsvCell('=cmd|"/C calc"!A0'), '"\'=cmd|""/C calc""!A0"');
    assert.strictEqual(escapeCsvCell('+SUM(A1:A10)'), '"\'+SUM(A1:A10)"');
    assert.strictEqual(escapeCsvCell('-2+3+cmd|...'), '"\'-2+3+cmd|..."');
    assert.strictEqual(escapeCsvCell('@HYPERLINK("http://evil.com")'), '"\'@HYPERLINK(""http://evil.com"")"');
    assert.strictEqual(escapeCsvCell('   =INJECTION'), '"\'   =INJECTION"');

    // Safe regular values
    assert.strictEqual(escapeCsvCell('ORD-12345'), '"ORD-12345"');
    assert.strictEqual(escapeCsvCell('150.00'), '"150.00"');
    assert.strictEqual(escapeCsvCell(null), '""');
    assert.strictEqual(escapeCsvCell(undefined), '""');
  });

  it('exports sanitized CSV reports without leaking raw payloads or full account numbers', async () => {
    const repo = new MockAnalyticsRepository();
    const service = new MerchantAnalyticsService(repo);
    const now = new Date();

    repo.payments.push({
      _id: 'p_export',
      merchantId: merchant1Id,
      orderId: '=EVIL_FORMULA_ORDER',
      amountPaise: 45000,
      status: PaymentStatus.SUCCESS,
      bankName: 'HDFC Bank',
      accountSuffix: '9876',
      checkoutReference: 'chk_export_1',
      createdAt: now.toISOString(),
      evidenceSummary: {
        hasEmailEvidence: true,
        hasAndroidEvidence: true,
        utr: 'UTR999988887777',
        verifiedAt: now.toISOString()
      }
    });

    const { filename, csv } = await service.generateCsvReport(merchant1Id, {
      reportType: 'payments',
      timeframe: '7d'
    });

    assert.ok(filename.startsWith('rgs-report-payments-'));
    assert.ok(csv.includes('Payment Reference,Order ID,Amount (INR)'));
    // Formula neutralized
    assert.ok(csv.includes('\'=EVIL_FORMULA_ORDER'));
    // Masked bank suffix
    assert.ok(csv.includes('***9876'));
    // INR formatted amount (450.00)
    assert.ok(csv.includes('"450.00"'));
    // Does not leak internal sensitive secrets
    assert.ok(!csv.includes('encryptedRawPayload'));
    assert.ok(!csv.includes('token'));
  });
});
