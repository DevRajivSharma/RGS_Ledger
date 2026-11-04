import {
  Order,
  Payment,
  Refund,
  Settlement
} from '../database/models';
import { PaymentStatus, OrderStatus } from '@rgs-ledger/shared';

export class ReportService {
  static async getMerchantOverview(merchantId: string) {
    const [orders, payments, refunds, settlements] = await Promise.all([
      Order.find({ merchantId }).lean(),
      Payment.find({ merchantId }).lean(),
      Refund.find({ merchantId }).lean(),
      Settlement.find({ merchantId }).lean()
    ]);

    const totalOrders = orders.length;
    const totalPaymentAttempts = payments.length;

    const successfulPayments = payments.filter(p => p.status === PaymentStatus.SUCCESS);
    const failedPayments = payments.filter(p => p.status === PaymentStatus.FAILED);
    const pendingPayments = payments.filter(p => p.status === PaymentStatus.PENDING);

    const grossCapturedPaise = successfulPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalRefundPaise = refunds.reduce((sum, r) => sum + r.amount, 0);
    const netCapturedPaise = Math.max(0, grossCapturedPaise - totalRefundPaise);

    const successRate = totalPaymentAttempts > 0 
      ? Math.round((successfulPayments.length / totalPaymentAttempts) * 100) 
      : 0;

    const averageTransactionPaise = successfulPayments.length > 0
      ? Math.round(grossCapturedPaise / successfulPayments.length)
      : 0;

    // Daily volume distribution (last 7 days)
    const dailyVolumeMap: Record<string, { date: string; volumePaise: number; count: number }> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailyVolumeMap[dateStr] = { date: dateStr, volumePaise: 0, count: 0 };
    }

    for (const p of successfulPayments) {
      const dateStr = new Date(p.createdAt || Date.now()).toISOString().split('T')[0];
      if (dailyVolumeMap[dateStr]) {
        dailyVolumeMap[dateStr].volumePaise += p.amount;
        dailyVolumeMap[dateStr].count += 1;
      }
    }

    // Method breakdown
    const methodDistribution: Record<string, number> = {};
    for (const p of successfulPayments) {
      methodDistribution[p.method] = (methodDistribution[p.method] || 0) + 1;
    }

    return {
      kpis: {
        totalOrders,
        totalPaymentAttempts,
        successfulCount: successfulPayments.length,
        failedCount: failedPayments.length,
        pendingCount: pendingPayments.length,
        grossCapturedPaise,
        totalRefundPaise,
        netCapturedPaise,
        successRate,
        averageTransactionPaise
      },
      dailyVolume: Object.values(dailyVolumeMap),
      methodDistribution: Object.entries(methodDistribution).map(([method, count]) => ({
        method,
        count
      })),
      recentTransactions: successfulPayments.slice(0, 10).map(p => ({
        id: p._id,
        orderId: p.orderId,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.method,
        createdAt: p.createdAt
      }))
    };
  }

  static async getPlatformAnalytics() {
    const [merchantsCount, ordersCount, payments, refunds] = await Promise.all([
      Order.distinct('merchantId').then(m => m.length),
      Order.countDocuments(),
      Payment.find({ status: PaymentStatus.SUCCESS }).lean(),
      Refund.find().lean()
    ]);

    const grossVolumePaise = payments.reduce((sum, p) => sum + p.amount, 0);
    const refundVolumePaise = refunds.reduce((sum, r) => sum + r.amount, 0);
    // Platform fee 2% of volume
    const estimatedFeePaise = Math.round((grossVolumePaise * 200) / 10000);

    return {
      totalMerchants: merchantsCount || 1,
      totalOrders: ordersCount,
      totalTransactions: payments.length,
      grossVolumePaise,
      refundVolumePaise,
      platformFeeRevenuePaise: estimatedFeePaise
    };
  }
}
