import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { User, Merchant } from '../database/models';

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.register(req.body);

      // Set HttpOnly refresh token cookie
      res.cookie('rgs_refresh_token', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.cookie('rgs_access_token', result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000 // 15 mins
      });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: result.user._id,
            email: result.user.email,
            fullName: result.user.fullName,
            role: result.user.role,
            merchantId: result.user.merchantId
          },
          merchant: result.merchant,
          token: result.tokens.accessToken,
          apiKeySecret: result.apiKeySecret
        }
      });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);

      res.cookie('rgs_refresh_token', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.cookie('rgs_access_token', result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000
      });

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: result.user._id,
            email: result.user.email,
            fullName: result.user.fullName,
            role: result.user.role,
            merchantId: result.user.merchantId
          },
          merchant: result.merchant,
          token: result.tokens.accessToken
        }
      });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    res.clearCookie('rgs_access_token');
    res.clearCookie('rgs_refresh_token');
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  }

  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.rgs_refresh_token || req.body?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No refresh token' } });
        return;
      }

      const tokens = await AuthService.refresh(refreshToken);
      res.cookie('rgs_access_token', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000
      });

      res.status(200).json({ success: true, data: { token: tokens.accessToken } });
    } catch (err) {
      next(err);
    }
  }

  static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not logged in' } });
        return;
      }

      const user = await User.findById(req.user.id).select('-passwordHash').exec();
      let merchant = null;
      if (req.user.merchantId) {
        merchant = await Merchant.findById(req.user.merchantId).exec();
      }

      res.status(200).json({
        success: true,
        data: {
          user,
          merchant
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
