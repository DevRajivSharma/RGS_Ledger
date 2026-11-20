import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

function scryptAsync(password: string, salt: string, keylen: number, options: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

export interface TokenPayload {
  userId: string;
  merchantId?: string;
  role: string;
  email?: string;
}

export const security = {
  /**
   * Hashes a plaintext password asynchronously using crypto.scrypt with a random salt.
   * Delegates computation to the libuv threadpool to avoid blocking the Express event loop.
   */
  async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1
    })) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  },

  /**
   * Verifies a password against a stored salt:hash string using constant-time comparison asynchronously.
   */
  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;

    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = (await scryptAsync(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1
    })) as Buffer;

    if (keyBuffer.length !== derivedKey.length) {
      return false;
    }

    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  },

  /**
   * Generates a signed JWT access token.
   */
  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRY as any
    });
  },

  /**
   * Verifies and decodes a JWT access token.
   */
  verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, config.JWT_ACCESS_SECRET) as TokenPayload;
  },

  /**
   * Generates a secure random refresh token and its HMAC-SHA-256 hash for database storage.
   * Utilizes config.JWT_REFRESH_SECRET independently from access-token signing.
   */
  generateRefreshToken(): { token: string; hash: string } {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = this.hashRefreshToken(token);
    return { token, hash };
  },

  /**
   * Hashes a refresh token for lookup/comparison using HMAC-SHA-256 with JWT_REFRESH_SECRET.
   */
  hashRefreshToken(token: string): string {
    return crypto.createHmac('sha256', config.JWT_REFRESH_SECRET).update(token).digest('hex');
  },

  /**
   * Generates a secure public checkout session reference (chk_...).
   */
  generateCheckoutReference(): string {
    return `chk_${crypto.randomBytes(16).toString('hex')}`;
  },

  /**
   * Generates a unique payment ID (pay_...).
   */
  generatePaymentId(): string {
    return `pay_${crypto.randomBytes(12).toString('hex')}`;
  }
};
