import { Request, Response, NextFunction } from 'express';
import { ApiKeyService } from '../services/api-key.service';

export class ApiKeyController {
  static async createKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      if (!merchantId) {
        res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No merchant ID' } });
        return;
      }

      const result = await ApiKeyService.createKey({
        merchantId,
        name: req.body.name,
        environment: req.body.environment
      });

      res.status(201).json({
        success: true,
        data: {
          apiKey: result.apiKey,
          secretKey: result.secretKey // Notice: returned ONCE
        }
      });
    } catch (err) {
      next(err);
    }
  }

  static async listKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const keys = await ApiKeyService.listKeys(merchantId!);
      res.status(200).json({ success: true, data: keys });
    } catch (err) {
      next(err);
    }
  }

  static async rotateKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const result = await ApiKeyService.rotateKey(req.params.id, merchantId!);
      res.status(200).json({
        success: true,
        data: {
          apiKey: result.newApiKey,
          secretKey: result.secretKey
        }
      });
    } catch (err) {
      next(err);
    }
  }

  static async revokeKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const success = await ApiKeyService.revokeKey(req.params.id, merchantId!);
      res.status(200).json({ success, message: 'API key revoked successfully' });
    } catch (err) {
      next(err);
    }
  }
}
