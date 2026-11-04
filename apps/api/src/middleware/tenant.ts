import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@rgs-ledger/shared';

/**
 * Enforces strict tenant data isolation.
 * Non-admin users are restricted solely to their assigned merchantId.
 */
export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
    });
    return;
  }

  // Super Admins and Admins can query with explicit merchantId filter or view all
  if (req.user.role === UserRole.SUPER_ADMIN || req.user.role === UserRole.ADMIN) {
    if (req.query.merchantId && typeof req.query.merchantId === 'string') {
      req.merchantId = req.query.merchantId;
    }
    return next();
  }

  // Merchants MUST have an assigned merchantId
  if (!req.user.merchantId) {
    res.status(403).json({
      success: false,
      error: { code: 'NO_MERCHANT_ASSIGNED', message: 'No merchant account is associated with this identity.' }
    });
    return;
  }

  // Override whatever merchantId parameter might have been passed in query/body to prevent spoofing
  req.merchantId = req.user.merchantId;
  next();
}
