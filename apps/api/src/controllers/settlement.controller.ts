import { Request, Response, NextFunction } from 'express';
import { SettlementService } from '../services/settlement.service';
import { LedgerService } from '../services/ledger.service';

export class SettlementController {
  static async createSettlement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const settlement = await SettlementService.createSettlement({
        merchantId: merchantId!,
        grossAmountMinor: req.body.amount
      });

      res.status(201).json({ success: true, data: settlement });
    } catch (err) {
      next(err);
    }
  }

  static async listSettlements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const result = await SettlementService.listSettlements({
        merchantId: merchantId!,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
      });

      res.status(200).json({
        success: true,
        data: result.settlements,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  static async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const balance = await LedgerService.getMerchantBalance(merchantId!);
      res.status(200).json({ success: true, data: balance });
    } catch (err) {
      next(err);
    }
  }

  static async getLedgerJournal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      const journal = await LedgerService.getMerchantJournal(merchantId!);
      res.status(200).json({ success: true, data: journal });
    } catch (err) {
      next(err);
    }
  }
}
