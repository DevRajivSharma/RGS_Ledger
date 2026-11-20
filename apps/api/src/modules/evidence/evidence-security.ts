import crypto from 'node:crypto';
import { config } from '../../config/index.js';

export class EvidenceSecurity {
  private static getKeyBuffer(keyHex?: string): Buffer {
    const rawKey = keyHex || config.ENCRYPTION_KEY_HEX;
    if (!rawKey || rawKey.length < 64) {
      throw new Error('Invalid encryption key: must be a 64-character hex string (32 bytes).');
    }
    return Buffer.from(rawKey, 'hex');
  }

  /**
   * Encrypts plaintext string using AES-256-GCM.
   * Returns formatted string: `${ivHex}:${authTagHex}:${cipherHex}`.
   */
  public static encryptPayload(plaintext: string, keyHex?: string): string {
    const key = this.getKeyBuffer(keyHex);
    const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts an AES-256-GCM formatted ciphertext string.
   */
  public static decryptPayload(encryptedPackage: string, keyHex?: string): string {
    const parts = encryptedPackage.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted package format. Expected iv:authTag:ciphertext');
    }

    const [ivHex, tagHex, cipherHex] = parts;
    if (!ivHex || !tagHex || !cipherHex) {
      throw new Error('Invalid encrypted package format. Expected iv:authTag:ciphertext');
    }

    const key = this.getKeyBuffer(keyHex);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = decipher.update(cipherHex, 'hex', 'utf8') + decipher.final('utf8');

    return decrypted;
  }

  /**
   * Computes SHA-256 hex digest of the raw payload string.
   */
  public static computeRawPayloadHash(payload: string): string {
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /**
   * Computes deterministic deduplication hash for an incoming evidence message.
   * Scoped to merchantId, channel, provider, and providerMessageId.
   */
  public static computeDeduplicationHash(
    merchantId: string,
    channel: string,
    provider: string,
    providerMessageId: string,
    payloadSnippet: string = ''
  ): string {
    const canonicalKey = [
      merchantId.trim(),
      channel.trim().toUpperCase(),
      provider.trim().toUpperCase(),
      providerMessageId.trim(),
      payloadSnippet.trim()
    ].join('::');

    return crypto.createHash('sha256').update(canonicalKey, 'utf8').digest('hex');
  }

  /**
   * Masks a bank account or card number, retaining only the last 4 characters.
   * E.g. "123456789012" -> "••••••••9012" or "XX9012"
   */
  public static maskAccountNumber(account: string): string {
    const trimmed = account.trim();
    if (trimmed.length <= 4) {
      return '••••' + trimmed;
    }
    const last4 = trimmed.slice(-4);
    return '••••••••' + last4;
  }

  /**
   * Redacts sensitive patterns (OTPs, passwords, full account numbers) from text.
   */
  public static redactSensitiveText(text: string): string {
    if (!text) return '';

    return text
      // Redact OTP patterns (e.g. "OTP: 123456", "one time password is 654321")
      .replace(/\b(otp|one time password|verification code)\s*(?:is|:)?\s*([0-9]{4,8})\b/gi, '$1: [REDACTED]')
      // Redact passwords or PINs
      .replace(/\b(password|pin|mpin)\s*(?:is|:)?\s*([^\s,.]+)/gi, '$1: [REDACTED]')
      // Mask account numbers appearing in sentences: e.g. "A/c *1234" or "Account ending in 1234"
      .replace(/\b(A\/c|Account|acct|A\/C)\s*(?:no\.?|number)?\s*[:#-]?\s*([0-9Xx*]+)/gi, (_match, prefix, num) => {
        const last4 = num.replace(/\D/g, '').slice(-4);
        return `${prefix} ending in ••••${last4 || 'XXXX'}`;
      });
  }

  /**
   * Deep-redacts sensitive keys from metadata objects.
   */
  public static redactObject<T extends Record<string, any>>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj;

    const sensitiveKeyPatterns = [/password/i, /pin/i, /otp/i, /secret/i, /token/i, /cvv/i];

    const copy = Array.isArray(obj) ? ([...obj] as any) : { ...obj };

    for (const key of Object.keys(copy)) {
      if (sensitiveKeyPatterns.some((p) => p.test(key))) {
        copy[key] = '[REDACTED]';
      } else if (typeof copy[key] === 'object' && copy[key] !== null) {
        copy[key] = this.redactObject(copy[key]);
      }
    }

    return copy;
  }
}
