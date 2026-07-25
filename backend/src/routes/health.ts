import type { Hono } from 'hono';
import type { HealthData } from '../../../shared/api/contracts';
import type { BackendEnv } from '../env';
import { success } from '../http';

export function registerHealthRoutes(app: Hono<BackendEnv>): void {
  app.get('/api/v1/health', (c) =>
    success<HealthData>(c, {
      status: 'ok',
      service: 'market-dashboard-api',
    }),
  );
}
