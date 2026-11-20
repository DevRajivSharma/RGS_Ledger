import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../apps/api/src/database/connection.js';
import {
  PaymentRequestModel,
  ReconciliationCaseModel,
  OutboxEventModel,
  BackgroundJobModel
} from '../../apps/api/src/database/models.js';
import { defaultBackgroundJobService } from '../../apps/api/src/modules/background-jobs/index.js';
import { PaymentStatus, ReconciliationCaseType } from '@rgs-ledger/shared-types';

async function testWorker() {
  await connectDatabase();
  console.log('Testing Background Worker Sweeps & Lease Recovery...');

  const merchantId = new mongoose.Types.ObjectId('6af6ee4f910d54b7fab9acff');

  // 1. Test Expired PENDING Payment Sweep
  console.log('\n--- 1. Testing Expired PENDING Payment Sweep ---');
  const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
  const expiredPendingPayment = await PaymentRequestModel.create({
    merchantId,
    orderId: `TEST_EXP_PENDING_${Date.now()}`,
    amountPaise: 5000,
    merchantVpa: 'sharma9769387961@okhdfcbank',
    merchantName: 'Test Merchant',
    upiUri: 'upi://pay?pa=sharma9769387961@okhdfcbank&pn=Test&am=50.00&cu=INR',
    qrDataUrl: 'data:image/png;base64,mock',
    checkoutReference: `chk_test_${Date.now()}`,
    status: PaymentStatus.PENDING,
    expiresAt: pastDate
  });
  console.log('Created test expired PENDING payment:', expiredPendingPayment._id.toString());

  const sweptPendingCount = await defaultBackgroundJobService.sweepExpiredPayments();
  console.log(`Swept pending count: ${sweptPendingCount}`);

  const refreshedPending = await PaymentRequestModel.findById(expiredPendingPayment._id);
  console.log('Refreshed status after sweep:', refreshedPending?.status);
  if (refreshedPending?.status !== PaymentStatus.EXPIRED) {
    throw new Error(`Expected EXPIRED, got ${refreshedPending?.status}`);
  }
  console.log('[PASS] PENDING payment transitioned to EXPIRED');

  // 2. Test Expired PARTIAL_SUCCESS Payment Sweep
  console.log('\n--- 2. Testing Expired PARTIAL_SUCCESS Sweep ---');
  const expiredPartialPayment = await PaymentRequestModel.create({
    merchantId,
    orderId: `TEST_EXP_PARTIAL_${Date.now()}`,
    amountPaise: 10000,
    merchantVpa: 'sharma9769387961@okhdfcbank',
    merchantName: 'Test Merchant',
    upiUri: 'upi://pay?pa=sharma9769387961@okhdfcbank&pn=Test&am=100.00&cu=INR',
    qrDataUrl: 'data:image/png;base64,mock',
    checkoutReference: `chk_test_part_${Date.now()}`,
    status: PaymentStatus.PARTIAL_SUCCESS,
    evidenceSummary: {
      hasEmailEvidence: true,
      hasAndroidEvidence: false,
      utr: '123456789012',
      matchedAmountPaise: 10000
    },
    expiresAt: pastDate
  });
  console.log('Created test expired PARTIAL_SUCCESS payment:', expiredPartialPayment._id.toString());

  const sweptPartialCount = await defaultBackgroundJobService.sweepExpiredPartialPayments();
  console.log(`Swept partial count: ${sweptPartialCount}`);

  const refreshedPartial = await PaymentRequestModel.findById(expiredPartialPayment._id);
  console.log('Refreshed status after sweep:', refreshedPartial?.status);
  if (refreshedPartial?.status !== PaymentStatus.RECONCILIATION_REQUIRED) {
    throw new Error(`Expected RECONCILIATION_REQUIRED, got ${refreshedPartial?.status}`);
  }

  const reconCase = await ReconciliationCaseModel.findOne({
    merchantId,
    paymentRequestId: expiredPartialPayment._id,
    caseType: ReconciliationCaseType.MISSING_SECOND_SOURCE
  });
  console.log('Reconciliation case created:', reconCase ? 'YES' : 'NO');
  if (!reconCase) {
    throw new Error('MISSING_SECOND_SOURCE reconciliation case was not created');
  }
  console.log('[PASS] PARTIAL_SUCCESS transitioned to RECONCILIATION_REQUIRED with MISSING_SECOND_SOURCE case');

  // 3. Test Outbox Event Publishing
  console.log('\n--- 3. Testing Transactional Outbox Event Publishing ---');
  const outboxEvent = await OutboxEventModel.create({
    aggregateType: 'PAYMENT_REQUEST',
    aggregateId: expiredPartialPayment._id.toString(),
    eventType: 'payment.reconciliation_required',
    payload: {
      merchantId: merchantId.toString(),
      paymentRequestId: expiredPartialPayment._id.toString(),
      status: PaymentStatus.RECONCILIATION_REQUIRED
    },
    status: 'PENDING'
  });
  console.log('Created test outbox event:', outboxEvent._id.toString());

  const publishedOutboxCount = await defaultBackgroundJobService.publishPendingOutboxEvents();
  console.log(`Published outbox count: ${publishedOutboxCount}`);

  const refreshedOutbox = await OutboxEventModel.findById(outboxEvent._id);
  console.log('Outbox event status after publish:', refreshedOutbox?.status);
  if (refreshedOutbox?.status !== 'PUBLISHED') {
    throw new Error(`Expected PUBLISHED, got ${refreshedOutbox?.status}`);
  }
  console.log('[PASS] Outbox event drained and transitioned to PUBLISHED');

  // 4. Test Durable Job Lease Recovery
  console.log('\n--- 4. Testing Durable Job Lease Recovery ---');
  const expiredLeaseJob = await BackgroundJobModel.create({
    name: 'test_reconciliation_sync',
    status: 'PROCESSING',
    leaseToken: 'worker_crashed_999',
    leasedUntil: new Date(Date.now() - 60000), // Lease expired 1 minute ago
    runAt: new Date(Date.now() - 120000),
    attempts: 1
  });
  console.log('Created simulated crashed worker job:', expiredLeaseJob._id.toString());

  // New worker attempts to claim next job
  const recoveredJob = await defaultBackgroundJobService.acquireNextJob('worker_new_111', 30000);
  console.log('Recovered job ID:', recoveredJob?._id.toString());
  console.log('New lease token:', recoveredJob?.leaseToken);
  console.log('New attempts count:', recoveredJob?.attempts);

  if (!recoveredJob || recoveredJob._id.toString() !== expiredLeaseJob._id.toString()) {
    throw new Error('Failed to recover job with expired lease');
  }
  if (recoveredJob.leaseToken !== 'worker_new_111') {
    throw new Error('Expected new lease token worker_new_111');
  }
  console.log('[PASS] Crashed worker job recovered atomically with new lease');

  // Clean up test records
  console.log('\nCleaning up test records...');
  await PaymentRequestModel.deleteMany({ _id: { $in: [expiredPendingPayment._id, expiredPartialPayment._id] } });
  await ReconciliationCaseModel.deleteMany({ paymentRequestId: expiredPartialPayment._id });
  await OutboxEventModel.deleteMany({ _id: outboxEvent._id });
  await BackgroundJobModel.deleteMany({ _id: expiredLeaseJob._id });
  console.log('Test records cleaned up cleanly.');

  await disconnectDatabase();
}

testWorker().catch((err) => {
  console.error('Worker test failed:', err);
  process.exit(1);
});
