import crypto from 'crypto';
import { ApiCredentialModel, AuditLogModel } from '../../database/models.js';
import { CreateApiKeySchema } from '@rgs-ledger/validation';
import { ApiKeyDto, CreateApiKeyResponse, RotateApiKeyResponse } from '@rgs-ledger/api-contracts';

export class ApiKeyService {
  /**
   * Generates a new merchant API Key pair.
   * The secret is hashed with SHA-256 before storage and returned in plaintext ONLY ONCE.
   */
  public async createApiKey(merchantId: string, input: any, userId?: string): Promise<CreateApiKeyResponse> {
    const validated = CreateApiKeySchema.parse(input);
    const env = validated.environment || 'PRODUCTION';
    const envTag = env === 'SANDBOX' ? 'test' : 'live';

    // 1. Generate public Key ID (e.g. rgs_live_abc123456789)
    const keyRandom = crypto.randomBytes(8).toString('hex');
    const keyId = `rgs_${envTag}_${keyRandom}`;
    const keyPrefix = `rgs_${envTag}_${keyRandom.substring(0, 4)}...`;

    // 2. Generate cryptographically strong raw Secret (e.g. rgs_sec_live_...)
    const secretRandom = crypto.randomBytes(24).toString('hex');
    const rawSecret = `rgs_sec_${envTag}_${secretRandom}`;

    // 3. Compute SHA-256 hash for secure storage (never store raw secret)
    const secretHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    const keyDoc = await ApiCredentialModel.create({
      merchantId,
      name: validated.name.trim(),
      keyId,
      keyPrefix,
      secretHash,
      environment: env,
      scopes: validated.scopes && validated.scopes.length > 0 ? validated.scopes : ['*'],
      expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : undefined,
      isActive: true
    });

    // Write security audit log
    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'API_KEY_CREATED',
      resource: 'api_credentials',
      resourceId: keyDoc._id.toString(),
      details: { keyId, environment: env, scopes: keyDoc.scopes }
    }).catch(() => {});

    return {
      apiKey: this.formatApiKeyDto(keyDoc),
      rawSecret,
      warning: 'Please save your API secret key now. For security reasons, it cannot be displayed or retrieved again.'
    };
  }

  /**
   * Lists all API keys registered for a merchant (raw secrets are never returned).
   */
  public async listApiKeys(merchantId: string): Promise<ApiKeyDto[]> {
    const keys = await ApiCredentialModel.find({ merchantId }).sort({ createdAt: -1 });
    return keys.map((k) => this.formatApiKeyDto(k));
  }

  /**
   * Rotates an API Key's secret, invalidating the previous secret immediately.
   */
  public async rotateApiKey(merchantId: string, keyIdOrDbId: string, userId?: string): Promise<RotateApiKeyResponse> {
    const keyDoc = await ApiCredentialModel.findOne({
      merchantId,
      $or: [{ _id: keyIdOrDbId.match(/^[0-9a-fA-F]{24}$/) ? keyIdOrDbId : undefined }, { keyId: keyIdOrDbId }].filter(Boolean)
    });

    if (!keyDoc) {
      throw new Error('API Key not found or access denied');
    }

    if (!keyDoc.isActive) {
      throw new Error('Cannot rotate a revoked or inactive API Key');
    }

    const envTag = keyDoc.environment === 'SANDBOX' ? 'test' : 'live';
    const secretRandom = crypto.randomBytes(24).toString('hex');
    const newSecret = `rgs_sec_${envTag}_${secretRandom}`;
    const secretHash = crypto.createHash('sha256').update(newSecret).digest('hex');

    keyDoc.secretHash = secretHash;
    await keyDoc.save();

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'API_KEY_ROTATED',
      resource: 'api_credentials',
      resourceId: keyDoc._id.toString(),
      details: { keyId: keyDoc.keyId }
    }).catch(() => {});

    return {
      apiKey: this.formatApiKeyDto(keyDoc),
      newSecret,
      warning: 'API Key secret has been rotated. Update your applications immediately with the new secret.'
    };
  }

  /**
   * Revokes an API Key permanently.
   */
  public async revokeApiKey(merchantId: string, keyIdOrDbId: string, userId?: string): Promise<ApiKeyDto> {
    const keyDoc = await ApiCredentialModel.findOne({
      merchantId,
      $or: [{ _id: keyIdOrDbId.match(/^[0-9a-fA-F]{24}$/) ? keyIdOrDbId : undefined }, { keyId: keyIdOrDbId }].filter(Boolean)
    });

    if (!keyDoc) {
      throw new Error('API Key not found or access denied');
    }

    keyDoc.isActive = false;
    await keyDoc.save();

    await AuditLogModel.create({
      merchantId,
      userId,
      action: 'API_KEY_REVOKED',
      resource: 'api_credentials',
      resourceId: keyDoc._id.toString(),
      details: { keyId: keyDoc.keyId }
    }).catch(() => {});

    return this.formatApiKeyDto(keyDoc);
  }

  private formatApiKeyDto(doc: any): ApiKeyDto {
    return {
      id: doc._id.toString(),
      merchantId: doc.merchantId.toString(),
      name: doc.name,
      keyId: doc.keyId,
      keyPrefix: doc.keyPrefix,
      environment: doc.environment || 'PRODUCTION',
      scopes: doc.scopes || ['*'],
      isActive: doc.isActive !== false,
      lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
      expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : new Date().toISOString()
    };
  }
}

export const defaultApiKeyService = new ApiKeyService();
