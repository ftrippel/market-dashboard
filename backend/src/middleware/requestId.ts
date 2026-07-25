import { createMiddleware } from 'hono/factory';
import type { BackendEnv } from '../env';

export const requestId = createMiddleware<BackendEnv>(async (c, next) => {
  const incoming = c.req.header('X-Request-Id')?.trim();
  const id = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
});
