import { Router, Request, Response, NextFunction } from 'express';
import { ContactSubmissionSchema } from '@rgs-ledger/validation';
import { ContactSubmissionModel } from '../../database/models.js';
import { contactRateLimiter } from '../../middleware/rate-limiter.js';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';

export const contactRouter = Router();

/**
 * Strip potential HTML tags and malicious scripts from text inputs
 */
function sanitizeText(str: string): string {
  return str.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * POST /api/v1/contact - Public contact submission with rate limiting and sanitization
 */
contactRouter.post(
  '/',
  contactRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validation = ContactSubmissionSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CONTACT_INPUT',
            message: 'Validation failed for contact submission',
            details: validation.error.flatten()
          }
        });
        return;
      }

      const { name, email, subject, message } = validation.data;
      const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();

      await ContactSubmissionModel.create({
        name: sanitizeText(name),
        email: email.toLowerCase().trim(),
        subject: sanitizeText(subject),
        message: sanitizeText(message),
        status: 'NEW',
        ipAddress: ip
      });

      res.status(201).json({
        success: true,
        message: 'Thank you for reaching out to RGS Ledger. Your inquiry has been received.',
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/contact - List contact submissions (authenticated administrators/support)
 */
contactRouter.get(
  '/',
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const submissions = await ContactSubmissionModel.find()
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
        .exec();

      res.json({
        success: true,
        data: { submissions },
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (err) {
      next(err);
    }
  }
);
