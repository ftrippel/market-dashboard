import { describe, expect, it, vi } from 'vitest';
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
      data: { status: 'ok', service: 'market-dashboard-api' },
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
          },
        ],
        missingSymbols: ['MISSING'],
      },
      meta: { requestId: 'instrument-test' },
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
