import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  BackgroundJobModel,
  PaymentRequestModel,
  OutboxEventModel,
  ReconciliationCaseModel,
  AuditLogModel
} from '../../database/models.js';
import { PaymentStatus, WebhookEventType, ReconciliationCaseType } from '@rgs-ledger/shared-types';
import { config } from '../../config/index.js';
import { defaultWebhookService } from '../webhooks/webhook.service.js';

export interface WorkerHeartbeatInfo {
  isActive: boolean;
  lastRunAt: string | null;
  lastRunDurationMs: number;
  lastRunStats: {
    retriedWebhooks: number;
    expiredPayments: number;
    expiredPartialPayments: number;
    publishedOutboxEvents: number;
  };
}

export const workerHeartbeat: WorkerHeartbeatInfo = {
  isActive: false,
  lastRunAt: null,
  lastRunDurationMs: 0,
  lastRunStats: {
    retriedWebhooks: 0,
    expiredPayments: 0,
    expiredPartialPayments: 0,
    publishedOutboxEvents: 0
  }
};

export class BackgroundJobService {
  /**
   * Acquire pending job with a durable lease.
   * If an active worker crashes or process terminates, another worker recovers the job
   * once leasedUntil has expired.
   */
  async acquireNextJob(workerId: string, leaseDurationMs = 30000) {
    const now = new Date();
    const leaseUntil = new Date(Date.now() + leaseDurationMs);

    return BackgroundJobModel.findOneAndUpdate(
      {
        status: { $in: ['PENDING', 'PROCESSING'] },
        runAt: { $lte: now },
        $or: [
          { leasedUntil: { $exists: false } },
          { leasedUntil: { $lte: now } }
        ]
      },
      {
        $set: {
          status: 'PROCESSING',
          leaseToken: workerId,
          leasedUntil: leaseUntil
        },
        $inc: { attempts: 1 }
      },
      { new: true }
    );
  }

  /**
   * Completes a background job successfully
   */
  async completeJob(jobId: string) {
    return BackgroundJobModel.findByIdAndUpdate(jobId, {
      $set: {
        status: 'COMPLETED',
        leasedUntil: undefined,
        leaseToken: undefined
      }
    });
  }

  /**
   * Fails a background job with retry backoff
   */
  async failJob(jobId: string, error: string, backoffMultiplierSeconds = 30) {
    const job = await BackgroundJobModel.findById(jobId);
    if (!job) return null;

    const isExhausted = job.attempts >= job.maxAttempts;
    const nextRun = new Date(Date.now() + job.attempts * backoffMultiplierSeconds * 1000);

    return BackgroundJobModel.findByIdAndUpdate(jobId, {
      $set: {
        status: isExhausted ? 'FAILED' : 'PENDING',
        lastError: error,
        runAt: isExhausted ? job.runAt : nextRun,
        leasedUntil: undefined,
        leaseToken: undefined
      }
    });
  }

  /**
   * Sweeps expired payment requests that are still in PENDING status
   * Transitions them to EXPIRED and dispatches payment.expired webhook
   */
  async sweepExpiredPayments(batchSize = 100): Promise<number> {
    const now = new Date();
    const expiredPending = await PaymentRequestModel.find({
      status: PaymentStatus.PENDING,
      expiresAt: { $lt: now }
    })
      .limit(batchSize)
      .lean();

    let count = 0;
    for (const paymentDoc of expiredPending) {
      const payment = paymentDoc as any;
      try {
        await PaymentRequestModel.findByIdAndUpdate(payment._id, {
          $set: { status: PaymentStatus.EXPIRED }
        });

        // Dispatch PAYMENT_EXPIRED webhook
        await defaultWebhookService.dispatchEvent(
          payment.merchantId.toString(),
          WebhookEventType.PAYMENT_EXPIRED,
          {
            paymentRequestId: payment._id.toString(),
            orderId: payment.orderId,
            amountPaise: payment.amountPaise,
            status: PaymentStatus.EXPIRED,
            expiresAt: payment.expiresAt
          }
        ).catch(() => {});

        // Audit log
        await AuditLogModel.create({
          merchantId: payment.merchantId,
          action: 'PAYMENT_EXPIRED_SWEEP',
          resource: 'payment_requests',
          resourceId: payment._id.toString(),
          details: {
            orderId: payment.orderId,
            expiresAt: payment.expiresAt
          }
        }).catch(() => {});

        count++;
      } catch {
        // Continue to next payment
      }
    }
    return count;
  }

  /**
   * Sweeps payments that were in PARTIAL_SUCCESS but expired without second source.
   * INVARIANT: No promotion on timeout. Exactly one evidence source captured;
   * payment transitions to RECONCILIATION_REQUIRED and opens a MISSING_SECOND_SOURCE case.
   */
  async sweepExpiredPartialPayments(batchSize = 100): Promise<number> {
    const now = new Date();
    const expiredPartial = await PaymentRequestModel.find({
      status: PaymentStatus.PARTIAL_SUCCESS,
      expiresAt: { $lt: now }
    })
      .limit(batchSize)
      .lean();

    let count = 0;
    for (const paymentDoc of expiredPartial) {
      const payment = paymentDoc as any;
      try {
        await PaymentRequestModel.findByIdAndUpdate(payment._id, {
          $set: {
            status: PaymentStatus.RECONCILIATION_REQUIRED,
            reviewReason: 'PARTIAL_PAYMENT_EXPIRED_WITHOUT_SECOND_SOURCE'
          }
        });

        // Ensure reconciliation case exists
        const existingCase = await ReconciliationCaseModel.findOne({
          merchantId: payment.merchantId,
          paymentRequestId: payment._id,
          caseType: ReconciliationCaseType.MISSING_SECOND_SOURCE
        });

        if (!existingCase) {
          await ReconciliationCaseModel.create({
            merchantId: payment.merchantId,
            paymentRequestId: payment._id,
            caseType: ReconciliationCaseType.MISSING_SECOND_SOURCE,
            severity: 'HIGH',
            reason: 'PARTIAL_PAYMENT_EXPIRED_WITHOUT_SECOND_SOURCE',
            status: 'OPEN',
            orderId: payment.orderId,
            checkoutReference: payment.checkoutReference,
            expectedAmountPaise: payment.amountPaise,
            receivedAmountPaise: payment.evidenceSummary?.matchedAmountPaise || payment.amountPaise,
            utr: payment.evidenceSummary?.utr,
            bankAccountId: payment.bankAccountId,
            hasEmailEvidence: payment.evidenceSummary?.hasEmailEvidence || false,
            hasAndroidEvidence: payment.evidenceSummary?.hasAndroidEvidence || false,
            resolutionNotes: 'Payment window expired while in PARTIAL_SUCCESS. Exactly one evidence source was captured; second source never arrived.'
          });
        }

        // Dispatch Webhook
        await defaultWebhookService.dispatchEvent(
          payment.merchantId.toString(),
          WebhookEventType.PAYMENT_RECONCILIATION_REQUIRED,
          {
            paymentRequestId: payment._id.toString(),
            orderId: payment.orderId,
            amountPaise: payment.amountPaise,
            status: PaymentStatus.RECONCILIATION_REQUIRED,
            reviewReason: 'PARTIAL_PAYMENT_EXPIRED_WITHOUT_SECOND_SOURCE'
          }
        ).catch(() => {});

        count++;
      } catch {
        // Continue to next payment
      }
    }
    return count;
  }

  /**
   * Publishes transactional outbox events to prevent lost webhook deliveries
   */
  async publishPendingOutboxEvents(batchSize = 50): Promise<number> {
    const pendingEvents = await OutboxEventModel.find({ status: 'PENDING' })
      .limit(batchSize)
      .lean();

    let count = 0;
    for (const evDoc of pendingEvents) {
      const ev = evDoc as any;
      try {
        const payload = ev.payload || {};
        const merchantId = payload.merchantId || ev.aggregateId;

        if (merchantId) {
          await defaultWebhookService.dispatchEvent(merchantId, ev.eventType, payload);
        }

        await OutboxEventModel.findByIdAndUpdate(ev._id, {
          $set: { status: 'PUBLISHED' }
        });
        count++;
      } catch {
        // Leave PENDING for next run
      }
    }
    return count;
  }

  /**
   * Executes all standing periodic tasks (webhooks, sweeps, outbox)
   */
  async runPeriodicTasks(): Promise<{
    retriedWebhooks: number;
    expiredPayments: number;
    expiredPartialPayments: number;
    publishedOutboxEvents: number;
  }> {
    if (mongoose.connection.readyState !== 1) {
      return {
        retriedWebhooks: 0,
        expiredPayments: 0,
        expiredPartialPayments: 0,
        publishedOutboxEvents: 0
      };
    }

    const startTime = Date.now();

    const [
      retriedWebhooks,
      expiredPayments,
      expiredPartialPayments,
      publishedOutboxEvents
    ] = await Promise.all([
      defaultWebhookService.processPendingRetries(),
      this.sweepExpiredPayments(),
      this.sweepExpiredPartialPayments(),
      this.publishPendingOutboxEvents()
    ]);

    const durationMs = Date.now() - startTime;

    workerHeartbeat.isActive = true;
    workerHeartbeat.lastRunAt = new Date().toISOString();
    workerHeartbeat.lastRunDurationMs = durationMs;
    workerHeartbeat.lastRunStats = {
      retriedWebhooks,
      expiredPayments,
      expiredPartialPayments,
      publishedOutboxEvents
    };

    return {
      retriedWebhooks,
      expiredPayments,
      expiredPartialPayments,
      publishedOutboxEvents
    };
  }
}

export const defaultBackgroundJobService = new BackgroundJobService();

let retryWorkerInterval: NodeJS.Timeout | null = null;

export function startBackgroundWorker(intervalMs = 60000) {
  if (retryWorkerInterval) return;
  workerHeartbeat.isActive = true;

  // Run initial pass immediately
  defaultBackgroundJobService.runPeriodicTasks().catch(() => {});

  retryWorkerInterval = setInterval(async () => {
    try {
      await defaultBackgroundJobService.runPeriodicTasks();
    } catch {
      // Periodic sweep errors handled gracefully
    }
  }, intervalMs);
}

export function stopBackgroundWorker() {
  if (retryWorkerInterval) {
    clearInterval(retryWorkerInterval);
    retryWorkerInterval = null;
  }
  workerHeartbeat.isActive = false;
}

const router = Router();

/**
 * Scheduled dispatch endpoint called securely by Cloudflare Worker scheduler
 */
router.post('/dispatch', async (req: Request, res: Response) => {
  const authHeader = req.headers['x-scheduler-secret'];
  if (authHeader !== config.SCHEDULER_SHARED_SECRET) {
    res.status(401).json({ success: false, error: 'Unauthorized scheduler trigger' });
    return;
  }

  try {
    const stats = await defaultBackgroundJobService.runPeriodicTasks();
    res.json({
      success: true,
      message: 'Scheduled dispatch and reconciliation sweep executed successfully',
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Dispatch processing failed',
      timestamp: new Date().toISOString()
    });
  }
});

export const backgroundJobsRouter = router;
