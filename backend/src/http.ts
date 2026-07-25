import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError, ApiSuccess } from '../../shared/api/contracts';
import type { BackendEnv } from './env';

export function success<T>(
  c: Context<BackendEnv>,
  data: T,
  status: ContentfulStatusCode = 200,
): Response {
  const body: ApiSuccess<T> = {
    data,
    meta: { requestId: c.get('requestId') },
  };
  return c.json(body, status);
}

export function failure(
  c: Context<BackendEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ApiError = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    meta: { requestId: c.get('requestId') },
  };
  return c.json(body, status);
}
