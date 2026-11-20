import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/index.js';
import { requestLogger } from './middleware/request-logger.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { errorHandler } from './middleware/error-handler.js';

// Module Routers
import { healthRouter } from './modules/health/health.router.js';
import { authRouter } from './modules/auth/index.js';
import { merchantsRouter } from './modules/merchants/index.js';
import { paymentsRouter } from './modules/payments/index.js';
import { paymentLinksRouter } from './modules/payments/payment-links.router.js';
import { upiRouter } from './modules/upi/index.js';
import { checkoutRouter } from './modules/checkout/index.js';
import { integrationsRouter } from './modules/integrations/index.js';
import { evidenceRouter } from './modules/evidence/index.js';
import { emailEvidenceRouter } from './modules/email-evidence/index.js';
import { androidEvidenceRouter, devicesRouter } from './modules/android-evidence/index.js';
import { templatesRouter } from './modules/templates/index.js';
import { evidenceMatchingRouter } from './modules/evidence-matching/index.js';
import { reconciliationRouter } from './modules/reconciliation/index.js';
import { webhooksRouter } from './modules/webhooks/index.js';
import { developerRouter } from './modules/developer/index.js';
import { adminRouter } from './modules/admin/index.js';
import { auditRouter } from './modules/audit/index.js';
import { backgroundJobsRouter } from './modules/background-jobs/index.js';
import { contactRouter } from './modules/contact/index.js';
import { openApiSpec } from './docs/openapi.js';

export function createApp() {
  const app = express();

  // Security Headers
  app.use(helmet());

  // CORS configuration
  const allowedOrigins = config.ALLOWED_CORS_ORIGINS.split(',').map((o: string) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error('Blocked by CORS policy'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    })
  );

  // Body Parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request Logging & Rate Limiting
  app.use(requestLogger);
  app.use(rateLimiter);

  // System & Health Endpoints
  app.use(healthRouter);
  app.get('/openapi.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(openApiSpec);
  });

  // V1 API Module Routes
  const apiV1 = express.Router();
  apiV1.use(healthRouter);
  apiV1.get('/openapi.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(openApiSpec);
  });
  apiV1.use('/auth', authRouter);
  apiV1.use('/merchant', merchantsRouter);
  apiV1.use('/merchants', merchantsRouter);
  apiV1.use('/payments', paymentsRouter);
  apiV1.use('/payment-links', paymentLinksRouter);
  apiV1.use('/upi', upiRouter);
  apiV1.use('/checkout', checkoutRouter);
  apiV1.use('/integrations', integrationsRouter);
  apiV1.use('/evidence', evidenceRouter);
  apiV1.use('/email-evidence', emailEvidenceRouter);
  apiV1.use('/android-evidence', androidEvidenceRouter);
  apiV1.use('/devices', devicesRouter);
  apiV1.use('/templates', templatesRouter);
  apiV1.use('/evidence-matching', evidenceMatchingRouter);
  apiV1.use('/reconciliation', reconciliationRouter);
  apiV1.use('/webhooks', webhooksRouter);
  apiV1.use('/developer', developerRouter);
  apiV1.use('/admin', adminRouter);
  apiV1.use('/audit', auditRouter);
  apiV1.use('/background-jobs', backgroundJobsRouter);
  apiV1.use('/contact', contactRouter);

  app.use('/api/v1', apiV1);
  app.use('/v1', apiV1);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
