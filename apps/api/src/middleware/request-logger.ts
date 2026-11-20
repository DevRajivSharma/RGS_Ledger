import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Extract or generate unique correlation ID
  const incomingId = req.headers['x-request-id'] as string | undefined;
  const requestId = (incomingId && typeof incomingId === 'string' && incomingId.trim())
    ? incomingId.trim()
    : `req_${crypto.randomBytes(12).toString('hex')}`;

  (req as any).id = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.info(`HTTP ${req.method} ${req.originalUrl}`, {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip
    });
  });
  next();
}
