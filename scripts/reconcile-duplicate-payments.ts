import mongoose from 'mongoose';
import {
  Payment,
  Order,
  CheckoutSession,
  IPayment,
  IOrder,
  ICheckoutSession
} from '../apps/api/src/database/models';
import { PaymentStatus, OrderStatus } from '@rgs-ledger/shared';

interface ProposedChange {
  orderId: string;
  orderAmount: number;
  orderStatus: string;
  canonicalPaymentId: string;
  canonicalPaymentStatus: string;
  duplicatePaymentId: string;
  duplicateCreatedAt: Date;
  canonicalCreatedAt: Date;
  timeDeltaMs: number;
  action: 'CANCEL_DUPLICATE_PAYMENT';
  newStatus: PaymentStatus.CANCELLED;
  newErrorCode: string;
  newErrorDescription: string;
  reconcileOrderAttempts: boolean;
  proposedNewAttemptsCount: number;
}

export async function reconcileDuplicatePayments(applyChanges: boolean = false): Promise<{
  inspectedOrdersCount: number;
  duplicateOrdersCount: number;
  proposedChanges: ProposedChange[];
  appliedCount: number;
}> {
  if (mongoose.connection.readyState === 0) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rgs_ledger';
    await mongoose.connect(mongoUri);
  }

  const allOrders = await Order.find({}).exec();
  const allPayments = await Payment.find({}).exec();
  const allSessions = await CheckoutSession.find({}).exec();

  const paymentsByOrder: Record<string, IPayment[]> = {};
  allPayments.forEach((p) => {
    paymentsByOrder[p.orderId] = paymentsByOrder[p.orderId] || [];
    paymentsByOrder[p.orderId].push(p);
  });

  const sessionsByOrder: Record<string, ICheckoutSession[]> = {};
  allSessions.forEach((s) => {
    sessionsByOrder[s.orderId] = sessionsByOrder[s.orderId] || [];
    sessionsByOrder[s.orderId].push(s);
  });

  const proposedChanges: ProposedChange[] = [];

  for (const order of allOrders) {
    const payments = paymentsByOrder[order._id] || [];
    if (payments.length <= 1) continue;

    const sessions = sessionsByOrder[order._id] || [];

    // Sort payments by creation timestamp
    payments.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

    // Determine canonical payment
    // 1. If any payment is SUCCESS, that is canonical.
    // 2. Otherwise, the payment referenced by an active checkout session is canonical.
    let canonical = payments.find((p) => p.status === PaymentStatus.SUCCESS);
    if (!canonical) {
      const activeSession = sessions.find((s) => s.paymentId);
      if (activeSession) {
        canonical = payments.find((p) => p._id === activeSession.paymentId);
      }
    }
    if (!canonical) {
      // Latest payment is canonical
      canonical = payments[payments.length - 1];
    }

    // Identify accidental duplicate PENDING payments for the same session/order
    for (const p of payments) {
      if (p._id === canonical._id) continue;

      // Only evaluate PENDING payments created concurrently with the canonical attempt
      if (p.status === PaymentStatus.PENDING) {
        const timeDelta = Math.abs(
          new Date(canonical.createdAt || 0).getTime() - new Date(p.createdAt || 0).getTime()
        );

        // Concurrency threshold: created within 60 seconds with same method
        if (timeDelta <= 60000 && p.method === canonical.method) {
          const currentAttempts = order.attemptsCount || 1;
          const proposedNewAttempts = Math.max(1, currentAttempts - 1);

          proposedChanges.push({
            orderId: order._id,
            orderAmount: order.amount,
            orderStatus: order.status,
            canonicalPaymentId: canonical._id,
            canonicalPaymentStatus: canonical.status,
            duplicatePaymentId: p._id,
            duplicateCreatedAt: p.createdAt || new Date(),
            canonicalCreatedAt: canonical.createdAt || new Date(),
            timeDeltaMs: timeDelta,
            action: 'CANCEL_DUPLICATE_PAYMENT',
            newStatus: PaymentStatus.CANCELLED,
            newErrorCode: 'DUPLICATE_ATTEMPT_SUPERSEDED',
            newErrorDescription: `Closed: Accidental concurrent duplicate attempt superseded by canonical payment ${canonical._id}`,
            reconcileOrderAttempts: true,
            proposedNewAttemptsCount: proposedNewAttempts
          });
        }
      }
    }
  }

  let appliedCount = 0;

  if (applyChanges && proposedChanges.length > 0) {
    for (const change of proposedChanges) {
      // 1. Update duplicate payment status to CANCELLED
      await Payment.findByIdAndUpdate(change.duplicatePaymentId, {
        status: change.newStatus,
        errorCode: change.newErrorCode,
        errorDescription: change.newErrorDescription,
        updatedAt: new Date()
      }).exec();

      // 2. Adjust order attemptsCount to reflect genuine attempts
      if (change.reconcileOrderAttempts) {
        await Order.findByIdAndUpdate(change.orderId, {
          attemptsCount: change.proposedNewAttemptsCount
        }).exec();
      }

      appliedCount++;
    }
  }

  return {
    inspectedOrdersCount: allOrders.length,
    duplicateOrdersCount: Object.values(paymentsByOrder).filter((l) => l.length > 1).length,
    proposedChanges,
    appliedCount
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply') || args.includes('--execute');

  console.log('================================================================');
  console.log('RGS LEDGER — DATABASE DUPLICATE PAYMENT RECONCILIATION SCRIPT');
  console.log(`MODE: ${isApply ? '>>> EXECUTION / APPLY CHANGES <<<' : 'DRY RUN (Read-Only Preview)'}`);
  console.log('================================================================\n');

  try {
    const result = await reconcileDuplicatePayments(isApply);

    console.log(`Total Orders Inspected: ${result.inspectedOrdersCount}`);
    console.log(`Orders With Multiple Payments: ${result.duplicateOrdersCount}`);
    console.log(`Accidental Duplicates Detected: ${result.proposedChanges.length}\n`);

    if (result.proposedChanges.length === 0) {
      console.log('✓ No accidental duplicate payment records found.');
      process.exit(0);
    }

    console.log('PROPOSED DATABASE RECONCILIATION ACTIONS:');
    console.log('----------------------------------------------------------------');
    result.proposedChanges.forEach((change, idx) => {
      console.log(`[${idx + 1}] Order ID: ${change.orderId} (₹${change.orderAmount / 100}, Status: ${change.orderStatus})`);
      console.log(`    Canonical Payment: ${change.canonicalPaymentId} (${change.canonicalPaymentStatus}) created at ${change.canonicalCreatedAt.toISOString()}`);
      console.log(`    Accidental Duplicate: ${change.duplicatePaymentId} (PENDING) created at ${change.duplicateCreatedAt.toISOString()}`);
      console.log(`    Concurrency Time Delta: ${change.timeDeltaMs} ms`);
      console.log(`    Proposed Action: Transition ${change.duplicatePaymentId} -> CANCELLED`);
      console.log(`    Reason: ${change.newErrorDescription}`);
      console.log(`    Order Attempts Adjustment: ${change.proposedNewAttemptsCount + 1} -> ${change.proposedNewAttemptsCount}`);
      console.log('');
    });

    if (!isApply) {
      console.log('================================================================');
      console.log('DRY RUN COMPLETE — ZERO DATABASE MODIFICATIONS PERFORMED.');
      console.log('To apply these changes, run:');
      console.log('  npx tsx scripts/reconcile-duplicate-payments.ts --apply');
      console.log('================================================================');
    } else {
      console.log('================================================================');
      console.log(`SUCCESSFULLY APPLIED ${result.appliedCount} RECONCILIATION ACTIONS.`);
      console.log('Database records have been safely updated to terminal CANCELLED state.');
      console.log('================================================================');
    }
  } catch (err: any) {
    console.error('Reconciliation error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main();
}
