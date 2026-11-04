import {
  ApiKey,
  IApiKey
} from '../database/models';
import {
  EnvironmentMode,
  generateApiKey,
  generateRandomId
} from '@rgs-ledger/shared';

export class ApiKeyService {
  static async createKey(data: {
    merchantId: string;
    name?: string;
    environment?: EnvironmentMode;
  }): Promise<{ apiKey: IApiKey; secretKey: string }> {
    const environment = data.environment || EnvironmentMode.SANDBOX;
    const generated = generateApiKey(environment === EnvironmentMode.LIVE ? 'LIVE' : 'SANDBOX');
    const keyRecordId = generateRandomId('key');

    const apiKey = await ApiKey.create({
      _id: keyRecordId,
      merchantId: data.merchantId,
      name: data.name || `${environment} API Key`,
      keyId: generated.keyId,
      hashedSecret: generated.hashedSecret,
      prefix: generated.prefix,
      environment,
      isActive: true
    });

    return {
      apiKey,
      secretKey: generated.secretKey // returned ONLY once during creation
    };
  }

  static async listKeys(merchantId: string): Promise<IApiKey[]> {
    return ApiKey.find({ merchantId, isActive: true })
      .select('-hashedSecret')
      .sort({ createdAt: -1 })
      .exec();
  }

  static async revokeKey(keyId: string, merchantId: string): Promise<boolean> {
    const result = await ApiKey.updateOne(
      { keyId, merchantId },
      { $set: { isActive: false } }
    ).exec();
    return result.modifiedCount > 0;
  }

  static async rotateKey(keyId: string, merchantId: string): Promise<{ newApiKey: IApiKey; secretKey: string }> {
    const existing = await ApiKey.findOne({ keyId, merchantId, isActive: true }).exec();
    if (!existing) {
      const err: any = new Error(`Active API key ${keyId} not found`);
      err.status = 404;
      err.code = 'KEY_NOT_FOUND';
      throw err;
    }

    // Revoke old key
    existing.isActive = false;
    await existing.save();

    // Create fresh key
    const created = await this.createKey({
      merchantId,
      name: `${existing.name} (Rotated)`,
      environment: existing.environment as EnvironmentMode
    });

    return {
      newApiKey: created.apiKey,
      secretKey: created.secretKey
    };
  }
}
