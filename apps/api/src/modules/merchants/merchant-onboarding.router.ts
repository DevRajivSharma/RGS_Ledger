import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import { UpdateOnboardingStepSchema } from '@rgs-ledger/validation';
import { merchantOnboardingService } from './merchant-onboarding.service.js';

export const merchantOnboardingRouter = Router();

// All onboarding endpoints require authenticated merchant session
merchantOnboardingRouter.use(requireAuth);

/**
 * GET /status - Fetch real-time onboarding checklist and readiness
 */
merchantOnboardingRouter.get(
  '/status',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const merchantId = req.merchantId!;
      const status = await merchantOnboardingService.getOnboardingStatus(merchantId);

      res.json({
        success: true,
        data: status,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /step - Update current onboarding step and mark steps completed
 */
merchantOnboardingRouter.post(
  '/step',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const merchantId = req.merchantId!;
      const validation = UpdateOnboardingStepSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ONBOARDING_INPUT',
            message: 'Invalid onboarding step parameters',
            details: validation.error.flatten()
          }
        });
        return;
      }

      const { currentStep, markStepCompleted } = validation.data;
      const updated = await merchantOnboardingService.updateOnboardingStep(
        merchantId,
        currentStep,
        markStepCompleted
      );

      res.json({
        success: true,
        data: updated,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /dismiss - Dismiss the onboarding checklist banner
 */
merchantOnboardingRouter.post(
  '/dismiss',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const merchantId = req.merchantId!;
      const result = await merchantOnboardingService.dismissOnboarding(merchantId);

      res.json({
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (err) {
      next(err);
    }
  }
);
