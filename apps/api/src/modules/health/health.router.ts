import { Router, Request, Response } from 'express';
import { getDatabaseState } from '../../database/connection.js';
import { HealthResponse } from '@rgs-ledger/api-contracts';
import { workerHeartbeat } from '../background-jobs/index.js';

const router = Router();
const startTime = Date.now();

router.get('/health', (_req: Request, res: Response) => {
  const dbState = getDatabaseState();
  const isHealthy = dbState === 'connected';

  const health: HealthResponse & { worker?: any } = {
    status: isHealthy ? 'healthy' : 'degraded',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    services: {
      database: dbState,
      scheduler: workerHeartbeat.isActive ? 'active' : 'inactive'
    },
    worker: {
      isActive: workerHeartbeat.isActive,
      lastRunAt: workerHeartbeat.lastRunAt,
      lastRunStats: workerHeartbeat.lastRunStats
    }
  };

  // Status 200 signals the service process is up and responsive to orchestrators
  res.status(200).json(health);
});

router.get('/health/ready', (_req: Request, res: Response) => {
  const dbState = getDatabaseState();
  const isReady = dbState === 'connected';

  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    database: dbState,
    timestamp: new Date().toISOString()
  });
});

router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({
    live: true,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString()
  });
});

export const healthRouter = router;
