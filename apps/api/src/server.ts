import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './database/connection.js';
import { startBackgroundWorker, stopBackgroundWorker } from './modules/background-jobs/index.js';
import { platformConfigService } from './modules/admin/platform-config.service.js';

async function bootstrap() {
  const app = createApp();

  // Attempt database connection
  try {
    await connectDatabase();
    // Synchronize platform configuration settings from MongoDB into active memory
    await platformConfigService.loadSettings();
    // Start background webhook retry worker and scheduled sweeps once database is connected
    startBackgroundWorker(60000);
  } catch (error: any) {
    logger.warn('Initial MongoDB connection failed; server will continue running and retry on demand.', {
      error: error.message
    });
  }

  const server = app.listen(config.PORT, '0.0.0.0', () => {
    logger.info(`RGS Ledger API listening on 0.0.0.0:${config.PORT}`, {
      environment: config.NODE_ENV,
      port: config.PORT
    });
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);
    stopBackgroundWorker();

    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await disconnectDatabase();
        logger.info('Database connections closed cleanly.');
        process.exit(0);
      } catch (err: any) {
        logger.error('Error during database disconnect', { error: err.message });
        process.exit(1);
      }
    });

    // Force shutdown after 10s timeout
    setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded. Forcing exit.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logger.error('Failed to start RGS Ledger API server', { error: error.message });
  process.exit(1);
});
