import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import apiRoutes from './routes';
import { errorHandler } from './middleware/error-handler';
import { config } from './config';

export function createApp(): express.Application {
  const app = express();

  // 1. Security Headers
  app.use(helmet({
    contentSecurityPolicy: false, // Allows flexible hosted checkout embeds
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  // 2. Request Correlation ID
  app.use((req: Request, res: Response, next) => {
    const correlationId = req.headers['x-correlation-id'] as string || `req_${crypto.randomBytes(8).toString('hex')}`;
    res.setHeader('x-correlation-id', correlationId);
    next();
  });

  // 3. CORS Configuration
  app.use(cors({
    origin: [
      config.dashboardUrl,
      config.checkoutUrl,
      config.developerPortalUrl,
      config.adminUrl,
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'idempotency-key', 'x-correlation-id']
  }));

  // 4. Rate Limiting (100 req/min for public/general, 500 for authenticated)
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' } }
  });
  app.use('/api/', limiter);

  // 5. Parsers (Preserve pristine rawBody buffer for PSP cryptographic webhook verification)
  app.use(express.json({
    limit: '5mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({
    extended: true,
    limit: '5mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(cookieParser(config.cookieSecret));

  // 6. Logging
  if (config.env !== 'test') {
    app.use(morgan('combined'));
  }

  // 7. Health Check
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'UP',
      service: 'rgs-ledger-api',
      timestamp: new Date().toISOString(),
      environment: config.paymentEnvironment,
      version: '1.0.0'
    });
  });

  // 8. REST API v1
  app.use('/api/v1', apiRoutes);

  // 9. Error Handler
  app.use(errorHandler);

  return app;
}
