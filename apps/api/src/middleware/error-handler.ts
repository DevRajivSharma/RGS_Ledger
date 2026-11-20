import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { ApiResponse } from '@rgs-ledger/api-contracts';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected internal error occurred';

  logger.error(`[${req.method}] ${req.url} failed: ${message}`, {
    errorCode,
    statusCode,
    url: req.url,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  const response: ApiResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
      details: err.details
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };

  res.status(statusCode).json(response);
}
