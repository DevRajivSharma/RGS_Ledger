import {
  EvidenceStatus,
  getEvidenceChannel,
  NormalizedEvidence
} from '@rgs-ledger/shared-types';
import {
  PaymentEvidenceModel,
  EvidenceIngestionAttemptModel
} from '../../database/models.js';
import { EvidenceNormalizer, RawEvidenceInput } from './evidence-normalizer.js';
import { EvidenceSecurity } from './evidence-security.js';

export interface IngestionResult {
  attemptId: string;
  isDuplicate: boolean;
  status: 'SUCCESS' | 'DUPLICATE' | 'FAILED';
  evidenceId?: string;
  evidenceStatus?: EvidenceStatus;
  rejectionReason?: string;
  normalized?: NormalizedEvidence;
}

export interface IEvidenceIngestionRepository {
  findEvidenceByDeduplicationHash(merchantId: string, deduplicationHash: string): Promise<any>;
  findEvidenceByRawPayloadHash?(merchantId: string, channel: string, rawPayloadHash: string): Promise<any>;
  findEvidenceByUtr?(merchantId: string, utr: string): Promise<any[]>;
  updateEvidenceStatus?(merchantId: string, evidenceId: string, status: EvidenceStatus, rejectionReason?: string): Promise<any>;
  createEvidence(merchantId: string, data: any): Promise<any>;
  createAttempt(merchantId: string, data: any): Promise<any>;
}

export class MongoEvidenceIngestionRepository implements IEvidenceIngestionRepository {
  async findEvidenceByDeduplicationHash(merchantId: string, deduplicationHash: string): Promise<any> {
    return PaymentEvidenceModel.findOne({ merchantId, deduplicationHash });
  }

  async findEvidenceByRawPayloadHash(merchantId: string, channel: string, rawPayloadHash: string): Promise<any> {
    return PaymentEvidenceModel.findOne({ merchantId, channel, rawPayloadHash });
  }

  async findEvidenceByUtr(merchantId: string, utr: string): Promise<any[]> {
    return PaymentEvidenceModel.find({ merchantId, utr });
  }

  async updateEvidenceStatus(merchantId: string, evidenceId: string, status: EvidenceStatus, rejectionReason?: string): Promise<any> {
    return PaymentEvidenceModel.updateOne(
      { _id: evidenceId, merchantId },
      { $set: { status, rejectionReason } }
    );
  }

  async createEvidence(merchantId: string, data: any): Promise<any> {
    return PaymentEvidenceModel.create({ ...data, merchantId });
  }

  async createAttempt(merchantId: string, data: any): Promise<any> {
    return EvidenceIngestionAttemptModel.create({ ...data, merchantId });
  }
}

export class EvidenceIngestionService {
  private repository: IEvidenceIngestionRepository;

  constructor(repository: IEvidenceIngestionRepository = new MongoEvidenceIngestionRepository()) {
    this.repository = repository;
  }

  /**
   * Idempotently ingests incoming payment evidence from any provider (Gmail, Outlook, Android companion).
   * Enforces multi-tier deduplication, merchant tenant isolation, and debit/review classification.
   */
  public async ingestEvidence(
    input: RawEvidenceInput,
    options?: { idempotencyKey?: string; ipAddress?: string }
  ): Promise<IngestionResult> {
    const channel = getEvidenceChannel(input.provider);

    // 1. Calculate deduplication hash upfront
    const deduplicationHash = EvidenceSecurity.computeDeduplicationHash(
      input.merchantId,
      channel,
      input.provider,
      input.providerMessageId
    );

    // 2. Normalize evidence domain payload upfront
    const normalized = EvidenceNormalizer.normalize(input);

    // Check for missing UTR reference
    let initialStatus =
      input.initialStatus ||
      (normalized.status === EvidenceStatus.REJECTED
        ? EvidenceStatus.REJECTED
        : EvidenceStatus.UNMATCHED);
    let rejectionReason = input.rejectionReason || normalized.rejectionReason;

    if (!normalized.utr && initialStatus !== EvidenceStatus.REJECTED) {
      initialStatus = EvidenceStatus.REVIEW_REQUIRED;
      rejectionReason = rejectionReason || 'MISSING_UTR_REFERENCE';
    }

    // --- MULTI-TIER DEDUPLICATION & CONFLICT DETECTION ---
    // Tier 1: Check by exact deduplication hash (same provider message ID)
    let existing = await this.repository.findEvidenceByDeduplicationHash(
      input.merchantId,
      deduplicationHash
    );

    // Tier 2: Check by raw payload hash within the same channel
    if (!existing && normalized.rawPayloadHash && this.repository.findEvidenceByRawPayloadHash) {
      existing = await this.repository.findEvidenceByRawPayloadHash(
        input.merchantId,
        channel,
        normalized.rawPayloadHash
      );
    }

    // Tier 3: Check by non-null UTR within the same merchant
    if (normalized.utr && this.repository.findEvidenceByUtr) {
      const existingUtrDocs = await this.repository.findEvidenceByUtr(
        input.merchantId,
        normalized.utr
      );

      if (existingUtrDocs && existingUtrDocs.length > 0) {
        // Check for conflicting amounts for the same UTR
        const conflictingDoc = existingUtrDocs.find(
          (doc: any) => doc.amountPaise !== normalized.amountPaise
        );

        if (conflictingDoc) {
          // Flag conflicting documents as REVIEW_REQUIRED
          if (this.repository.updateEvidenceStatus) {
            await this.repository.updateEvidenceStatus(
              input.merchantId,
              (conflictingDoc._id || conflictingDoc.id).toString(),
              EvidenceStatus.REVIEW_REQUIRED,
              'CONFLICTING_AMOUNT_FOR_SAME_UTR'
            );
          }

          initialStatus = EvidenceStatus.REVIEW_REQUIRED;
          rejectionReason = 'CONFLICTING_AMOUNT_FOR_SAME_UTR';
        } else if (!existing) {
          // If amounts match, check if this SAME channel already recorded this UTR
          const sameChannelDoc = existingUtrDocs.find(
            (doc: any) => doc.channel === channel
          );
          if (sameChannelDoc) {
            existing = sameChannelDoc;
          }
        }
      }
    }

    if (existing) {
      // Record duplicate ingestion attempt
      const attempt = await this.repository.createAttempt(input.merchantId, {
        channel,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        idempotencyKey: options?.idempotencyKey,
        ipAddress: options?.ipAddress,
        status: 'DUPLICATE',
        evidenceId: existing._id || existing.id,
        attemptedAt: new Date()
      });

      return {
        attemptId: (attempt._id || attempt.id).toString(),
        isDuplicate: true,
        status: 'DUPLICATE',
        evidenceId: (existing._id || existing.id).toString(),
        evidenceStatus: existing.status,
        rejectionReason: existing.rejectionReason
      };
    }

    try {
      // 4. Persist PaymentEvidence record
      const evidenceDoc = await this.repository.createEvidence(input.merchantId, {
        bankAccountId: input.bankAccountId || normalized.bankAccountId || null,
        channel,
        provider: input.provider,
        source: input.provider === 'ANDROID_COMPANION' ? 'ANDROID_COMPANION' : `EMAIL_${input.provider}`,
        providerMessageId: input.providerMessageId,
        senderOrPackage: input.senderOrPackage,
        accountIdentifier: normalized.accountIdentifier,
        transactionType: normalized.transactionType,
        amountPaise: normalized.amountPaise,
        currency: 'INR',
        utr: normalized.utr,
        transactionTimestamp: normalized.transactionTimestamp,
        receivedAt: normalized.receivedAt,
        status: initialStatus,
        rejectionReason: rejectionReason,
        deduplicationHash,
        rawPayloadHash: normalized.rawPayloadHash,
        encryptedRawPayload: normalized.encryptedRawPayload,
        templateId: input.templateId,
        templateVersion: input.templateVersion,
        metadata: normalized.metadata
      });

      const evidenceId = (evidenceDoc._id || evidenceDoc.id).toString();

      // 5. Record successful ingestion attempt
      const attempt = await this.repository.createAttempt(input.merchantId, {
        channel,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        idempotencyKey: options?.idempotencyKey,
        ipAddress: options?.ipAddress,
        status: 'SUCCESS',
        evidenceId: evidenceDoc._id || evidenceDoc.id,
        attemptedAt: new Date()
      });

      normalized.id = evidenceId;
      normalized.status = initialStatus;
      normalized.rejectionReason = rejectionReason;

      return {
        attemptId: (attempt._id || attempt.id).toString(),
        isDuplicate: false,
        status: 'SUCCESS',
        evidenceId,
        evidenceStatus: initialStatus,
        rejectionReason: rejectionReason,
        normalized
      };
    } catch (err: any) {
      // Handle race condition duplicate key error from MongoDB unique index
      if (err.code === 11000) {
        const raceExisting = await this.repository.findEvidenceByDeduplicationHash(
          input.merchantId,
          deduplicationHash
        );

        const attempt = await this.repository.createAttempt(input.merchantId, {
          channel,
          provider: input.provider,
          providerMessageId: input.providerMessageId,
          status: 'DUPLICATE',
          evidenceId: raceExisting?._id || raceExisting?.id,
          attemptedAt: new Date()
        });

        return {
          attemptId: (attempt._id || attempt.id).toString(),
          isDuplicate: true,
          status: 'DUPLICATE',
          evidenceId: (raceExisting?._id || raceExisting?.id)?.toString(),
          evidenceStatus: raceExisting?.status,
          rejectionReason: raceExisting?.rejectionReason
        };
      }

      // Record failed ingestion attempt
      const attempt = await this.repository.createAttempt(input.merchantId, {
        channel,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        status: 'FAILED',
        errorMessage: err.message,
        attemptedAt: new Date()
      });

      throw new Error(`Evidence ingestion failed [attempt: ${attempt._id || attempt.id}]: ${err.message}`);
    }
  }

  /**
   * Static convenience wrapper delegating to the default singleton instance.
   */
  public static async ingestEvidence(
    input: RawEvidenceInput,
    options?: { idempotencyKey?: string; ipAddress?: string }
  ): Promise<IngestionResult> {
    return defaultEvidenceIngestionService.ingestEvidence(input, options);
  }
}

export const defaultEvidenceIngestionService = new EvidenceIngestionService();
