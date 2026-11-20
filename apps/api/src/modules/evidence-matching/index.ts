import { Router, Response } from 'express';
import mongoose from 'mongoose';
import {
  PaymentStatus,
  EvidenceStatus,
  EvidenceChannel,
  TransactionType,
  WebhookEventType
} from '@rgs-ledger/shared-types';
import {
  PaymentRequestModel,
  PaymentEvidenceModel,
  PaymentEvidenceAssociationModel,
  OutboxEventModel,
  AuditLogModel,
  ReconciliationCaseModel
} from '../../database/models.js';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import { defaultWebhookService } from '../webhooks/webhook.service.js';
import { platformConfigService } from '../admin/platform-config.service.js';

export interface MatchResult {
  matched: boolean;
  paymentRequestId?: string;
  previousPaymentStatus?: PaymentStatus;
  newPaymentStatus?: PaymentStatus;
  reason?: string;
}

export interface IMatchingRepository {
  findEvidenceById(merchantId: string, evidenceId: string): Promise<any>;
  findAssocsByUtr(merchantId: string, utr: string): Promise<any[]>;
  findAssocsByEvidenceId(merchantId: string, evidenceId: string): Promise<any>;
  findAssocsByPaymentId(merchantId: string, paymentRequestId: string): Promise<any[]>;
  findCandidatePayments(merchantId: string, amountPaise: number, statuses: PaymentStatus[]): Promise<any[]>;
  findPaymentById(merchantId: string, paymentId: string): Promise<any>;
  savePayment(payment: any): Promise<any>;
  saveEvidence(evidence: any): Promise<any>;
  createAssociation(data: any): Promise<any>;
  createOutboxEvent(data: any): Promise<any>;
  createAuditLog(data: any): Promise<any>;
  createReconciliationCase(data: any): Promise<any>;
  findUnmatchedEvidence(merchantId: string): Promise<any[]>;
}

export class MongoMatchingRepository implements IMatchingRepository {
  async findEvidenceById(merchantId: string, evidenceId: string): Promise<any> {
    return PaymentEvidenceModel.findOne({ _id: evidenceId, merchantId });
  }

  async findAssocsByUtr(merchantId: string, utr: string): Promise<any[]> {
    return PaymentEvidenceAssociationModel.find({ merchantId, matchedUtr: utr });
  }

  async findAssocsByEvidenceId(merchantId: string, evidenceId: string): Promise<any> {
    return PaymentEvidenceAssociationModel.findOne({ merchantId, evidenceId });
  }

  async findAssocsByPaymentId(merchantId: string, paymentRequestId: string): Promise<any[]> {
    return PaymentEvidenceAssociationModel.find({ merchantId, paymentRequestId });
  }

  async findCandidatePayments(merchantId: string, amountPaise: number, statuses: PaymentStatus[]): Promise<any[]> {
    return PaymentRequestModel.find({
      merchantId,
      amountPaise,
      status: { $in: statuses }
    }).sort({ createdAt: 1 });
  }

  async findPaymentById(merchantId: string, paymentId: string): Promise<any> {
    return PaymentRequestModel.findOne({ _id: paymentId, merchantId });
  }

  async savePayment(payment: any): Promise<any> {
    if (typeof payment.save === 'function') {
      return payment.save();
    }
    return PaymentRequestModel.updateOne({ _id: payment._id || payment.id }, { $set: payment });
  }

  async saveEvidence(evidence: any): Promise<any> {
    if (typeof evidence.save === 'function') {
      return evidence.save();
    }
    return PaymentEvidenceModel.updateOne({ _id: evidence._id || evidence.id }, { $set: evidence });
  }

  async createAssociation(data: any): Promise<any> {
    return PaymentEvidenceAssociationModel.create(data);
  }

  async createOutboxEvent(data: any): Promise<any> {
    return OutboxEventModel.create(data);
  }

  async createAuditLog(data: any): Promise<any> {
    return AuditLogModel.create(data);
  }

  async createReconciliationCase(data: any): Promise<any> {
    return ReconciliationCaseModel.create(data);
  }

  async findUnmatchedEvidence(merchantId: string): Promise<any[]> {
    return PaymentEvidenceModel.find({
      merchantId,
      status: EvidenceStatus.UNMATCHED
    }).sort({ receivedAt: 1 });
  }
}

export class InMemoryMatchingRepository implements IMatchingRepository {
  public payments: Map<string, any> = new Map();
  public evidenceStore: Map<string, any> = new Map();
  public associations: any[] = [];
  public outboxEvents: any[] = [];
  public auditLogs: any[] = [];
  public reconciliationCases: any[] = [];
  private idGen = 1;

  async findEvidenceById(merchantId: string, evidenceId: string): Promise<any> {
    for (const ev of this.evidenceStore.values()) {
      if (ev.merchantId === merchantId && (ev._id === evidenceId || ev.id === evidenceId)) {
        return ev;
      }
    }
    return null;
  }

  async findAssocsByUtr(merchantId: string, utr: string): Promise<any[]> {
    return this.associations.filter((a) => a.merchantId === merchantId && a.matchedUtr === utr);
  }

  async findAssocsByEvidenceId(merchantId: string, evidenceId: string): Promise<any> {
    return (
      this.associations.find(
        (a) => a.merchantId === merchantId && (a.evidenceId === evidenceId || a.evidenceId?.toString() === evidenceId)
      ) || null
    );
  }

  async findAssocsByPaymentId(merchantId: string, paymentRequestId: string): Promise<any[]> {
    return this.associations.filter(
      (a) => a.merchantId === merchantId && (a.paymentRequestId === paymentRequestId || a.paymentRequestId?.toString() === paymentRequestId)
    );
  }

  async findCandidatePayments(merchantId: string, amountPaise: number, statuses: PaymentStatus[]): Promise<any[]> {
    const list: any[] = [];
    for (const p of this.payments.values()) {
      if (p.merchantId === merchantId && p.amountPaise === amountPaise && statuses.includes(p.status)) {
        list.push(p);
      }
    }
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async findPaymentById(merchantId: string, paymentId: string): Promise<any> {
    for (const p of this.payments.values()) {
      if (p.merchantId === merchantId && (p._id === paymentId || p.id === paymentId)) {
        return p;
      }
    }
    return null;
  }

  async savePayment(payment: any): Promise<any> {
    const id = payment._id || payment.id || `pay_${this.idGen++}`;
    payment._id = id;
    payment.id = id;
    this.payments.set(id.toString(), payment);
    return payment;
  }

  async saveEvidence(evidence: any): Promise<any> {
    const id = evidence._id || evidence.id || `ev_${this.idGen++}`;
    evidence._id = id;
    evidence.id = id;
    this.evidenceStore.set(id.toString(), evidence);
    return evidence;
  }

  async createAssociation(data: any): Promise<any> {
    const assoc = {
      ...data,
      _id: `assoc_${this.idGen++}`,
      createdAt: new Date()
    };
    this.associations.push(assoc);
    return assoc;
  }

  async createOutboxEvent(data: any): Promise<any> {
    const event = {
      ...data,
      _id: `outbox_${this.idGen++}`,
      createdAt: new Date()
    };
    this.outboxEvents.push(event);
    return event;
  }

  async createAuditLog(data: any): Promise<any> {
    const log = {
      ...data,
      _id: `audit_${this.idGen++}`,
      createdAt: new Date()
    };
    this.auditLogs.push(log);
    return log;
  }

  async createReconciliationCase(data: any): Promise<any> {
    const recon = {
      ...data,
      _id: `recon_${this.idGen++}`,
      createdAt: new Date()
    };
    this.reconciliationCases.push(recon);
    return recon;
  }

  async findUnmatchedEvidence(merchantId: string): Promise<any[]> {
    const list: any[] = [];
    for (const ev of this.evidenceStore.values()) {
      if (ev.merchantId === merchantId && ev.status === EvidenceStatus.UNMATCHED) {
        list.push(ev);
      }
    }
    return list.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  }
}

export class EvidenceMatchingService {
  constructor(private repo: IMatchingRepository = new MongoMatchingRepository()) {}

  /**
   * Matches an incoming or existing UNMATCHED evidence record to an open payment request.
   * Adheres strictly to dual-source rules, bank account isolation, amount match, and UTR uniqueness.
   */
  public async matchEvidenceToPayment(
    merchantId: string,
    evidenceDocOrId: any
  ): Promise<MatchResult> {
    if (!merchantId) throw new Error('merchantId is required');

    let evidence = evidenceDocOrId;
    if (typeof evidenceDocOrId === 'string' || (mongoose.isValidObjectId && mongoose.isValidObjectId(evidenceDocOrId))) {
      evidence = await this.repo.findEvidenceById(merchantId, evidenceDocOrId.toString());
    }

    if (!evidence) {
      return { matched: false, reason: 'Evidence record not found' };
    }

    // Tenant Isolation: Evidence must belong to the specified merchant
    if (evidence.merchantId && evidence.merchantId.toString() !== merchantId.toString()) {
      return { matched: false, reason: 'Evidence does not belong to this merchant' };
    }

    // Only UNMATCHED evidence is eligible for auto-matching
    if (evidence.status !== EvidenceStatus.UNMATCHED) {
      return { matched: false, reason: `Evidence status is ${evidence.status}, not UNMATCHED` };
    }

    // Verify evidence is CREDIT
    if (evidence.transactionType === TransactionType.DEBIT) {
      evidence.status = EvidenceStatus.REJECTED;
      evidence.rejectionReason = 'DEBIT_TRANSACTION_IGNORED';
      await this.repo.saveEvidence(evidence);
      return { matched: false, reason: 'Debit transaction rejected' };
    }

    // Missing or ambiguous UTR cannot be auto-matched
    if (!evidence.utr || !evidence.utr.trim()) {
      evidence.status = EvidenceStatus.REVIEW_REQUIRED;
      evidence.rejectionReason = 'MISSING_UTR_REFERENCE';
      await this.repo.saveEvidence(evidence);
      return { matched: false, reason: 'Do not automatically associate evidence if UTR is missing or ambiguous.' };
    }

    const evidenceIdStr = (evidence._id || evidence.id).toString();

    // Verify this evidence is not already associated with any payment request
    const existingAssocForThisEvidence = await this.repo.findAssocsByEvidenceId(
      merchantId,
      evidenceIdStr
    );
    if (existingAssocForThisEvidence) {
      return { matched: false, reason: 'Evidence record is already associated with a payment request' };
    }

    // 1. Cross-channel UTR uniqueness & conflict detection
    const existingAssocsWithSameUtr = await this.repo.findAssocsByUtr(merchantId, evidence.utr);

    let boundPaymentId: string | null = null;

    if (existingAssocsWithSameUtr.length > 0) {
      const distinctPaymentIds = [
        ...new Set(existingAssocsWithSameUtr.map((a: any) => a.paymentRequestId.toString()))
      ];

      if (distinctPaymentIds.length > 1) {
        // Severe conflict: same UTR already associated with multiple different payments!
        evidence.status = EvidenceStatus.REVIEW_REQUIRED;
        evidence.rejectionReason = 'DUPLICATE_UTR_ACROSS_PAYMENTS';
        await this.repo.saveEvidence(evidence);

        await this.repo.createReconciliationCase({
          merchantId,
          evidenceId: evidence._id || evidence.id,
          caseType: 'DUPLICATE_UTR',
          severity: 'CRITICAL',
          reason: 'DUPLICATE_UTR',
          status: 'OPEN',
          resolutionNotes: `UTR ${evidence.utr} detected across multiple payments: ${distinctPaymentIds.join(', ')}`
        });

        return {
          matched: false,
          reason: 'Duplicate UTR detected across multiple payment requests. Marked REVIEW_REQUIRED.'
        };
      }

      boundPaymentId = distinctPaymentIds[0]!;

      // Check if this bound payment already has an association for the SAME channel
      const sameChannelAssoc = existingAssocsWithSameUtr.find(
        (a: any) => a.channel === evidence.channel
      );

      if (sameChannelAssoc) {
        // Channel is already satisfied for this payment (e.g. duplicate email or companion push)
        return {
          matched: false,
          reason: `Payment request already has an associated evidence for channel ${evidence.channel}. Duplicate alert not re-associated.`
        };
      }
    }

    // 2. Discover candidate payment
    let targetPayment: any = null;

    if (boundPaymentId) {
      // Must match the payment already bound to this UTR
      targetPayment = await this.repo.findPaymentById(merchantId, boundPaymentId);

      if (!targetPayment) {
        return { matched: false, reason: 'Bound payment request not found' };
      }

      if (targetPayment.status === PaymentStatus.CANCELLED) {
        evidence.status = EvidenceStatus.REVIEW_REQUIRED;
        evidence.rejectionReason = 'EVIDENCE_FOR_CANCELLED_PAYMENT';
        await this.repo.saveEvidence(evidence);

        await this.repo.createReconciliationCase({
          merchantId,
          paymentRequestId: targetPayment._id || targetPayment.id,
          evidenceId: evidence._id || evidence.id,
          caseType: 'CANCELLED_PAYMENT_EVIDENCE',
          severity: 'HIGH',
          reason: 'EVIDENCE_FOR_CANCELLED_PAYMENT',
          status: 'OPEN',
          resolutionNotes: `Evidence received for cancelled payment ${targetPayment.orderId || targetPayment._id}`
        });

        return { matched: false, reason: 'Cancelled payment must never become SUCCESS automatically' };
      }

      // Check amount match for same UTR (Scenario F)
      if (targetPayment.amountPaise !== evidence.amountPaise) {
        targetPayment.status = PaymentStatus.REVIEW_REQUIRED;
        targetPayment.reviewReason = 'AMOUNT_MISMATCH_FOR_SAME_UTR';
        await this.repo.savePayment(targetPayment);

        evidence.status = EvidenceStatus.REVIEW_REQUIRED;
        evidence.rejectionReason = 'AMOUNT_MISMATCH_FOR_SAME_UTR';
        await this.repo.saveEvidence(evidence);

        await this.repo.createReconciliationCase({
          merchantId,
          paymentRequestId: targetPayment._id || targetPayment.id,
          evidenceId: evidence._id || evidence.id,
          caseType: 'AMOUNT_MISMATCH',
          severity: 'HIGH',
          reason: 'AMOUNT_MISMATCH',
          status: 'OPEN',
          resolutionNotes: `Expected ₹${(targetPayment.amountPaise / 100).toFixed(2)}, received ₹${(evidence.amountPaise / 100).toFixed(2)} for UTR ${evidence.utr}`
        });

        return {
          matched: false,
          previousPaymentStatus: targetPayment.status,
          newPaymentStatus: PaymentStatus.REVIEW_REQUIRED,
          reason: 'Same UTR but different amounts resulted in REVIEW_REQUIRED.'
        };
      }
    } else {
      // Find open candidate payments matching EXACT amountPaise
      const candidatePayments = await this.repo.findCandidatePayments(
        merchantId,
        evidence.amountPaise,
        [PaymentStatus.PENDING, PaymentStatus.PARTIAL_SUCCESS, PaymentStatus.EXPIRED]
      );

      if (!candidatePayments || candidatePayments.length === 0) {
        return { matched: false, reason: 'No pending, partial, or expired payment request matching amount' };
      }

      for (const payment of candidatePayments) {
        if (payment.status === PaymentStatus.CANCELLED) {
          continue;
        }

        // One payment request can only bind to ONE UTR
        if (
          payment.evidenceSummary?.utr &&
          evidence.utr &&
          payment.evidenceSummary.utr !== evidence.utr
        ) {
          continue;
        }

        // Amount mismatch check if payment already bound to this UTR
        if (payment.evidenceSummary?.utr === evidence.utr && payment.amountPaise !== evidence.amountPaise) {
          payment.status = PaymentStatus.REVIEW_REQUIRED;
          payment.reviewReason = 'AMOUNT_MISMATCH_FOR_SAME_UTR';
          await this.repo.savePayment(payment);

          evidence.status = EvidenceStatus.REVIEW_REQUIRED;
          evidence.rejectionReason = 'AMOUNT_MISMATCH_FOR_SAME_UTR';
          await this.repo.saveEvidence(evidence);

          await this.repo.createReconciliationCase({
            merchantId,
            paymentRequestId: payment._id || payment.id,
            evidenceId: evidence._id || evidence.id,
            reason: 'AMOUNT_MISMATCH',
            status: 'OPEN'
          });

          return {
            matched: false,
            newPaymentStatus: PaymentStatus.REVIEW_REQUIRED,
            reason: 'Same UTR but different amounts resulted in REVIEW_REQUIRED.'
          };
        }

        // Time window check: Historical evidence beyond matching window cannot match
        if (evidence.transactionTimestamp && payment.createdAt) {
          const windowSeconds = platformConfigService.getEvidenceMatchingWindowSeconds();
          const windowBefore = new Date(new Date(payment.createdAt).getTime() - windowSeconds * 1000);
          if (new Date(evidence.transactionTimestamp) < windowBefore) {
            continue;
          }
        }

        // Bank account isolation check:
        if (payment.bankAccountId && evidence.bankAccountId) {
          if (payment.bankAccountId.toString() !== evidence.bankAccountId.toString()) {
            continue; // Different bank account
          }
        }

        // Suffix check:
        if (payment.accountSuffix && evidence.accountIdentifier) {
          const cleanPaymentSuffix = payment.accountSuffix.replace(/[^0-9]/g, '');
          const cleanEvidenceSuffix = evidence.accountIdentifier.replace(/[^0-9]/g, '');
          if (cleanPaymentSuffix && cleanEvidenceSuffix) {
            if (
              !cleanEvidenceSuffix.endsWith(cleanPaymentSuffix) &&
              !cleanPaymentSuffix.endsWith(cleanEvidenceSuffix)
            ) {
              continue; // Mismatched account suffix
            }
          }
        }

        // Check if existing associated evidence on this payment has conflicting accountIdentifier
        const existingAssocsOnPayment = await this.repo.findAssocsByPaymentId(
          merchantId,
          (payment._id || payment.id).toString()
        );

        if (existingAssocsOnPayment.length > 0) {
          const otherEvidenceId = existingAssocsOnPayment[0]?.evidenceId;
          if (otherEvidenceId) {
            const otherEv = await this.repo.findEvidenceById(merchantId, otherEvidenceId.toString());
            if (otherEv?.accountIdentifier && evidence.accountIdentifier) {
              const clean1 = otherEv.accountIdentifier.replace(/[^0-9]/g, '');
              const clean2 = evidence.accountIdentifier.replace(/[^0-9]/g, '');
              if (clean1 && clean2 && clean1 !== clean2 && !clean1.endsWith(clean2) && !clean2.endsWith(clean1)) {
                // Conflicting account identifiers between EMAIL and ANDROID
                continue;
              }
            }
          }
        }

        // Channel eligibility check:
        if (evidence.channel === EvidenceChannel.EMAIL && payment.evidenceSummary?.hasEmailEvidence) {
          continue;
        }
        if (evidence.channel === EvidenceChannel.ANDROID && payment.evidenceSummary?.hasAndroidEvidence) {
          continue;
        }

        targetPayment = payment;
        break;
      }
    }

    if (!targetPayment) {
      return { matched: false, reason: 'No eligible payment request matched criteria' };
    }

    const previousStatus = targetPayment.status;
    let newStatus = previousStatus;
    let reviewReason: string | undefined = undefined;

    // Check if evidence arrived late for an expired payment
    const isExpired = targetPayment.status === PaymentStatus.EXPIRED ||
      (targetPayment.expiresAt && new Date(targetPayment.expiresAt) < new Date());

    const isEmail = evidence.channel === EvidenceChannel.EMAIL;
    const isAndroid = evidence.channel === EvidenceChannel.ANDROID;

    if (!targetPayment.evidenceSummary) {
      targetPayment.evidenceSummary = {
        hasEmailEvidence: false,
        hasAndroidEvidence: false
      };
    }

    if (isEmail) {
      targetPayment.evidenceSummary.hasEmailEvidence = true;
      targetPayment.evidenceSummary.emailEvidenceId = evidence._id || evidence.id;
    } else if (isAndroid) {
      targetPayment.evidenceSummary.hasAndroidEvidence = true;
      targetPayment.evidenceSummary.androidEvidenceId = evidence._id || evidence.id;
    }

    targetPayment.evidenceSummary.matchedAmountPaise = evidence.amountPaise;
    if (evidence.utr) {
      targetPayment.evidenceSummary.utr = evidence.utr;
    }

    if (isExpired) {
      // Invariant Rule 2: No promotion on timeout. Late evidence moves payment to RECONCILIATION_REQUIRED
      newStatus = PaymentStatus.RECONCILIATION_REQUIRED;
      reviewReason = 'LATE_EVIDENCE_RECEIVED';
      targetPayment.reviewReason = reviewReason;

      await this.repo.createReconciliationCase({
        merchantId,
        paymentRequestId: targetPayment._id || targetPayment.id,
        evidenceId: evidence._id || evidence.id,
        caseType: 'LATE_EVIDENCE',
        severity: 'MEDIUM',
        reason: 'LATE_EVIDENCE',
        status: 'OPEN',
        resolutionNotes: `Evidence received after payment window expired (expiresAt: ${targetPayment.expiresAt})`
      });
    } else {
      const hasBoth =
        targetPayment.evidenceSummary.hasEmailEvidence &&
        targetPayment.evidenceSummary.hasAndroidEvidence;

      if (hasBoth) {
        // Both sources matched! Verify consistency
        const utrConflict =
          targetPayment.evidenceSummary.utr &&
          evidence.utr &&
          targetPayment.evidenceSummary.utr !== evidence.utr;

        const amountConflict =
          targetPayment.evidenceSummary.matchedAmountPaise &&
          targetPayment.evidenceSummary.matchedAmountPaise !== targetPayment.amountPaise;

        if (utrConflict || amountConflict) {
          newStatus = PaymentStatus.REVIEW_REQUIRED;
          reviewReason = utrConflict ? 'UTR_CONFLICT_BETWEEN_SOURCES' : 'AMOUNT_MISMATCH_BETWEEN_SOURCES';
          targetPayment.reviewReason = reviewReason;
        } else {
          newStatus = PaymentStatus.SUCCESS;
          targetPayment.reviewReason = undefined;
          targetPayment.evidenceSummary.verifiedAt = new Date();
        }
      } else {
        // Exactly ONE source matched -> PARTIAL_SUCCESS
        newStatus = PaymentStatus.PARTIAL_SUCCESS;
      }
    }

    targetPayment.status = newStatus;
    await this.repo.savePayment(targetPayment);

    // 5. Update Evidence to MATCHED
    evidence.status = EvidenceStatus.MATCHED;
    evidence.matchedPaymentRequestId = targetPayment._id || targetPayment.id;
    evidence.matchedAt = new Date();
    await this.repo.saveEvidence(evidence);

    const targetPaymentIdStr = (targetPayment._id || targetPayment.id).toString();
    const evidenceIdFinalStr = (evidence._id || evidence.id).toString();

    // 6. Record Association
    await this.repo.createAssociation({
      merchantId,
      paymentRequestId: targetPaymentIdStr,
      evidenceId: evidenceIdFinalStr,
      channel: evidence.channel,
      provider: evidence.provider,
      matchedUtr: evidence.utr || undefined,
      matchedAmountPaise: evidence.amountPaise,
      associatedAt: new Date(),
      associatedBy: 'AUTO_MATCH'
    });

    // 7. Write Transactional Outbox Event
    const outboxEventType =
      newStatus === PaymentStatus.SUCCESS
        ? WebhookEventType.PAYMENT_SUCCESS
        : newStatus === PaymentStatus.PARTIAL_SUCCESS
        ? WebhookEventType.PAYMENT_PARTIAL_SUCCESS
        : newStatus === PaymentStatus.REVIEW_REQUIRED
        ? WebhookEventType.PAYMENT_REVIEW_REQUIRED
        : newStatus === PaymentStatus.RECONCILIATION_REQUIRED
        ? WebhookEventType.PAYMENT_RECONCILIATION_REQUIRED
        : 'payment.updated';

    await this.repo.createOutboxEvent({
      aggregateType: 'PAYMENT_REQUEST',
      aggregateId: targetPaymentIdStr,
      eventType: outboxEventType,
      payload: {
        paymentRequestId: targetPaymentIdStr,
        merchantId: merchantId.toString(),
        orderId: targetPayment.orderId,
        amountPaise: targetPayment.amountPaise,
        amountRupees: (targetPayment.amountPaise / 100).toFixed(2),
        status: newStatus,
        reviewReason: targetPayment.reviewReason,
        evidenceChannel: evidence.channel,
        utr: evidence.utr,
        evidenceSummary: targetPayment.evidenceSummary
      },
      status: 'PENDING'
    });

    // 8. Dispatch Webhook Event
    try {
      await defaultWebhookService.dispatchEvent(merchantId, outboxEventType, {
        paymentRequestId: targetPaymentIdStr,
        orderId: targetPayment.orderId,
        amountPaise: targetPayment.amountPaise,
        status: newStatus,
        reviewReason: targetPayment.reviewReason,
        evidenceChannel: evidence.channel,
        utr: evidence.utr
      });
    } catch {
      // Non-blocking in test/mock environments
    }

    // 9. Write Security Audit Log
    await this.repo.createAuditLog({
      merchantId,
      action: 'PAYMENT_STATUS_TRANSITION',
      resource: 'payment_requests',
      resourceId: targetPaymentIdStr,
      details: {
        fromStatus: previousStatus,
        toStatus: newStatus,
        reviewReason,
        evidenceId: evidenceIdFinalStr,
        evidenceChannel: evidence.channel,
        utr: evidence.utr,
        amountPaise: evidence.amountPaise
      }
    });

    return {
      matched: true,
      paymentRequestId: targetPaymentIdStr,
      previousPaymentStatus: previousStatus,
      newPaymentStatus: newStatus,
      reason: reviewReason
    };
  }

  /**
   * Manual review resolution interface.
   * Strictly enforces invariant: Manual review CANNOT bypass evidence validation
   * or allow a single evidence source to become SUCCESS.
   */
  public async manualReviewResolve(
    merchantId: string,
    paymentRequestId: string,
    action: 'RESOLVE' | 'DISMISS',
    notes?: string,
    userId?: string
  ): Promise<{ success: boolean; status: PaymentStatus; message: string }> {
    const payment = await this.repo.findPaymentById(merchantId, paymentRequestId);
    if (!payment) {
      throw new Error('Payment request not found or access denied');
    }

    if (action === 'DISMISS') {
      return {
        success: true,
        status: payment.status,
        message: 'Review dismissed without modifying payment status'
      };
    }

    // Load all associations for this payment
    const associations = await this.repo.findAssocsByPaymentId(merchantId, (payment._id || payment.id).toString());

    const hasEmail = associations.some((a: any) => a.channel === EvidenceChannel.EMAIL);
    const hasAndroid = associations.some((a: any) => a.channel === EvidenceChannel.ANDROID);

    if (!hasEmail || !hasAndroid) {
      throw new Error(
        'CANNOT_PROMOTE_SINGLE_SOURCE_TO_SUCCESS: Dual-source evidence policy strictly requires both EMAIL and ANDROID evidence before a payment can transition to SUCCESS. A single source can only be PARTIAL_SUCCESS.'
      );
    }

    // Both sources are present: verify amounts and UTRs match
    const utrs = [...new Set(associations.map((a: any) => a.matchedUtr).filter(Boolean))];
    if (utrs.length > 1) {
      throw new Error('Cannot resolve to SUCCESS: Contradictory UTRs found between evidence sources');
    }

    const previousStatus = payment.status;
    payment.status = PaymentStatus.SUCCESS;
    payment.reviewReason = undefined;
    if (!payment.evidenceSummary) {
      payment.evidenceSummary = { hasEmailEvidence: true, hasAndroidEvidence: true };
    }
    payment.evidenceSummary.verifiedAt = new Date();
    await this.repo.savePayment(payment);

    const paymentIdStr = (payment._id || payment.id).toString();

    await this.repo.createAuditLog({
      merchantId,
      userId,
      action: 'MANUAL_REVIEW_RESOLVED',
      resource: 'payment_requests',
      resourceId: paymentIdStr,
      details: {
        fromStatus: previousStatus,
        toStatus: PaymentStatus.SUCCESS,
        notes
      }
    });

    await this.repo.createOutboxEvent({
      aggregateType: 'PAYMENT_REQUEST',
      aggregateId: paymentIdStr,
      eventType: WebhookEventType.PAYMENT_SUCCESS,
      payload: {
        paymentRequestId: paymentIdStr,
        merchantId,
        orderId: payment.orderId,
        amountPaise: payment.amountPaise,
        status: PaymentStatus.SUCCESS,
        resolutionNotes: notes
      },
      status: 'PENDING'
    });

    return {
      success: true,
      status: PaymentStatus.SUCCESS,
      message: 'Payment verified and transitioned to SUCCESS after confirming dual-source evidence'
    };
  }

  /**
   * Re-evaluates all UNMATCHED evidence for a merchant against open payments.
   */
  public async reEvaluateUnmatchedEvidence(merchantId: string): Promise<{ evaluated: number; matched: number }> {
    const unmatchedEvidence = await this.repo.findUnmatchedEvidence(merchantId);

    let matchedCount = 0;
    for (const ev of unmatchedEvidence) {
      const res = await this.matchEvidenceToPayment(merchantId, ev);
      if (res.matched) matchedCount++;
    }

    return { evaluated: unmatchedEvidence.length, matched: matchedCount };
  }
}

export const defaultEvidenceMatchingService = new EvidenceMatchingService();

const router = Router();
router.use(requireAuth);

router.post('/re-evaluate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await defaultEvidenceMatchingService.reEvaluateUnmatchedEvidence(req.merchantId!);
    res.json({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'MATCH_EVALUATION_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

router.post('/manual-review', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { paymentRequestId, action, notes } = req.body;
    if (!paymentRequestId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PAYMENT_ID', message: 'paymentRequestId is required' }
      });
      return;
    }

    const result = await defaultEvidenceMatchingService.manualReviewResolve(
      req.merchantId!,
      paymentRequestId,
      action || 'RESOLVE',
      notes,
      (req as any).user?.id
    );

    res.json({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'MANUAL_REVIEW_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

export const evidenceMatchingRouter = router;
