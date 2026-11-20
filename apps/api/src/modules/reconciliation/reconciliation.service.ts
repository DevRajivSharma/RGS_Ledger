import {
  ReconciliationCaseType,
  ReconciliationCaseSeverity,
  ReconciliationCaseStatus,
  PaymentStatus,
  EvidenceStatus,
  EvidenceChannel,
  WebhookEventType
} from '@rgs-ledger/shared-types';
import {
  ReconciliationCaseModel,
  PaymentRequestModel,
  PaymentEvidenceModel,
  PaymentEvidenceAssociationModel,
  AuditLogModel
} from '../../database/models.js';
import { defaultWebhookService } from '../webhooks/webhook.service.js';
import { defaultEvidenceMatchingService } from '../evidence-matching/index.js';

export interface CreateReconciliationCaseInput {
  merchantId?: string;
  paymentRequestId?: string;
  evidenceId?: string;
  evidenceIds?: string[];
  caseType: ReconciliationCaseType;
  severity?: ReconciliationCaseSeverity;
  reason: string;
  notes?: string;
  userId?: string;
  expectedAmountPaise?: number;
  receivedAmountPaise?: number;
  utr?: string;
  bankAccountId?: string;
  accountSuffix?: string;
  hasEmailEvidence?: boolean;
  hasAndroidEvidence?: boolean;
}

export interface ReconciliationFilter {
  paymentRequestId?: string;
  status?: string;
  severity?: string;
  caseType?: string;
  bankAccountId?: string;
  search?: string;
  dateFrom?: string | Date;
  dateTo?: string | Date;
  limit?: number;
  skip?: number;
}

export interface IReconciliationRepository {
  findCaseById(merchantId: string, caseId: string): Promise<any>;
  findActiveCase(merchantId: string, criteria: { paymentRequestId?: string; caseType: ReconciliationCaseType; utr?: string }): Promise<any>;
  listCases(merchantId: string, filter?: ReconciliationFilter): Promise<{ cases: any[]; total: number }>;
  saveCase(reconCase: any): Promise<any>;
  createCase(data: any): Promise<any>;
  findPaymentById(merchantId: string, paymentId: string): Promise<any>;
  savePayment(payment: any): Promise<any>;
  findEvidenceById(merchantId: string, evidenceId: string): Promise<any>;
  saveEvidence(evidence: any): Promise<any>;
  findAssocsByPaymentId(merchantId: string, paymentId: string): Promise<any[]>;
  createAuditLog(data: any): Promise<any>;
  findExpiredPartialPayments(merchantId: string): Promise<any[]>;
}

export class MongoReconciliationRepository implements IReconciliationRepository {
  async findCaseById(merchantId: string, caseId: string): Promise<any> {
    return ReconciliationCaseModel.findOne({ _id: caseId, merchantId })
      .populate('paymentRequestId')
      .populate('evidenceId');
  }

  async findActiveCase(
    merchantId: string,
    criteria: { paymentRequestId?: string; caseType: ReconciliationCaseType; utr?: string }
  ): Promise<any> {
    const query: any = {
      merchantId,
      caseType: criteria.caseType,
      status: { $in: [ReconciliationCaseStatus.OPEN, ReconciliationCaseStatus.INVESTIGATING] }
    };
    if (criteria.paymentRequestId) query.paymentRequestId = criteria.paymentRequestId;
    if (criteria.utr) query.utr = criteria.utr;
    return ReconciliationCaseModel.findOne(query);
  }

  async listCases(merchantId: string, filter?: ReconciliationFilter): Promise<{ cases: any[]; total: number }> {
    const query: any = { merchantId };

    if (filter?.status && filter.status !== 'ALL') {
      query.status = filter.status;
    }
    if (filter?.severity && filter.severity !== 'ALL') {
      query.severity = filter.severity;
    }
    if (filter?.caseType && filter.caseType !== 'ALL') {
      query.caseType = filter.caseType;
    }
    if (filter?.bankAccountId) {
      query.bankAccountId = filter.bankAccountId;
    }
    if (filter?.search && filter.search.trim()) {
      const term = filter.search.trim();
      query.$or = [
        { orderId: { $regex: term, $options: 'i' } },
        { checkoutReference: { $regex: term, $options: 'i' } },
        { utr: { $regex: term, $options: 'i' } },
        { reason: { $regex: term, $options: 'i' } }
      ];
    }
    if (filter?.dateFrom || filter?.dateTo) {
      query.createdAt = {};
      if (filter.dateFrom) query.createdAt.$gte = new Date(filter.dateFrom);
      if (filter.dateTo) query.createdAt.$lte = new Date(filter.dateTo);
    }

    const limit = filter?.limit || 50;
    const skip = filter?.skip || 0;

    const [cases, total] = await Promise.all([
      ReconciliationCaseModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('paymentRequestId')
        .populate('evidenceId'),
      ReconciliationCaseModel.countDocuments(query)
    ]);

    return { cases, total };
  }

  async saveCase(reconCase: any): Promise<any> {
    if (typeof reconCase.save === 'function') {
      return reconCase.save();
    }
    return ReconciliationCaseModel.updateOne({ _id: reconCase._id || reconCase.id }, { $set: reconCase });
  }

  async createCase(data: any): Promise<any> {
    return ReconciliationCaseModel.create(data);
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

  async findEvidenceById(merchantId: string, evidenceId: string): Promise<any> {
    return PaymentEvidenceModel.findOne({ _id: evidenceId, merchantId });
  }

  async saveEvidence(evidence: any): Promise<any> {
    if (evidence.save && typeof evidence.save === 'function') {
      return evidence.save();
    }
    return PaymentEvidenceModel.updateOne({ _id: evidence._id || evidence.id }, { $set: evidence });
  }

  async findAssocsByPaymentId(merchantId: string, paymentId: string): Promise<any[]> {
    return PaymentEvidenceAssociationModel.find({ merchantId, paymentRequestId: paymentId });
  }

  async createAuditLog(data: any): Promise<any> {
    return AuditLogModel.create(data);
  }

  async findExpiredPartialPayments(merchantId: string): Promise<any[]> {
    return PaymentRequestModel.find({
      merchantId,
      status: PaymentStatus.PARTIAL_SUCCESS,
      expiresAt: { $lt: new Date() }
    });
  }
}

export class InMemoryReconciliationRepository implements IReconciliationRepository {
  public cases: Map<string, any> = new Map();
  public payments: Map<string, any> = new Map();
  public evidenceStore: Map<string, any> = new Map();
  public associations: any[] = [];
  public auditLogs: any[] = [];
  public outbox: Array<{ merchantId: string; eventType: string; payload: any }> = [];
  private idGen = 1;

  async findCaseById(merchantId: string, caseId: string): Promise<any> {
    for (const c of this.cases.values()) {
      if (c.merchantId === merchantId && (c._id === caseId || c.id === caseId)) {
        return c;
      }
    }
    return null;
  }

  async findActiveCase(
    merchantId: string,
    criteria: { paymentRequestId?: string; caseType: ReconciliationCaseType; utr?: string }
  ): Promise<any> {
    for (const c of this.cases.values()) {
      if (
        c.merchantId === merchantId &&
        c.caseType === criteria.caseType &&
        (c.status === ReconciliationCaseStatus.OPEN || c.status === ReconciliationCaseStatus.INVESTIGATING)
      ) {
        if (criteria.paymentRequestId && c.paymentRequestId?.toString() === criteria.paymentRequestId.toString()) {
          return c;
        }
        if (criteria.utr && c.utr === criteria.utr) {
          return c;
        }
        if (!criteria.paymentRequestId && !criteria.utr) {
          return c;
        }
      }
    }
    return null;
  }

  async listCases(merchantId: string, filter?: ReconciliationFilter): Promise<{ cases: any[]; total: number }> {
    let list: any[] = [];
    for (const c of this.cases.values()) {
      if (c.merchantId !== merchantId) continue;
      if (filter?.status && filter.status !== 'ALL' && c.status !== filter.status) continue;
      if (filter?.severity && filter.severity !== 'ALL' && c.severity !== filter.severity) continue;
      if (filter?.caseType && filter.caseType !== 'ALL' && c.caseType !== filter.caseType) continue;
      if (filter?.bankAccountId && c.bankAccountId?.toString() !== filter.bankAccountId.toString()) continue;
      if (filter?.search) {
        const s = filter.search.toLowerCase();
        const matches =
          (c.orderId || '').toLowerCase().includes(s) ||
          (c.checkoutReference || '').toLowerCase().includes(s) ||
          (c.utr || '').toLowerCase().includes(s) ||
          (c.reason || '').toLowerCase().includes(s);
        if (!matches) continue;
      }
      list.push(c);
    }
    list = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { cases: list, total: list.length };
  }

  async saveCase(reconCase: any): Promise<any> {
    const id = reconCase._id || reconCase.id || `recon_${this.idGen++}`;
    reconCase._id = id;
    reconCase.id = id;
    this.cases.set(id.toString(), reconCase);
    return reconCase;
  }

  async createCase(data: any): Promise<any> {
    const id = `recon_${this.idGen++}`;
    const newCase = {
      ...data,
      _id: id,
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.cases.set(id, newCase);
    return newCase;
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

  async findEvidenceById(merchantId: string, evidenceId: string): Promise<any> {
    for (const ev of this.evidenceStore.values()) {
      if (ev.merchantId === merchantId && (ev._id === evidenceId || ev.id === evidenceId)) {
        return ev;
      }
    }
    return null;
  }

  async findAssocsByPaymentId(merchantId: string, paymentId: string): Promise<any[]> {
    return this.associations.filter(
      (a) => a.merchantId === merchantId && (a.paymentRequestId === paymentId || a.paymentRequestId?.toString() === paymentId)
    );
  }

  async createAuditLog(data: any): Promise<any> {
    const log = { ...data, _id: `audit_${this.idGen++}`, createdAt: new Date() };
    this.auditLogs.push(log);
    return log;
  }

  async findExpiredPartialPayments(merchantId: string): Promise<any[]> {
    const list: any[] = [];
    const now = new Date();
    for (const p of this.payments.values()) {
      if (p.merchantId === merchantId && p.status === PaymentStatus.PARTIAL_SUCCESS && new Date(p.expiresAt) < now) {
        list.push(p);
      }
    }
    return list;
  }

  async saveEvidence(evidence: any): Promise<any> {
    const id = evidence._id || evidence.id || `ev_${this.idGen++}`;
    evidence._id = id;
    evidence.id = id;
    this.evidenceStore.set(id.toString(), evidence);
    return evidence;
  }

  getPaymentById(id: string): any {
    return this.payments.get(id.toString()) || null;
  }

  getCaseById(id: string): any {
    return this.cases.get(id.toString()) || null;
  }

  getEvidenceById(id: string): any {
    return this.evidenceStore.get(id.toString()) || null;
  }
}

export class ReconciliationService {
  constructor(
    private repo: IReconciliationRepository = new MongoReconciliationRepository(),
    private webhookService: { dispatchEvent: (merchantId: string, eventType: any, payload: any) => Promise<any> } = defaultWebhookService
  ) {}

  /**
   * Calculates appropriate default severity for a case type.
   */
  public static calculateSeverity(caseType: ReconciliationCaseType): ReconciliationCaseSeverity {
    switch (caseType) {
      case ReconciliationCaseType.DUPLICATE_UTR:
        return ReconciliationCaseSeverity.CRITICAL;
      case ReconciliationCaseType.AMOUNT_MISMATCH:
      case ReconciliationCaseType.CANCELLED_PAYMENT_EVIDENCE:
        return ReconciliationCaseSeverity.HIGH;
      case ReconciliationCaseType.ACCOUNT_MISMATCH:
      case ReconciliationCaseType.EVIDENCE_DISAGREEMENT:
      case ReconciliationCaseType.LATE_EVIDENCE:
      case ReconciliationCaseType.MISSING_UTR:
      case ReconciliationCaseType.MANUAL_FLAG:
        return ReconciliationCaseSeverity.MEDIUM;
      case ReconciliationCaseType.MISSING_SECOND_SOURCE:
      case ReconciliationCaseType.DUPLICATE_PAYLOAD:
      default:
        return ReconciliationCaseSeverity.LOW;
    }
  }

  /**
   * Idempotently creates or updates a reconciliation case.
   * Prevents duplicate open cases for the same payment and caseType.
   */
  public async createOrUpdateCase(
    merchantIdOrInput: string | CreateReconciliationCaseInput,
    possibleInput?: CreateReconciliationCaseInput
  ): Promise<any> {
    const merchantId = typeof merchantIdOrInput === 'string' ? merchantIdOrInput : merchantIdOrInput.merchantId;
    const input = typeof merchantIdOrInput === 'string' ? possibleInput! : merchantIdOrInput;
    if (!merchantId) throw new Error('merchantId is required');

    // Check if an active (OPEN or INVESTIGATING) case already exists
    const existingCase = await this.repo.findActiveCase(merchantId, {
      paymentRequestId: input.paymentRequestId,
      caseType: input.caseType,
      utr: input.utr
    });

    if (existingCase) {
      // Append evidence reference if not already tracked
      let updated = false;
      if (input.evidenceId) {
        const evidenceIdStr = input.evidenceId.toString();
        if (!existingCase.evidenceIds) existingCase.evidenceIds = [];
        if (!existingCase.evidenceIds.some((id: any) => id?.toString() === evidenceIdStr)) {
          existingCase.evidenceIds.push(input.evidenceId);
          updated = true;
        }
      }
      if (Array.isArray(input.evidenceIds)) {
        if (!existingCase.evidenceIds) existingCase.evidenceIds = [];
        for (const id of input.evidenceIds) {
          const idStr = id.toString();
          if (!existingCase.evidenceIds.some((existing: any) => existing?.toString() === idStr)) {
            existingCase.evidenceIds.push(id);
            updated = true;
          }
        }
      }

      if (updated) {
        if (!existingCase.history) existingCase.history = [];
        existingCase.history.push({
          action: 'ADDITIONAL_EVIDENCE_ATTACHED',
          performedByUserId: input.userId,
          notes: input.notes || 'Additional evidence linked to existing active case',
          previousStatus: existingCase.status,
          newStatus: existingCase.status,
          timestamp: new Date()
        });
        await this.repo.saveCase(existingCase);
      } else if (input.notes) {
        if (!existingCase.history) existingCase.history = [];
        existingCase.history.push({
          action: 'EVIDENCE_APPENDED',
          performedByUserId: input.userId,
          notes: input.notes,
          previousStatus: existingCase.status,
          newStatus: existingCase.status,
          timestamp: new Date()
        });
        await this.repo.saveCase(existingCase);
      }

      return existingCase;
    }

    // Load payment metadata if available
    let payment: any = null;
    if (input.paymentRequestId) {
      payment = await this.repo.findPaymentById(merchantId, input.paymentRequestId);
    }

    // Load evidence metadata if available
    let evidence: any = null;
    if (input.evidenceId) {
      evidence = await this.repo.findEvidenceById(merchantId, input.evidenceId);
    }

    const severity = input.severity || ReconciliationService.calculateSeverity(input.caseType);

    const initialHistory = [
      {
        action: 'CASE_CREATED',
        performedByUserId: input.userId,
        notes: input.notes || `Reconciliation case opened: ${input.reason}`,
        previousStatus: undefined,
        newStatus: ReconciliationCaseStatus.OPEN,
        timestamp: new Date()
      }
    ];

    const evidenceIds: any[] = [];
    if (input.evidenceId) evidenceIds.push(input.evidenceId);
    if (Array.isArray(input.evidenceIds)) {
      for (const id of input.evidenceIds) {
        if (!evidenceIds.includes(id)) evidenceIds.push(id);
      }
    }

    const caseData: any = {
      merchantId,
      paymentRequestId: input.paymentRequestId || undefined,
      evidenceId: input.evidenceId || undefined,
      evidenceIds,
      caseType: input.caseType,
      severity,
      reason: input.reason,
      status: ReconciliationCaseStatus.OPEN,
      expectedAmountPaise: input.expectedAmountPaise || payment?.amountPaise || undefined,
      receivedAmountPaise: input.receivedAmountPaise || evidence?.amountPaise || undefined,
      utr: input.utr || evidence?.utr || payment?.evidenceSummary?.utr || undefined,
      bankAccountId: input.bankAccountId || payment?.bankAccountId || evidence?.bankAccountId || undefined,
      accountSuffix: input.accountSuffix || payment?.accountSuffix || evidence?.accountIdentifier || undefined,
      orderId: payment?.orderId || undefined,
      checkoutReference: payment?.checkoutReference || undefined,
      hasEmailEvidence: input.hasEmailEvidence !== undefined ? input.hasEmailEvidence : (payment?.evidenceSummary?.hasEmailEvidence || evidence?.channel === EvidenceChannel.EMAIL || false),
      hasAndroidEvidence: input.hasAndroidEvidence !== undefined ? input.hasAndroidEvidence : (payment?.evidenceSummary?.hasAndroidEvidence || evidence?.channel === EvidenceChannel.ANDROID || false),
      history: initialHistory
    };

    const createdCase = await this.repo.createCase(caseData);
    const caseIdStr = (createdCase._id || createdCase.id).toString();

    // Dispatch webhook notification
    try {
      await this.webhookService.dispatchEvent(merchantId, WebhookEventType.RECONCILIATION_CASE_CREATED, {
        caseId: caseIdStr,
        paymentRequestId: input.paymentRequestId,
        caseType: input.caseType,
        severity,
        reason: input.reason,
        orderId: payment?.orderId,
        utr: caseData.utr
      });
    } catch {
      // Non-blocking in mock/offline environments
    }

    // Log to Audit Log
    await this.repo.createAuditLog({
      merchantId,
      userId: input.userId,
      action: 'RECONCILIATION_CASE_CREATED',
      resource: 'reconciliation_cases',
      resourceId: caseIdStr,
      details: {
        caseType: input.caseType,
        severity,
        paymentRequestId: input.paymentRequestId,
        evidenceId: input.evidenceId
      }
    });

    return createdCase;
  }

  /**
   * Updates case workflow status (OPEN -> INVESTIGATING -> RESOLVED / DISMISSED).
   */
  public async updateCaseStatus(
    merchantId: string,
    caseId: string,
    status: ReconciliationCaseStatus,
    notes?: string,
    userId?: string
  ): Promise<any> {
    const reconCase = await this.repo.findCaseById(merchantId, caseId);
    if (!reconCase) {
      throw new Error('Reconciliation case not found or access denied');
    }

    const previousStatus = reconCase.status;
    reconCase.status = status;
    if (!reconCase.history) reconCase.history = [];

    reconCase.history.push({
      action: 'STATUS_UPDATED',
      performedByUserId: userId,
      notes: notes || `Case status updated from ${previousStatus} to ${status}`,
      previousStatus,
      newStatus: status,
      timestamp: new Date()
    });

    await this.repo.saveCase(reconCase);
    const caseIdStr = (reconCase._id || reconCase.id).toString();

    try {
      await this.webhookService.dispatchEvent(merchantId, WebhookEventType.RECONCILIATION_CASE_UPDATED, {
        caseId: caseIdStr,
        previousStatus,
        newStatus: status,
        notes
      });
    } catch {
      // Non-blocking
    }

    await this.repo.createAuditLog({
      merchantId,
      userId,
      action: 'RECONCILIATION_CASE_STATUS_UPDATED',
      resource: 'reconciliation_cases',
      resourceId: caseIdStr,
      details: { previousStatus, newStatus: status, notes }
    });

    return reconCase;
  }

  /**
   * Resolves a reconciliation case adhering strictly to dual-source invariants:
   * Manual resolution must NEVER promote a single evidence source to SUCCESS.
   */
  public async resolveCase(
    merchantIdOrInput: string | { merchantId: string; caseId: string; action: any; notes?: string; resolutionNotes?: string; userId?: string },
    caseIdArg?: string,
    inputArg?: { action: any; resolutionNotes?: string; notes?: string; userId?: string }
  ): Promise<any> {
    let merchantId: string;
    let caseId: string;
    let action: any;
    let resolutionNotes: string;
    let userId: string | undefined;

    if (typeof merchantIdOrInput === 'string') {
      merchantId = merchantIdOrInput;
      caseId = caseIdArg!;
      action = inputArg!.action;
      resolutionNotes = inputArg!.resolutionNotes || inputArg!.notes || '';
      userId = inputArg!.userId;
    } else {
      merchantId = merchantIdOrInput.merchantId;
      caseId = merchantIdOrInput.caseId;
      action = merchantIdOrInput.action;
      resolutionNotes = merchantIdOrInput.resolutionNotes || merchantIdOrInput.notes || '';
      userId = merchantIdOrInput.userId;
    }

    const reconCase = await this.repo.findCaseById(merchantId, caseId);
    if (!reconCase) {
      throw new Error('Reconciliation case not found or access denied');
    }

    const previousStatus = reconCase.status;
    let resultingStatus: ReconciliationCaseStatus = ReconciliationCaseStatus.RESOLVED;

    if (action === 'DISMISS') {
      resultingStatus = ReconciliationCaseStatus.DISMISSED;
    } else if (action === 'CONFIRM_PAYMENT') {
      if (!reconCase.paymentRequestId) {
        throw new Error('Cannot confirm payment: Case does not have an identifiable payment request.');
      }

      const payment = await this.repo.findPaymentById(merchantId, (reconCase.paymentRequestId._id || reconCase.paymentRequestId).toString());
      if (!payment) {
        throw new Error('Payment request not found or access denied');
      }

      // Check evidence associations or denormalized summary
      const assocs = await this.repo.findAssocsByPaymentId(merchantId, (payment._id || payment.id).toString());
      const hasEmail = assocs.some((a: any) => a.channel === EvidenceChannel.EMAIL) || Boolean(payment.evidenceSummary?.hasEmailEvidence) || Boolean(reconCase.hasEmailEvidence);
      const hasAndroid = assocs.some((a: any) => a.channel === EvidenceChannel.ANDROID) || Boolean(payment.evidenceSummary?.hasAndroidEvidence) || Boolean(reconCase.hasAndroidEvidence);

      // INVARIANT: NEVER PROMOTE SINGLE EVIDENCE SOURCE TO SUCCESS
      if (!hasEmail || !hasAndroid) {
        throw new Error(
          'CANNOT_PROMOTE_SINGLE_SOURCE_TO_SUCCESS: Dual-source evidence policy strictly requires both EMAIL and ANDROID evidence before a payment can transition to SUCCESS. A single source can only remain in PARTIAL_SUCCESS or RECONCILIATION_REQUIRED.'
        );
      }

      // Both sources present: promote payment to SUCCESS
      payment.status = PaymentStatus.SUCCESS;
      payment.reviewReason = undefined;
      if (!payment.evidenceSummary) payment.evidenceSummary = { hasEmailEvidence: true, hasAndroidEvidence: true };
      payment.evidenceSummary.verifiedAt = new Date();
      await this.repo.savePayment(payment);
    } else if (action === 'FLAG_FRAUD') {
      if (reconCase.paymentRequestId) {
        const payment = await this.repo.findPaymentById(merchantId, (reconCase.paymentRequestId._id || reconCase.paymentRequestId).toString());
        if (payment) {
          payment.status = PaymentStatus.REVIEW_REQUIRED;
          payment.reviewReason = 'FRAUD_FLAGGED_BY_MERCHANT';
          await this.repo.savePayment(payment);
        }
      }
      if (Array.isArray(reconCase.evidenceIds)) {
        for (const evId of reconCase.evidenceIds) {
          const ev = await this.repo.findEvidenceById(merchantId, (evId._id || evId).toString());
          if (ev) {
            ev.status = EvidenceStatus.REVIEW_REQUIRED;
            await this.repo.saveEvidence(ev);
          }
        }
      }
    }

    reconCase.status = resultingStatus;
    reconCase.resolutionNotes = resolutionNotes;
    reconCase.resolvedByUserId = userId;
    if (!reconCase.history) reconCase.history = [];

    reconCase.history.push({
      action: `CASE_RESOLVED_${action}`,
      performedByUserId: userId,
      notes: resolutionNotes,
      previousStatus,
      newStatus: resultingStatus,
      timestamp: new Date()
    });

    await this.repo.saveCase(reconCase);
    const caseIdStr = (reconCase._id || reconCase.id).toString();

    try {
      await this.webhookService.dispatchEvent(merchantId, WebhookEventType.RECONCILIATION_CASE_RESOLVED, {
        caseId: caseIdStr,
        action,
        status: resultingStatus,
        resolutionNotes
      });
    } catch {
      // Non-blocking
    }

    await this.repo.createAuditLog({
      merchantId,
      userId,
      action: 'RECONCILIATION_CASE_RESOLVED',
      resource: 'reconciliation_cases',
      resourceId: caseIdStr,
      details: { action, status: resultingStatus, notes: resolutionNotes }
    });

    return reconCase;
  }

  /**
   * Appends notes to case audit history without modifying status.
   */
  public async addCaseNotes(
    merchantId: string,
    caseId: string,
    notes: string,
    userId?: string
  ): Promise<any> {
    const reconCase = await this.repo.findCaseById(merchantId, caseId);
    if (!reconCase) {
      throw new Error('Reconciliation case not found or access denied');
    }

    if (!reconCase.history) reconCase.history = [];
    reconCase.history.push({
      action: 'NOTE_ADDED',
      performedByUserId: userId,
      notes,
      previousStatus: reconCase.status,
      newStatus: reconCase.status,
      timestamp: new Date()
    });

    await this.repo.saveCase(reconCase);
    return reconCase;
  }

  /**
   * Automated reconciliation runner.
   * Scans for expired partial payments, rechecks counterpart evidence,
   * prevents duplicate cases, and does not reopen resolved cases without new evidence.
   */
  public async autoReconcile(merchantId: string): Promise<{
    evaluatedPayments: number;
    newCasesCreated: number;
    autoResolvedCases: number;
    unmatchedEvaluated: number;
  }> {
    let newCasesCreated = 0;
    let autoResolvedCases = 0;

    // 1. Re-evaluate any unmatched evidence using the matching engine
    let matchResult = { evaluated: 0, matched: 0 };
    try {
      matchResult = await defaultEvidenceMatchingService.reEvaluateUnmatchedEvidence(merchantId);
    } catch {
      // In-memory or offline environment
    }

    // 2. Scan for expired partial payments where the second source never arrived
    const expiredPartials = await this.repo.findExpiredPartialPayments(merchantId);

    for (const payment of expiredPartials) {
      payment.status = PaymentStatus.RECONCILIATION_REQUIRED;
      payment.reviewReason = 'PARTIAL_PAYMENT_EXPIRED_MISSING_SECOND_SOURCE';
      await this.repo.savePayment(payment);

      const existing = await this.repo.findActiveCase(merchantId, {
        paymentRequestId: payment._id || payment.id,
        caseType: ReconciliationCaseType.MISSING_SECOND_SOURCE
      });

      if (!existing) {
        await this.createOrUpdateCase(merchantId, {
          paymentRequestId: (payment._id || payment.id).toString(),
          caseType: ReconciliationCaseType.MISSING_SECOND_SOURCE,
          severity: ReconciliationCaseSeverity.LOW,
          reason: 'Payment expired while in PARTIAL_SUCCESS without counterpart evidence.',
          expectedAmountPaise: payment.amountPaise,
          utr: payment.evidenceSummary?.utr,
          bankAccountId: payment.bankAccountId?.toString(),
          accountSuffix: payment.accountSuffix
        });
        newCasesCreated++;
      }
    }

    // 3. Scan open/investigating cases and check if counterpart evidence has resolved the payment
    const openCasesRes = await this.repo.listCases(merchantId, {
      status: ReconciliationCaseStatus.OPEN
    });

    for (const reconCase of openCasesRes.cases) {
      if (reconCase.paymentRequestId) {
        const paymentIdStr = (reconCase.paymentRequestId._id || reconCase.paymentRequestId).toString();
        const payment = await this.repo.findPaymentById(merchantId, paymentIdStr);

        if (payment && payment.status === PaymentStatus.SUCCESS) {
          // Both sources have arrived and payment was satisfied! Auto-resolve case
          reconCase.status = ReconciliationCaseStatus.RESOLVED;
          reconCase.resolutionNotes = 'Auto-reconciled: Counterpart evidence matched and verified dual-source requirement.';
          if (!reconCase.history) reconCase.history = [];
          reconCase.history.push({
            action: 'AUTO_RESOLVED',
            notes: 'Dual-source payment confirmed via automated reconciliation.',
            previousStatus: ReconciliationCaseStatus.OPEN,
            newStatus: ReconciliationCaseStatus.RESOLVED,
            timestamp: new Date()
          });
          await this.repo.saveCase(reconCase);
          autoResolvedCases++;
        }
      }
    }

    await this.repo.createAuditLog({
      merchantId,
      action: 'RECONCILIATION_AUTO_RUN',
      resource: 'reconciliation_cases',
      details: {
        evaluatedPayments: expiredPartials.length,
        newCasesCreated,
        autoResolvedCases,
        unmatchedEvaluated: matchResult.evaluated
      }
    });

    return {
      evaluatedPayments: expiredPartials.length,
      newCasesCreated,
      autoResolvedCases,
      unmatchedEvaluated: matchResult.evaluated
    };
  }

  public async listCases(merchantId: string, filter?: ReconciliationFilter) {
    return this.repo.listCases(merchantId, filter);
  }

  public async getCaseById(merchantId: string, caseId: string) {
    return this.repo.findCaseById(merchantId, caseId);
  }
}

export const defaultReconciliationService = new ReconciliationService();
