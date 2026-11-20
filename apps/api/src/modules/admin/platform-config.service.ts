import mongoose from 'mongoose';
import { PlatformConfigModel } from '../../database/models.js';

export interface RuntimePlatformSettings {
  paymentExpirySeconds: number;
  evidenceMatchingWindowSeconds: number;
  reconciliationScheduleIntervalSeconds: number;
  webhookMaxRetries: number;
  webhookBackoffFactor: number;
  evidenceRetentionDays: number;
  rateLimitPerMinute: number;
}

export class PlatformConfigService {
  private cachedSettings: RuntimePlatformSettings = {
    paymentExpirySeconds: 900,
    evidenceMatchingWindowSeconds: 1800,
    reconciliationScheduleIntervalSeconds: 60,
    webhookMaxRetries: 5,
    webhookBackoffFactor: 4,
    evidenceRetentionDays: 90,
    rateLimitPerMinute: 120
  };

  private isInitialized = false;

  /**
   * Initializes or loads configuration from MongoDB into active memory
   */
  public async loadSettings(): Promise<RuntimePlatformSettings> {
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = (await PlatformConfigModel.findOne({ key: 'default' }).lean()) as any;
        if (doc) {
          this.cachedSettings = {
            paymentExpirySeconds: doc.paymentExpirySeconds ?? 900,
            evidenceMatchingWindowSeconds: doc.evidenceMatchingWindowSeconds ?? 1800,
            reconciliationScheduleIntervalSeconds: doc.reconciliationScheduleIntervalSeconds ?? 60,
            webhookMaxRetries: doc.webhookMaxRetries ?? 5,
            webhookBackoffFactor: doc.webhookBackoffFactor ?? 4,
            evidenceRetentionDays: doc.evidenceRetentionDays ?? 90,
            rateLimitPerMinute: doc.rateLimitPerMinute ?? 120
          };
        }
        this.isInitialized = true;
      } catch {
        // In-memory defaults remain active if database is not yet ready during boot
      }
    }
    return { ...this.cachedSettings };
  }

  /**
   * Updates configuration in memory and MongoDB
   */
  public async updateSettings(
    updates: Partial<RuntimePlatformSettings>,
    updatedByUserId?: string
  ): Promise<RuntimePlatformSettings> {
    // Update in-memory cache immediately for sub-millisecond propagation across services
    this.cachedSettings = {
      ...this.cachedSettings,
      ...updates
    };

    if (mongoose.connection.readyState === 1) {
      try {
        await PlatformConfigModel.findOneAndUpdate(
          { key: 'default' },
          {
            $set: {
              ...updates,
              updatedBy: updatedByUserId,
              updatedAt: new Date()
            }
          },
          { new: true, upsert: true }
        );
      } catch {
        // Log DB sync failure; in-memory cache remains active
      }
    }

    return { ...this.cachedSettings };
  }

  public getSettings(): RuntimePlatformSettings {
    return { ...this.cachedSettings };
  }

  public getPaymentExpirySeconds(): number {
    return this.cachedSettings.paymentExpirySeconds;
  }

  public getEvidenceMatchingWindowSeconds(): number {
    return this.cachedSettings.evidenceMatchingWindowSeconds;
  }

  public getReconciliationScheduleIntervalSeconds(): number {
    return this.cachedSettings.reconciliationScheduleIntervalSeconds;
  }

  public getWebhookMaxRetries(): number {
    return this.cachedSettings.webhookMaxRetries;
  }

  public getWebhookBackoffFactor(): number {
    return this.cachedSettings.webhookBackoffFactor;
  }

  public getEvidenceRetentionDays(): number {
    return this.cachedSettings.evidenceRetentionDays;
  }

  public getRateLimitPerMinute(): number {
    return this.cachedSettings.rateLimitPerMinute;
  }

  public isConfigInitialized(): boolean {
    return this.isInitialized;
  }
}

export const platformConfigService = new PlatformConfigService();
