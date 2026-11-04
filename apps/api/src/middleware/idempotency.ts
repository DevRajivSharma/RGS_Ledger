import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { IdempotencyRecord } from '../database/models';

/**
 * Ensures payment, order, and refund requests are completely idempotent.
 * If a request with the same Idempotency-Key and payload hash has already been processed,
 * returns the exact cached response without re-executing.
 */
export async function handleIdempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
  const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string;

  if (!idempotencyKey || req.method !== 'POST') {
    return next();
  }

  const merchantId = req.merchantId || req.user?.merchantId || 'anonymous';
  const requestPayload = JSON.stringify(req.body || {});
  const requestHash = crypto.createHash('sha256').update(requestPayload).digest('hex');

  try {
    const existing = await IdempotencyRecord.findOne({
      key: idempotencyKey,
      merchantId
    }).exec();

    if (existing) {
      if (existing.requestHash !== requestHash) {
        res.status(409).json({
          success: false,
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency-Key reuse with differing request parameters is rejected.'
          }
        });
        return;
      }

      // Return cached response
      res.setHeader('x-idempotent-replayed', 'true');
      res.status(existing.statusCode).json(existing.responseBody);
      return;
    }

    // Intercept response json method to cache response
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        IdempotencyRecord.create({
          key: idempotencyKey,
          merchantId,
          endpoint: req.originalUrl,
          requestHash,
          statusCode: res.statusCode,
          responseBody: body
        }).catch((err) => {
          console.warn('[Idempotency] Failed to store idempotency record:', err.message);
        });
      }
      return originalJson(body);
    };

    next();
  } catch (err: any) {
    next();
  }
}
