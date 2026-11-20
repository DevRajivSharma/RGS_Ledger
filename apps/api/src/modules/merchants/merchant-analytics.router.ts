import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import {
  MerchantAnalyticsFilterSchema,
  MerchantReportExportSchema
} from '@rgs-ledger/validation';
import { merchantAnalyticsService } from './merchant-analytics.service.js';

export const merchantAnalyticsRouter = Router();

// Ensure all analytics routes require authentication
merchantAnalyticsRouter.use(requireAuth);

/**
 * GET /summary - Compute merchant KPI summary metrics
 */
merchantAnalyticsRouter.get(
  '/summary',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const merchantId = req.merchantId!;
      const validation = MerchantAnalyticsFilterSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ANALYTICS_FILTER',
            message: 'Invalid analytics query parameters',
            details: validation.error.flatten()
          }
        });
        return;
      }

      const summary = await merchantAnalyticsService.getAnalyticsSummary(
        merchantId,
        validation.data
      );

      res.json({
        success: true,
        data: summary,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /timeseries - Daily analytics timeseries covering payments, evidence, and reconciliation
 */
merchantAnalyticsRouter.get(
  '/timeseries',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const merchantId = req.merchantId!;
      const validation = MerchantAnalyticsFilterSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ANALYTICS_FILTER',
            message: 'Invalid analytics query parameters',
            details: validation.error.flatten()
          }
        });
        return;
      }

      const timeseries = await merchantAnalyticsService.getTimeseries(
        merchantId,
        validation.data
      );

      res.json({
        success: true,
        data: timeseries,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /reports/export - Export downloadable CSV report with formula-injection neutralization
 */
merchantAnalyticsRouter.get(
  '/reports/export',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const merchantId = req.merchantId!;
      const validation = MerchantReportExportSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EXPORT_PARAMETERS',
            message: 'Invalid report export parameters',
            details: validation.error.flatten()
          }
        });
        return;
      }

      const { filename, csv } = await merchantAnalyticsService.generateCsvReport(
        merchantId,
        validation.data
      );

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }
);
