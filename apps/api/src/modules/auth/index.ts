import { Router, Request, Response } from 'express';
import {
  RegisterInputSchema,
  LoginInputSchema,
  RefreshTokenSchema
} from '@rgs-ledger/validation';
import { UserModel, MerchantModel, findMerchantByIdDefensive, findUserByIdDefensive } from '../../database/models.js';
import { security } from '../../utils/security.js';
import { ApiResponse, AuthResponse } from '@rgs-ledger/api-contracts';
import { authRateLimiter } from '../../middleware/rate-limiter.js';
import { config } from '../../config/index.js';

function extractCookie(req: Request, cookieName: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : undefined;
}

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<any>;
  findUserById(userId: string): Promise<any>;
  findUserByRefreshTokenHash(hash: string): Promise<any>;
  createMerchant(data: any): Promise<any>;
  createUser(data: any): Promise<any>;
  updateUserRefreshToken(userId: string, tokenHash: string | null): Promise<void>;
  findMerchantById(merchantId: string): Promise<any>;
}

export class MongoAuthRepository implements IAuthRepository {
  async findUserByEmail(email: string) {
    return UserModel.findOne({ email: email.toLowerCase().trim() }).lean();
  }

  async findUserById(userId: string) {
    return findUserByIdDefensive(userId);
  }

  async findUserByRefreshTokenHash(hash: string) {
    return UserModel.findOne({ refreshTokenHash: hash }).lean();
  }

  async createMerchant(data: any) {
    return MerchantModel.create(data);
  }

  async createUser(data: any) {
    return UserModel.create(data);
  }

  async updateUserRefreshToken(userId: string, tokenHash: string | null) {
    try {
      await UserModel.findByIdAndUpdate(userId, { refreshTokenHash: tokenHash });
    } catch {}
    await UserModel.updateOne({ _id: userId as any }, { refreshTokenHash: tokenHash });
  }

  async findMerchantById(merchantId: string) {
    return findMerchantByIdDefensive(merchantId);
  }
}

export class AuthService {
  constructor(private repo: IAuthRepository) {}

  async register(input: any): Promise<AuthResponse> {
    const validated = RegisterInputSchema.parse(input);
    const email = validated.email.toLowerCase().trim();

    // Prevent duplicate user or merchant registration
    const existingUser = await this.repo.findUserByEmail(email);
    if (existingUser) {
      const err: any = new Error('An account with this email address already exists');
      err.code = 'EMAIL_ALREADY_EXISTS';
      err.statusCode = 409;
      throw err;
    }

    // Create Merchant
    const merchant = await this.repo.createMerchant({
      name: validated.merchantName.trim(),
      email,
      upiConfig: {
        vpa: validated.upiVpa.trim(),
        businessName: validated.merchantName.trim(),
        isAcceptingPayments: true
      },
      status: 'ACTIVE'
    });

    // Hash password asynchronously & create User
    const passwordHash = await security.hashPassword(validated.password);
    const user = await this.repo.createUser({
      email,
      passwordHash,
      merchantId: merchant._id,
      role: 'MERCHANT_ADMIN',
      status: 'ACTIVE'
    });

    // Generate tokens
    const accessToken = security.generateAccessToken({
      userId: user._id.toString(),
      merchantId: merchant._id.toString(),
      role: user.role
    });

    const { token: refreshToken, hash: refreshHash } = security.generateRefreshToken();
    await this.repo.updateUserRefreshToken(user._id.toString(), refreshHash);

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        merchantId: merchant._id.toString(),
        role: user.role
      },
      merchant: {
        id: merchant._id.toString(),
        name: merchant.name,
        email: merchant.email,
        upiConfig: {
          vpa: merchant.upiConfig.vpa,
          businessName: merchant.upiConfig.businessName,
          mcc: merchant.upiConfig.mcc,
          isAcceptingPayments: merchant.upiConfig.isAcceptingPayments ?? true
        }
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900 // 15 mins
      }
    };
  }

  async login(input: any): Promise<AuthResponse> {
    const validated = LoginInputSchema.parse(input);
    const email = validated.email.toLowerCase().trim();

    const user = await this.repo.findUserByEmail(email);
    if (!user) {
      const err: any = new Error('Invalid email or password');
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    const isValidPassword = await security.verifyPassword(validated.password, user.passwordHash);
    if (!isValidPassword) {
      const err: any = new Error('Invalid email or password');
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    if (user.status !== 'ACTIVE') {
      const err: any = new Error('Account is suspended or inactive');
      err.code = 'ACCOUNT_INACTIVE';
      err.statusCode = 403;
      throw err;
    }

    const merchant = await this.repo.findMerchantById(user.merchantId.toString());
    if (!merchant) {
      const err: any = new Error('Merchant profile not found');
      err.code = 'MERCHANT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (merchant.status === 'SUSPENDED') {
      const err: any = new Error('Merchant profile is suspended');
      err.code = 'MERCHANT_SUSPENDED';
      err.statusCode = 403;
      throw err;
    }

    const accessToken = security.generateAccessToken({
      userId: user._id.toString(),
      merchantId: merchant._id.toString(),
      role: user.role
    });

    const { token: refreshToken, hash: refreshHash } = security.generateRefreshToken();
    await this.repo.updateUserRefreshToken(user._id.toString(), refreshHash);

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        merchantId: merchant._id.toString(),
        role: user.role
      },
      merchant: {
        id: merchant._id.toString(),
        name: merchant.name,
        email: merchant.email,
        upiConfig: {
          vpa: merchant.upiConfig.vpa,
          businessName: merchant.upiConfig.businessName,
          mcc: merchant.upiConfig.mcc,
          isAcceptingPayments: merchant.upiConfig.isAcceptingPayments ?? true
        }
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900
      }
    };
  }

  async refreshTokens(refreshToken: string) {
    const hash = security.hashRefreshToken(refreshToken);
    const user = await this.repo.findUserByRefreshTokenHash(hash);
    if (!user || user.status !== 'ACTIVE') {
      const err: any = new Error('Invalid or revoked refresh token');
      err.code = 'INVALID_REFRESH_TOKEN';
      err.statusCode = 401;
      throw err;
    }

    const merchant = await this.repo.findMerchantById(user.merchantId.toString());
    if (!merchant) {
      const err: any = new Error('Merchant profile not found');
      err.code = 'MERCHANT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (merchant.status === 'SUSPENDED') {
      const err: any = new Error('Merchant profile is suspended');
      err.code = 'MERCHANT_SUSPENDED';
      err.statusCode = 403;
      throw err;
    }

    const newAccessToken = security.generateAccessToken({
      userId: user._id.toString(),
      merchantId: merchant._id.toString(),
      role: user.role
    });

    // Token rotation
    const { token: newRefreshToken, hash: newRefreshHash } = security.generateRefreshToken();
    await this.repo.updateUserRefreshToken(user._id.toString(), newRefreshHash);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900
    };
  }

  async logout(userId: string) {
    await this.repo.updateUserRefreshToken(userId, null);
  }
}

const authRepo = new MongoAuthRepository();
export const authService = new AuthService(authRepo);

const router = Router();

const REFRESH_COOKIE_NAME = 'rgs_refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 7 days

router.post('/register', authRateLimiter, async (req: Request, res: Response, next) => {
  try {
    const result = await authService.register(req.body);

    // Set secure httpOnly cookie for web clients
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS
    });

    const response: ApiResponse<AuthResponse> = {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

router.post('/login', authRateLimiter, async (req: Request, res: Response, next) => {
  try {
    const result = await authService.login(req.body);

    // Set secure httpOnly cookie for web clients
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS
    });

    const response: ApiResponse<AuthResponse> = {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

const handleTokenRefresh = async (req: Request, res: Response, next: any) => {
  try {
    // Read from body (validated via RefreshTokenSchema) or secure httpOnly cookie
    let token = extractCookie(req, REFRESH_COOKIE_NAME);
    if (req.body && typeof req.body === 'object' && req.body.refreshToken) {
      const parsed = RefreshTokenSchema.safeParse(req.body);
      if (parsed.success) {
        token = parsed.data.refreshToken;
      }
    }

    if (!token || typeof token !== 'string') {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'No active session or refresh token provided' },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    try {
      const result = await authService.refreshTokens(token);

      // Rotate the cookie
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: REFRESH_COOKIE_MAX_AGE_MS
      });

      const response: ApiResponse = {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() }
      };
      res.json(response);
    } catch (authErr: any) {
      // Clear invalid/expired cookie so browser doesn't keep sending bad tokens
      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
      });
      res.status(authErr.statusCode || 401).json({
        success: false,
        error: {
          code: authErr.code || 'INVALID_REFRESH_TOKEN',
          message: authErr.message || 'Session expired or invalid. Please sign in again.'
        },
        meta: { timestamp: new Date().toISOString() }
      });
    }
  } catch (err) {
    next(err);
  }
};

router.post('/refresh', handleTokenRefresh);
router.get('/refresh', handleTokenRefresh);

router.post('/logout', async (req: Request, res: Response, next) => {
  try {
    let userId: string | undefined;

    // 1. Try Bearer token if provided
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const payload = security.verifyAccessToken(authHeader.substring(7).trim());
        userId = payload.userId;
      } catch {
        // Expired or invalid access token - continue to cookie/body revocation
      }
    }

    // 2. Try refresh token from cookie or body if userId not yet found
    if (!userId) {
      let refreshToken = extractCookie(req, REFRESH_COOKIE_NAME);
      if (!refreshToken && req.body && typeof req.body.refreshToken === 'string') {
        refreshToken = req.body.refreshToken;
      }
      if (refreshToken) {
        const hash = security.hashRefreshToken(refreshToken);
        const user = await authRepo.findUserByRefreshTokenHash(hash);
        if (user) {
          userId = (user as any)._id?.toString() || (user as any).id;
        }
      }
    }

    // 3. Revoke active refresh token in database if user resolved
    if (userId) {
      await authService.logout(userId);
    }

    // 4. Always clear secure httpOnly cookie
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    const response: ApiResponse = {
      success: true,
      data: { message: 'Logged out successfully' },
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

export const authRouter = router;
