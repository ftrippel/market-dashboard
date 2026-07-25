import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import type { BackendEnv } from '../env';
import { failure } from '../http';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://ftrippel.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function allowedOrigins(value?: string): string[] {
  const configured = value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

export const apiCors = createMiddleware<BackendEnv>(async (c, next) => {
  const origin = c.req.header('Origin');
  const origins = allowedOrigins(c.env.ALLOWED_ORIGINS);

  if (origin && !origins.includes(origin)) {
    return failure(c, 403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed to use the API.');
  }

  const middleware = cors({
    origin: origin ?? origins[0],
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id', 'X-Cache'],
    maxAge: 86400,
  });
  return middleware(c, next);
});
