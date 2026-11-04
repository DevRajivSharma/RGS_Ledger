import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected internal error occurred';

  // Redact internal error traces in production
  const response: any = {
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    }
  };

  if (status >= 500) {
    console.error(`[API Error] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(status).json(response);
}
