import { Router, Response } from 'express';
import { AuditLogModel } from '../../database/models.js';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../../middleware/auth.js';
import { ApiResponse } from '@rgs-ledger/api-contracts';

export function sanitizeAuditDetails(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeAuditDetails);

  const SENSITIVE_KEYWORDS = [
    'password',
    'passwordhash',
    'secret',
    'rawsecret',
    'secrethash',
    'bootstrapsecret',
    'token',
    'accesstoken',
    'refreshtoken',
    'devicetoken',
    'devicetokenhash',
    'authorization',
    'cookie',
    'credentials',
    'key',
    'apikey'
  ];

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYWORDS.some((kw) => cleanKey.includes(kw))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeAuditDetails(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export class AuditService {
  async recordLog(data: {
    merchantId?: string;
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }) {
    const sanitizedDetails = data.details ? sanitizeAuditDetails(data.details) : undefined;
    return AuditLogModel.create({
      ...data,
      details: sanitizedDetails,
      createdAt: new Date()
    });
  }

  async listLogs(filters: {
    action?: string;
    merchantId?: string;
    userId?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    limit?: number;
    page?: number;
  }) {
    const query: any = {};
    if (filters.action) {
      query.action = filters.action;
    }
    if (filters.merchantId) {
      query.merchantId = filters.merchantId;
    }
    if (filters.userId) {
      query.userId = filters.userId;
    }
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const page = Math.max(Number(filters.page) || 1, 1);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLogModel.countDocuments(query)
    ]);

    return {
      items: logs.map((log: any) => ({
        id: log._id.toString(),
        merchantId: log.merchantId ? log.merchantId.toString() : undefined,
        userId: log.userId ? log.userId.toString() : undefined,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        details: log.details,
        createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : new Date().toISOString()
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}

export const auditService = new AuditService();

const router = Router();
router.get('/logs', requireAuth as any, requireAdmin as any, async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { action, merchantId, userId, startDate, endDate, limit, page } = req.query as any;
    const result = await auditService.listLogs({ action, merchantId, userId, startDate, endDate, limit, page });
    const response: ApiResponse = {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

export const auditRouter = router;
