import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { platformConfigService } from '../modules/admin/platform-config.service.js';

interface ClientHitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, ClientHitRecord>();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = config.RATE_LIMIT_WINDOW_MS;
  const maxRequests = platformConfigService.getRateLimitPerMinute() || config.RATE_LIMIT_MAX_REQUESTS;

  let record = memoryStore.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + windowMs };
    memoryStore.set(ip, record);
    return next();
  }

  record.count += 1;
  if (record.count > maxRequests) {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded. Please try again later.'
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
    return;
  }

  next();
}

const authMemoryStore = new Map<string, ClientHitRecord>();

/**
 * Dedicated stricter rate limiter for authentication routes (/login, /register)
 * Limits to 10 requests per minute per IP to prevent brute force attacks.
 */
export function authRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60000;
  const maxAttempts = 10;

  let record = authMemoryStore.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + windowMs };
    authMemoryStore.set(ip, record);
    return next();
  }

  record.count += 1;
  if (record.count > maxAttempts) {
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again after 1 minute.'
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
    return;
  }

  next();
}

const contactMemoryStore = new Map<string, ClientHitRecord>();

/**
 * Dedicated rate limiter for public contact submissions to prevent spam.
 * Limits to 5 requests per 10 minutes per IP.
 */
export function contactRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes
  const maxRequests = 5;

  let record = contactMemoryStore.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + windowMs };
    contactMemoryStore.set(ip, record);
    return next();
  }

  record.count += 1;
  if (record.count > maxRequests) {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many contact requests submitted. Please wait before trying again.'
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
    return;
  }

  next();
}
