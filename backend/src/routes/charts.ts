import type { Context, Hono } from 'hono';
import type {
  YahooChartData,
  YahooChartInterval,
  YahooChartRange,
} from '../../../shared/api/contracts';
import type { BackendDependencies, BackendEnv } from '../env';
import { failure, success } from '../http';
import { fetchYahooChart } from '../services/yahooChart';

const SYMBOL_PATTERN = /^[A-Z0-9^.=:_-]{1,32}$/;
const VALID_INTERVALS = new Set<YahooChartInterval>(['1m', '1d']);
const VALID_RANGES = new Set<YahooChartRange>(['1d', '1y', '2y']);
const LIVE_FRESH_CACHE_MS = 15 * 1000;
const DAILY_FRESH_CACHE_MS = 60 * 1000;
const STALE_CACHE_SECONDS = 15 * 60;

interface CachedChart {
  cachedAt: number;
  result: YahooChartData;
}

function cacheFor(dependencies: BackendDependencies): Cache | null {
  if (dependencies.cache !== undefined) return dependencies.cache;
  return typeof caches === 'undefined' ? null : caches.default;
}

function cacheKey(
  c: Context<BackendEnv>,
  symbol: string,
  interval: YahooChartInterval,
  range: YahooChartRange,
): Request {
  const url = new URL(c.req.url);
  url.pathname = '/__cache/api/v1/charts-v1';
  url.search = new URLSearchParams({ symbol, interval, range }).toString();
  return new Request(url.toString());
}

async function readCache(cache: Cache | null, key: Request): Promise<CachedChart | null> {
  if (!cache) return null;
  const response = await cache.match(key);
  if (!response) return null;
  return response.json<CachedChart>();
}

function writeCache(
  c: Context<BackendEnv>,
  cache: Cache | null,
  key: Request,
  value: CachedChart,
): void {
  if (!cache) return;
  const response = Response.json(value, {
    headers: { 'Cache-Control': `public, max-age=${STALE_CACHE_SECONDS}` },
  });
  c.executionCtx.waitUntil(cache.put(key, response));
}

export function registerChartRoutes(
  app: Hono<BackendEnv>,
  dependencies: BackendDependencies,
): void {
  app.get('/api/v1/charts/:symbol', async (c) => {
    const symbol = c.req.param('symbol').trim().toUpperCase();
    const interval = c.req.query('interval') ?? '1d';
    const range = c.req.query('range') ?? '1y';

    if (!SYMBOL_PATTERN.test(symbol)) {
      return failure(c, 400, 'INVALID_SYMBOL', 'The Yahoo Finance symbol is invalid.');
    }
    if (!VALID_INTERVALS.has(interval as YahooChartInterval)) {
      return failure(c, 400, 'INVALID_INTERVAL', 'The chart interval is invalid.');
    }
    if (!VALID_RANGES.has(range as YahooChartRange)) {
      return failure(c, 400, 'INVALID_RANGE', 'The chart range is invalid.');
    }

    const chartInterval = interval as YahooChartInterval;
    const chartRange = range as YahooChartRange;
    const now = dependencies.now?.() ?? Date.now();
    const cache = cacheFor(dependencies);
    const key = cacheKey(c, symbol, chartInterval, chartRange);
    const cached = await readCache(cache, key);
    const freshFor =
      chartInterval === '1m' ? LIVE_FRESH_CACHE_MS : DAILY_FRESH_CACHE_MS;
    const lookup = dependencies.lookupChart ?? fetchYahooChart;

    let result: YahooChartData;
    if (cached && now - cached.cachedAt <= freshFor) {
      result = cached.result;
      c.header('X-Cache', 'HIT');
    } else {
      try {
        result = await lookup(symbol, chartInterval, chartRange);
        writeCache(c, cache, key, { cachedAt: now, result });
        c.header('X-Cache', cached ? 'REFRESH' : 'MISS');
      } catch (error) {
        if (!cached) throw error;
        result = cached.result;
        c.header('X-Cache', 'STALE');
      }
    }

    c.header('Cache-Control', 'no-store');
    return success<YahooChartData>(c, result);
  });
}
