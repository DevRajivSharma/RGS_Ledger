import { Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service';

export class ReportController {
  static async getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const merchantId = req.merchantId || req.user?.merchantId;
      if (!merchantId) {
        res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No merchant ID' } });
        return;
      }

      const overview = await ReportService.getMerchantOverview(merchantId);
      res.status(200).json({ success: true, data: overview });
    } catch (err) {
      next(err);
    }
  }
}
