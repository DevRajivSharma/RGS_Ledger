import crypto from 'crypto';

export interface GeneratedApiKey {
  keyId: string;
  secretKey: string;
  hashedSecret: string;
  prefix: string;
}

/**
 * Generates merchant API keys in format:
 * Public Key ID: rl_test_pk_<random> or rl_live_pk_<random>
 * Secret Key: rl_test_sk_<random> or rl_live_sk_<random>
 */
export function generateApiKey(environment: 'SANDBOX' | 'LIVE'): GeneratedApiKey {
  const envPrefix = environment === 'SANDBOX' ? 'test' : 'live';
  const keyId = `rl_${envPrefix}_pk_${crypto.randomBytes(12).toString('hex')}`;
  const secretKey = `rl_${envPrefix}_sk_${crypto.randomBytes(24).toString('hex')}`;
  
  const hashedSecret = hashSecret(secretKey);
  const prefix = secretKey.slice(0, 16);

  return {
    keyId,
    secretKey,
    hashedSecret,
    prefix
  };
}

/**
 * SHA-256 hash for secure storage of merchant secret API keys
 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Signs webhook payload with HMAC-SHA256 and timestamp
 */
export function signWebhookPayload(payload: string, secret: string, timestamp: number): string {
  const signaturePayload = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');
}

/**
 * Constant-time signature verification prevents timing attacks
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  try {
    // Header format: t=1612345678,v1=9b...
    const parts = signatureHeader.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return false;
    }

    const timestamp = parseInt(timestampPart.replace('t=', ''), 10);
    const providedSignature = signaturePart.replace('v1=', '');

    if (isNaN(timestamp)) {
      return false;
    }

    // Check for replay attacks using tolerance window
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false;
    }

    const expectedSignature = signWebhookPayload(payload, secret, timestamp);

    const bufProvided = Buffer.from(providedSignature, 'hex');
    const bufExpected = Buffer.from(expectedSignature, 'hex');

    if (bufProvided.length !== bufExpected.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufProvided, bufExpected);
  } catch {
    return false;
  }
}

/**
 * Cryptographically random UUID generation
 */
export function generateRandomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Derives a 32-byte Buffer from hex string or raw passphrase
 */
function getKeyBuffer(key: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * AES-256-GCM authenticated encryption for sensitive provider credentials
 * Returns serialized string format: iv:authTag:ciphertext (hex encoded)
 */
export function encryptSecret(plaintext: string, secretKey: string): string {
  if (!plaintext) return '';
  const keyBuf = getKeyBuffer(secretKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM authenticated decryption
 */
export function decryptSecret(encryptedPayload: string, secretKey: string): string {
  if (!encryptedPayload) return '';
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format: expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const keyBuf = getKeyBuffer(secretKey);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Safely masks sensitive keys/secrets for logging and UI display (e.g., 'sec_...9f2a')
 */
export function maskSecret(secret?: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '****';
  const prefix = secret.slice(0, 4);
  const suffix = secret.slice(-4);
  return `${prefix}${'*'.repeat(Math.min(secret.length - 8, 8))}${suffix}`;
}

