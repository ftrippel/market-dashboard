import type { ApiError, ApiSuccess } from '../../shared/api/contracts';
import { config } from '../config';

const DEFAULT_TIMEOUT_MS = 10_000;

export class BackendApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, code: string, status: number, requestId?: string) {
    super(message);
    this.name = 'BackendApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export function isBackendApiConfigured(): boolean {
  return Boolean(config.backend.apiUrl);
}

export function buildBackendApiUrl(
  path: string,
  query?: Record<string, string>,
): string {
  if (!config.backend.apiUrl) {
    throw new BackendApiError(
      'The backend API URL is not configured.',
      'BACKEND_NOT_CONFIGURED',
      0,
    );
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${config.backend.apiUrl}/api/v1${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function fetchBackendData<T>(
  path: string,
  options: {
    query?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', relayAbort, { once: true });
  const timeoutId = window.setTimeout(
    () => controller.abort(new DOMException('Backend request timed out.', 'TimeoutError')),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(buildBackendApiUrl(path, options.query), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = (await response.json()) as ApiSuccess<T> | ApiError;

    if (!response.ok || 'error' in body) {
      const error = 'error' in body ? body.error : null;
      throw new BackendApiError(
        error?.message ?? `Backend request failed with HTTP ${response.status}.`,
        error?.code ?? 'BACKEND_REQUEST_FAILED',
        response.status,
        body.meta?.requestId,
      );
    }

    return body.data;
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', relayAbort);
  }
}
