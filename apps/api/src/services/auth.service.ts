import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import {
  User,
  Merchant,
  ApiKey,
  LedgerAccount,
  IUser,
  IMerchant
} from '../database/models';
import {
  UserRole,
  KycStatus,
  BusinessType,
  EnvironmentMode,
  LedgerAccountType,
  generateApiKey,
  generateRandomId
} from '@rgs-ledger/shared';

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  businessName: string;
  businessType?: BusinessType;
  website?: string;
  country?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export class AuthService {
  static async register(input: RegisterInput): Promise<{ user: IUser; merchant: IMerchant; tokens: AuthTokens; apiKeySecret: string }> {
    const existing = await User.findOne({ email: input.email.toLowerCase() }).exec();
    if (existing) {
      const error: any = new Error('An account with this email already exists.');
      error.status = 409;
      error.code = 'EMAIL_ALREADY_EXISTS';
      throw error;
    }

    const merchantId = generateRandomId('mer');
    const passwordHash = await bcrypt.hash(input.password, 12);

    // 1. Create Merchant
    const merchant = await Merchant.create({
      _id: merchantId,
      businessName: input.businessName,
      businessType: input.businessType || BusinessType.PROPRIETORSHIP,
      country: input.country || 'IN',
      website: input.website || '',
      kycStatus: KycStatus.NOT_STARTED,
      environmentMode: EnvironmentMode.SANDBOX,
      isActive: true
    });

    // 2. Create Merchant Owner User
    const user = await User.create({
      email: input.email.toLowerCase(),
      passwordHash,
      fullName: input.fullName,
      phone: input.phone,
      role: UserRole.MERCHANT_OWNER,
      merchantId,
      isEmailVerified: true, // auto-verified in sandbox
      isActive: true
    });

    // 3. Create Default Sandbox API Key
    const generatedKey = generateApiKey('SANDBOX');
    await ApiKey.create({
      _id: generateRandomId('key'),
      merchantId,
      name: 'Default Test Key',
      keyId: generatedKey.keyId,
      hashedSecret: generatedKey.hashedSecret,
      prefix: generatedKey.prefix,
      environment: EnvironmentMode.SANDBOX,
      isActive: true
    });

    // 4. Initialize Merchant Double-Entry Ledger Payable Account
    await LedgerAccount.create({
      code: `MERCHANT_PAYABLE_${merchantId}`,
      merchantId,
      name: `Payable Account for ${input.businessName}`,
      type: LedgerAccountType.LIABILITY,
      currency: 'INR',
      balanceMinor: 0,
      isActive: true
    });

    const tokens = this.generateTokens(user);

    return {
      user,
      merchant,
      tokens,
      apiKeySecret: generatedKey.secretKey
    };
  }

  static async login(email: string, password: string): Promise<{ user: IUser; merchant?: IMerchant | null; tokens: AuthTokens }> {
    const user = await User.findOne({ email: email.toLowerCase() }).exec();
    if (!user || !user.isActive) {
      const error: any = new Error('Invalid email or password.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const error: any = new Error('Invalid email or password.');
      error.status = 401;
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    let merchant = null;
    if (user.merchantId) {
      merchant = await Merchant.findById(user.merchantId).exec();
    }

    const tokens = this.generateTokens(user);

    return { user, merchant, tokens };
  }

  static generateTokens(user: IUser): AuthTokens {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      merchantId: user.merchantId
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn as any
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn as any
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.accessExpiresIn
    };
  }

  static async refresh(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;
      const user = await User.findById(decoded.sub).exec();
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      return this.generateTokens(user);
    } catch {
      const error: any = new Error('Invalid or expired refresh token');
      error.status = 401;
      error.code = 'INVALID_REFRESH_TOKEN';
      throw error;
    }
  }
}
