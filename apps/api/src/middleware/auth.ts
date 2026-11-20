import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { security, TokenPayload } from '../utils/security.js';
import { ApiCredentialModel, findMerchantByIdDefensive, findUserByIdDefensive } from '../database/models.js';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  merchantId?: string;
  authType?: 'JWT' | 'API_KEY';
  apiKey?: any;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Check for API Key in custom headers (X-API-Key and X-API-Secret)
  const xApiKey = req.headers['x-api-key'] as string | undefined;
  const xApiSecret = req.headers['x-api-secret'] as string | undefined;

  let apiKeyId: string | undefined;
  let apiRawSecret: string | undefined;

  if (xApiKey && xApiSecret) {
    apiKeyId = xApiKey.trim();
    apiRawSecret = xApiSecret.trim();
  }

  // 2. Check Authorization header
  const authHeader = req.headers.authorization;
  if (!apiKeyId && authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      // Check if Bearer contains "keyId:secret" format
      if (token.includes(':') && (token.startsWith('rgs_live_') || token.startsWith('rgs_test_'))) {
        const [k, s] = token.split(':');
        apiKeyId = k;
        apiRawSecret = s;
      }
    } else if (authHeader.startsWith('Basic ')) {
      try {
        const decoded = Buffer.from(authHeader.substring(6).trim(), 'base64').toString('utf8');
        if (decoded.includes(':')) {
          const [k, s] = decoded.split(':');
          if (k && (k.startsWith('rgs_live_') || k.startsWith('rgs_test_'))) {
            apiKeyId = k;
            apiRawSecret = s;
          }
        }
      } catch {
        // Fall through to error
      }
    }
  }

  // 3. Authenticate via API Key credentials if present
  if (apiKeyId && apiRawSecret) {
    if (!apiKeyId.startsWith('rgs_live_') && !apiKeyId.startsWith('rgs_test_')) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_API_KEY', message: 'API key must start with rgs_live_ or rgs_test_' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }
    try {
      const keyDoc = await ApiCredentialModel.findOne({ keyId: apiKeyId, isActive: true });
      if (!keyDoc) {
        res.status(401).json({
          success: false,
          error: { code: 'INVALID_API_KEY', message: 'API key not found, inactive, or revoked' },
          meta: { timestamp: new Date().toISOString() }
        });
        return;
      }

      // Check key expiry
      if (keyDoc.expiresAt && new Date() > new Date(keyDoc.expiresAt)) {
        res.status(401).json({
          success: false,
          error: { code: 'API_KEY_EXPIRED', message: 'API key has expired. Please rotate or generate a new key.' },
          meta: { timestamp: new Date().toISOString() }
        });
        return;
      }

      // Verify secret hash using timing-safe comparison
      const computedHash = crypto.createHash('sha256').update(apiRawSecret).digest('hex');
      const hashBufferA = Buffer.from(computedHash, 'hex');
      const hashBufferB = Buffer.from(keyDoc.secretHash, 'hex');

      if (hashBufferA.length !== hashBufferB.length || !crypto.timingSafeEqual(hashBufferA, hashBufferB)) {
        res.status(401).json({
          success: false,
          error: { code: 'INVALID_API_SECRET', message: 'Invalid API secret provided for this key' },
          meta: { timestamp: new Date().toISOString() }
        });
        return;
      }

      // Verify merchant status
      const merchant = (await findMerchantByIdDefensive(keyDoc.merchantId)) as any;
      if (!merchant) {
        res.status(404).json({
          success: false,
          error: { code: 'MERCHANT_NOT_FOUND', message: 'Merchant account not found' },
          meta: { timestamp: new Date().toISOString() }
        });
        return;
      }
      if (merchant.status === 'SUSPENDED') {
        res.status(403).json({
          success: false,
          error: { code: 'MERCHANT_SUSPENDED', message: 'Merchant account is suspended from payment processing' },
          meta: { timestamp: new Date().toISOString() }
        });
        return;
      }

      // Update lastUsedAt asynchronously
      keyDoc.lastUsedAt = new Date();
      keyDoc.save().catch(() => {});

      // Set authenticated context
      req.merchantId = keyDoc.merchantId.toString();
      req.authType = 'API_KEY';
      req.apiKey = keyDoc;
      req.user = {
        userId: 'api_key',
        merchantId: keyDoc.merchantId.toString(),
        email: merchant.email || '',
        role: 'MERCHANT_API'
      };

      next();
      return;
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'AUTH_PROCESSING_ERROR', message: err.message },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }
  }

  // 4. Authenticate via standard JWT Bearer token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token missing or invalid format. Provide Bearer JWT or X-API-Key/X-API-Secret.'
      },
      meta: { timestamp: new Date().toISOString() }
    });
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const payload = security.verifyAccessToken(token);

    // Verify user still exists and is ACTIVE
    const user = (await findUserByIdDefensive(payload.userId)) as any;
    if (!user || user.status !== 'ACTIVE') {
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_INACTIVE_OR_DELETED',
          message: 'User account is suspended or no longer exists'
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    // Verify associated merchant exists and is ACTIVE (only for merchant users)
    if (user.role !== 'SYSTEM_ADMIN') {
      const merchant = payload.merchantId ? ((await findMerchantByIdDefensive(payload.merchantId)) as any) : null;
      if (!merchant) {
        res.status(404).json({
          success: false,
          error: {
            code: 'MERCHANT_NOT_FOUND',
            message: 'Merchant account not found'
          },
          meta: { timestamp: new Date().toISOString() }
        });
        return;
      }
      if (merchant.status === 'SUSPENDED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'MERCHANT_SUSPENDED',
            message: 'Merchant account is suspended from payment processing'
          },
          meta: { timestamp: new Date().toISOString() }
        });
        return;
      }
    }

    // Bind authenticated context
    req.authType = 'JWT';
    req.user = {
      ...payload,
      role: user.role
    };
    req.merchantId = payload.merchantId;
    next();
  } catch (err: any) {
    const isExpired = err.name === 'TokenExpiredError';
    res.status(401).json({
      success: false,
      error: {
        code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        message: isExpired ? 'Access token has expired. Please refresh.' : 'Invalid access token'
      },
      meta: { timestamp: new Date().toISOString() }
    });
  }
}

/**
 * Middleware to enforce required API key scope
 */
export function requireScope(requiredScope: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // JWT Dashboard users possess all merchant permissions
    if (req.authType === 'JWT') {
      next();
      return;
    }

    if (req.authType === 'API_KEY') {
      const scopes: string[] = req.apiKey?.scopes || [];
      if (scopes.includes('*') || scopes.includes(requiredScope)) {
        next();
        return;
      }

      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: `API Key lacks required scope "${requiredScope}". Current scopes: [${scopes.join(', ')}]`
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      meta: { timestamp: new Date().toISOString() }
    });
  };
}

/**
 * Phase 3C: Dedicated System Administrator Authorization Middleware
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== 'SYSTEM_ADMIN') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_ADMIN_ONLY',
        message: 'Platform administrator credentials required. Access denied.'
      },
      meta: { timestamp: new Date().toISOString() }
    });
    return;
  }
  next();
}
