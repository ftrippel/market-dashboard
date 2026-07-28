import { describe, expect, it, vi } from 'vitest';
import type { YahooChartData } from '../../shared/api/contracts';
import type { InstrumentLookupResult } from './env';
import { createApp } from './app';

const allowedOrigin = 'https://ftrippel.github.io';
const bindings = { ALLOWED_ORIGINS: `${allowedOrigin},http://localhost:5173` };

function appWithLookup(
  lookupInstruments: (symbols: string[]) => Promise<InstrumentLookupResult>,
) {
  return createApp({ lookupInstruments, cache: null });
}

describe('market dashboard backend', () => {
  it('exposes a versioned health endpoint with request metadata', async () => {
    const app = appWithLookup(vi.fn());
    const response = await app.request(
      'https://api.example/api/v1/health',
      {
        headers: {
          Origin: allowedOrigin,
          'X-Request-Id': 'health-test',
        },
      },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
    expect(response.headers.get('X-Request-Id')).toBe('health-test');
    expect(await response.json()).toEqual({
      data: { status: 'ok', service: 'market-dashboard' },
      meta: { requestId: 'health-test' },
    });
  });

  it('normalizes and batches instrument symbols', async () => {
    const lookup = vi.fn().mockResolvedValue({
      instruments: [
        {
          symbol: 'AAPL',
          displayName: 'Apple Inc.',
          shortName: 'Apple Inc.',
          longName: 'Apple Inc.',
          type: 'EQUITY',
          exchange: 'NMS',
          holdings: [
            { s: 'MSFT', n: 'Microsoft Corp.', w: 7.25 },
          ],
        },
      ],
      missingSymbols: ['MISSING'],
    });
    const app = appWithLookup(lookup);
    const response = await app.request(
      'https://api.example/api/v1/instruments?symbols=missing,aapl,AAPL',
      { headers: { Origin: allowedOrigin, 'X-Request-Id': 'instrument-test' } },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(lookup).toHaveBeenCalledWith(['AAPL', 'MISSING']);
    expect(await response.json()).toEqual({
      data: {
        instruments: [
          {
            symbol: 'AAPL',
            displayName: 'Apple Inc.',
            shortName: 'Apple Inc.',
            longName: 'Apple Inc.',
            type: 'EQUITY',
            exchange: 'NMS',
            holdings: [
              { s: 'MSFT', n: 'Microsoft Corp.', w: 7.25 },
            ],
          },
        ],
        missingSymbols: ['MISSING'],
      },
      meta: { requestId: 'instrument-test' },
    });
  });

  it('returns authoritative Yahoo quote snapshots in batches', async () => {
    const lookupQuotes = vi.fn().mockResolvedValue({
      quotes: [
        {
          symbol: 'AAPL',
          regularMarketPrice: 336.97,
          previousClose: 333.02,
          regularMarketTime: 1_785_159_314,
        },
      ],
      missingSymbols: ['MISSING'],
    });
    const app = createApp({
      lookupInstruments: vi.fn(),
      lookupQuotes,
      cache: null,
    });

    const response = await app.request(
      'https://api.example/api/v1/quotes?symbols=missing,aapl,AAPL',
      { headers: { Origin: allowedOrigin, 'X-Request-Id': 'quote-test' } },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Cache')).toBe('MISS');
    expect(lookupQuotes).toHaveBeenCalledWith(['AAPL', 'MISSING']);
    expect(await response.json()).toEqual({
      data: {
        quotes: [
          {
            symbol: 'AAPL',
            regularMarketPrice: 336.97,
            previousClose: 333.02,
            regularMarketTime: 1_785_159_314,
          },
        ],
        missingSymbols: ['MISSING'],
      },
      meta: { requestId: 'quote-test' },
    });
  });

  it('rejects invalid symbols before calling Yahoo Finance', async () => {
    const lookup = vi.fn();
    const app = appWithLookup(lookup);
    const response = await app.request(
      'https://api.example/api/v1/instruments?symbols=AAPL,$BAD',
      { headers: { Origin: allowedOrigin, 'X-Request-Id': 'invalid-test' } },
      bindings,
    );

    expect(response.status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: {
        code: 'INVALID_SYMBOLS',
        details: { symbols: ['$BAD'] },
      },
      meta: { requestId: 'invalid-test' },
    });
  });

  it('proxies validated chart requests through the backend', async () => {
    const chart: YahooChartData = {
      timestamp: [1_700_000_000, 1_700_086_400],
      indicators: {
        quote: [{
          open: [100, 102],
          high: [103, 105],
          low: [99, 101],
          close: [102, 104],
          volume: [1_000, 2_000],
        }],
      },
      meta: {
        symbol: '^GDAXI',
        regularMarketPrice: 104,
        previousClose: 102,
        regularMarketTime: 1_700_090_000,
      },
    };
    const lookupChart = vi.fn().mockResolvedValue(chart);
    const app = createApp({
      lookupInstruments: vi.fn(),
      lookupChart,
      cache: null,
    });

    const response = await app.request(
      'https://api.example/api/v1/charts/%5EGDAXI?interval=1d&range=1y',
      { headers: { Origin: allowedOrigin, 'X-Request-Id': 'chart-test' } },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Cache')).toBe('MISS');
    expect(lookupChart).toHaveBeenCalledWith('^GDAXI', '1d', '1y');
    expect(await response.json()).toEqual({
      data: chart,
      meta: { requestId: 'chart-test' },
    });
  });

  it('rejects unsupported chart parameters before calling Yahoo Finance', async () => {
    const lookupChart = vi.fn();
    const app = createApp({
      lookupInstruments: vi.fn(),
      lookupChart,
      cache: null,
    });

    const response = await app.request(
      'https://api.example/api/v1/charts/AAPL?interval=5m&range=max',
      { headers: { Origin: allowedOrigin, 'X-Request-Id': 'invalid-chart-test' } },
      bindings,
    );

    expect(response.status).toBe(400);
    expect(lookupChart).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_INTERVAL' },
      meta: { requestId: 'invalid-chart-test' },
    });
  });

  it('serves fresh chart data from the Worker cache', async () => {
    const chart: YahooChartData = {
      timestamp: [1_700_000_000],
      indicators: {
        quote: [{
          open: [100],
          high: [101],
          low: [99],
          close: [100],
          volume: [1_000],
        }],
      },
      meta: { symbol: 'AAPL', regularMarketPrice: 100 },
    };
    const lookupChart = vi.fn();
    const cache = {
      match: vi.fn().mockResolvedValue(
        Response.json({ cachedAt: 9_000, result: chart }),
      ),
      put: vi.fn(),
    } as unknown as Cache;
    const app = createApp({
      lookupInstruments: vi.fn(),
      lookupChart,
      cache,
      now: () => 10_000,
    });

    const response = await app.request(
      'https://api.example/api/v1/charts/AAPL?interval=1m&range=1d',
      { headers: { Origin: allowedOrigin } },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache')).toBe('HIT');
    expect(lookupChart).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ data: chart });
  });

  it('rejects browser origins outside the allowlist', async () => {
    const app = appWithLookup(vi.fn());
    const response = await app.request(
      'https://api.example/api/v1/health',
      {
        headers: {
          Origin: 'https://untrusted.example',
          'X-Request-Id': 'cors-test',
        },
      },
      bindings,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'ORIGIN_NOT_ALLOWED' },
      meta: { requestId: 'cors-test' },
    });
  });

  it('only falls back to local cross-origin callers when the binding is absent', async () => {
    const app = appWithLookup(vi.fn());
    const localResponse = await app.request(
      'https://api.example/api/v1/health',
      { headers: { Origin: 'http://localhost:5173' } },
      {},
    );
    const productionResponse = await app.request(
      'https://api.example/api/v1/health',
      { headers: { Origin: allowedOrigin } },
      {},
    );

    expect(localResponse.status).toBe(200);
    expect(productionResponse.status).toBe(403);
  });

  it('allows same-origin browser requests on the deployed Worker domain', async () => {
    const app = appWithLookup(vi.fn());
    const response = await app.request(
      'https://dashboard.example/api/v1/health',
      {
        headers: {
          Origin: 'https://dashboard.example',
          'X-Request-Id': 'same-origin-test',
        },
      },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://dashboard.example',
    );
  });

  it('returns a stable API error when Yahoo Finance fails', async () => {
    const app = appWithLookup(async () => {
      throw new Error('upstream unavailable');
    });
    const response = await app.request(
      'https://api.example/api/v1/instruments?symbols=AAPL',
      { headers: { Origin: allowedOrigin, 'X-Request-Id': 'upstream-test' } },
      bindings,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: 'UPSTREAM_ERROR',
        message: 'The upstream market-data request failed.',
      },
      meta: { requestId: 'upstream-test' },
    });
  });
});
