import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UserRole, hashSecret } from '@rgs-ledger/shared';
import { ApiKey, User } from '../database/models';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  merchantId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      merchantId?: string;
      apiKeyEnvironment?: 'SANDBOX' | 'LIVE';
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // 1. Check Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.rgs_access_token) {
    token = req.cookies.rgs_access_token;
  }

  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required. No token provided.' }
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as any;
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      merchantId: decoded.merchantId
    };
    if (decoded.merchantId) {
      req.merchantId = decoded.merchantId;
    }
    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token is invalid or expired.' }
    });
  }
}

/**
 * Authenticates merchant API calls using secret key (rl_test_sk_... or rl_live_sk_...)
 */
export async function authenticateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKeySecret = req.headers['x-api-key'] as string || 
    (req.headers.authorization?.startsWith('Bearer rl_') ? req.headers.authorization.substring(7) : undefined);

  if (!apiKeySecret) {
    // If not API key, fall back to JWT authenticate
    return authenticate(req, res, next);
  }

  try {
    const hashed = hashSecret(apiKeySecret.trim());
    const apiKeyDoc = await ApiKey.findOne({ hashedSecret: hashed, isActive: true }).exec();

    if (!apiKeyDoc) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_API_KEY', message: 'The provided API key is invalid or revoked.' }
      });
      return;
    }

    // Update last used timestamp asynchronously
    ApiKey.updateOne({ _id: apiKeyDoc._id }, { $set: { lastUsedAt: new Date() } }).exec().catch(() => {});

    req.merchantId = apiKeyDoc.merchantId;
    req.apiKeyEnvironment = apiKeyDoc.environment as 'SANDBOX' | 'LIVE';
    req.user = {
      id: `api_key_${apiKeyDoc.keyId}`,
      email: `merchant_${apiKeyDoc.merchantId}@api.internal`,
      role: UserRole.DEVELOPER,
      merchantId: apiKeyDoc.merchantId
    };

    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Internal authentication error.' }
    });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
      });
      return;
    }

    if (req.user.role === UserRole.SUPER_ADMIN) {
      return next(); // Super admin has global bypass
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient role permissions for this resource.' }
      });
      return;
    }

    next();
  };
}
