import type { Context, Hono } from 'hono';
import type { YahooQuotesData } from '../../../shared/api/contracts';
import type {
  BackendDependencies,
  BackendEnv,
  QuoteLookupResult,
} from '../env';
import { failure, success } from '../http';
import { lookupYahooQuotes } from '../services/yahooFinance';

const MAX_SYMBOLS_PER_REQUEST = 25;
const SYMBOL_PATTERN = /^[A-Z0-9^.=:_-]{1,32}$/;
const FRESH_CACHE_MS = 15 * 1000;
const STALE_CACHE_SECONDS = 15 * 60;

interface CachedQuotes {
  cachedAt: number;
  result: QuoteLookupResult;
}

function parseSymbols(c: Context<BackendEnv>): string[] | Response {
  const query = c.req.query('symbols');
  if (!query?.trim()) {
    return failure(
      c,
      400,
      'SYMBOLS_REQUIRED',
      'Provide one or more comma-separated symbols.',
    );
  }

  const symbols = [...new Set(query.split(',').map((symbol) => symbol.trim().toUpperCase()))];
  if (symbols.length > MAX_SYMBOLS_PER_REQUEST) {
    return failure(
      c,
      400,
      'TOO_MANY_SYMBOLS',
      `A maximum of ${MAX_SYMBOLS_PER_REQUEST} symbols is allowed per request.`,
    );
  }

  const invalid = symbols.filter((symbol) => !SYMBOL_PATTERN.test(symbol));
  if (invalid.length > 0) {
    return failure(c, 400, 'INVALID_SYMBOLS', 'One or more symbols are invalid.', {
      symbols: invalid,
    });
  }

  return symbols.sort();
}

function cacheFor(dependencies: BackendDependencies): Cache | null {
  if (dependencies.cache !== undefined) return dependencies.cache;
  return typeof caches === 'undefined' ? null : caches.default;
}

function cacheKey(c: Context<BackendEnv>, symbols: string[]): Request {
  const url = new URL(c.req.url);
  url.pathname = '/__cache/api/v1/quotes-v1';
  url.search = new URLSearchParams({ symbols: symbols.join(',') }).toString();
  return new Request(url.toString());
}

async function readCache(cache: Cache | null, key: Request): Promise<CachedQuotes | null> {
  if (!cache) return null;
  const response = await cache.match(key);
  if (!response) return null;
  return response.json<CachedQuotes>();
}

function writeCache(
  c: Context<BackendEnv>,
  cache: Cache | null,
  key: Request,
  value: CachedQuotes,
): void {
  if (!cache) return;
  const response = Response.json(value, {
    headers: { 'Cache-Control': `public, max-age=${STALE_CACHE_SECONDS}` },
  });
  c.executionCtx.waitUntil(cache.put(key, response));
}

export function registerQuoteRoutes(
  app: Hono<BackendEnv>,
  dependencies: BackendDependencies,
): void {
  app.get('/api/v1/quotes', async (c) => {
    const parsed = parseSymbols(c);
    if (parsed instanceof Response) return parsed;

    const now = dependencies.now?.() ?? Date.now();
    const cache = cacheFor(dependencies);
    const key = cacheKey(c, parsed);
    const cached = await readCache(cache, key);
    const lookup = dependencies.lookupQuotes ?? lookupYahooQuotes;

    let result: QuoteLookupResult;
    if (cached && now - cached.cachedAt <= FRESH_CACHE_MS) {
      result = cached.result;
      c.header('X-Cache', 'HIT');
    } else {
      try {
        result = await lookup(parsed);
        writeCache(c, cache, key, { cachedAt: now, result });
        c.header('X-Cache', cached ? 'REFRESH' : 'MISS');
      } catch (error) {
        if (!cached) throw error;
        result = cached.result;
        c.header('X-Cache', 'STALE');
      }
    }

    c.header('Cache-Control', 'no-store');
    return success<YahooQuotesData>(c, result);
  });
}
