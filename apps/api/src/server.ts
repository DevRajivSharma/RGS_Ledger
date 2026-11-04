import { createApp } from './app';
import { config } from './config';
import { connectDatabase } from './database/connection';
import { initWebhookQueue } from './queues/webhook-queue';

async function bootstrap() {
  console.log(`[RGS Ledger] Initializing Payment Gateway API in ${config.paymentEnvironment} mode...`);

  await connectDatabase();
  initWebhookQueue();

  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`[RGS Ledger API] Server running on port ${config.port} (${config.apiUrl})`);
    console.log(`[RGS Ledger API] Health check: ${config.apiUrl}/health`);
    console.log(`[RGS Ledger API] REST Base URL: ${config.apiUrl}/api/v1`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`[RGS Ledger API] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('[RGS Ledger API] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    console.error('[RGS Ledger API] Bootstrap error:', err);
    process.exit(1);
  });
}
