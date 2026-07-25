import { afterEach, describe, expect, it, vi } from 'vitest';
import type { YahooChartData } from '../../shared/api/contracts';

const backendMocks = vi.hoisted(() => ({
  configured: vi.fn(() => false),
  fetchData: vi.fn(),
}));

vi.mock('./backendApi', () => ({
  isBackendApiConfigured: backendMocks.configured,
  fetchBackendData: backendMocks.fetchData,
}));

import {
  fetchYahooFinanceDailyHistory,
  fetchYahooFinanceMarketMetrics,
  fetchYahooFinanceOhlcHistory,
  fetchYahooFinancePrice,
} from './api';

function mockYahooChart({
  closes,
  highs = closes,
  regularMarketPrice,
  previousClose,
  regularMarketTime = 1_784_879_618,
}: {
  closes: Array<number | null>;
  highs?: Array<number | null>;
  regularMarketPrice?: number;
  previousClose?: number;
  regularMarketTime?: number;
}) {
  const timestamps = closes.map((_, index) => 1_784_700_000 + index * 86_400);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        chart: {
          result: [
            {
              timestamp: timestamps,
              indicators: { quote: [{ close: closes, high: highs }] },
              meta: { regularMarketPrice, previousClose, regularMarketTime },
            },
          ],
        },
      }),
    }),
  );
}

describe('fetchYahooFinanceMarketMetrics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    backendMocks.configured.mockReturnValue(false);
    backendMocks.fetchData.mockReset();
  });

  it('uses the configured backend instead of the public CORS proxy', async () => {
    const chart: YahooChartData = {
      timestamp: [1_784_700_000, 1_784_786_400],
      indicators: {
        quote: [{
          open: [100, 102],
          high: [101, 104],
          low: [99, 101],
          close: [100, 103],
          volume: [1_000, 2_000],
        }],
      },
      meta: {
        regularMarketPrice: 103,
        previousClose: 100,
        regularMarketTime: 1_784_879_618,
      },
    };
    backendMocks.configured.mockReturnValue(true);
    backendMocks.fetchData.mockResolvedValue(chart);
    const directFetch = vi.fn();
    vi.stubGlobal('fetch', directFetch);

    const metrics = await fetchYahooFinanceMarketMetrics('SAP.DE');

    expect(metrics?.d1).toBe(3);
    expect(backendMocks.fetchData).toHaveBeenCalledWith('/charts/SAP.DE', {
      query: { interval: '1d', range: '1y' },
    });
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('uses the backend for live price snapshots', async () => {
    backendMocks.configured.mockReturnValue(true);
    backendMocks.fetchData.mockResolvedValue({
      timestamp: [1_784_879_618],
      indicators: {
        quote: [{
          open: [102],
          high: [105],
          low: [101],
          close: [104],
          volume: [2_000],
        }],
      },
      meta: {
        regularMarketPrice: 104,
        chartPreviousClose: 102,
        regularMarketTime: 1_784_879_618,
      },
    } satisfies YahooChartData);

    const quote = await fetchYahooFinancePrice('SAP.DE');

    expect(quote).toEqual({
      price: 104,
      d1: 1.96,
      updatedAt: 1_784_879_618_000,
    });
    expect(backendMocks.fetchData).toHaveBeenCalledWith('/charts/SAP.DE', {
      query: { interval: '1m', range: '1d' },
    });
  });

  it('uses Yahoo market metadata when daily history skips the previous trading day intraday', async () => {
    mockYahooChart({
      closes: [136.42, 132.04, 136.6],
      highs: [138, 137, 137.5],
      regularMarketPrice: 136.6,
      previousClose: 128.32,
    });

    const metrics = await fetchYahooFinanceMarketMetrics('SAP.DE');

    expect(metrics?.price).toBe(136.6);
    expect(metrics?.d1).toBe(6.45);
  });

  it('uses the closing snapshot after the market closes', async () => {
    mockYahooChart({
      closes: [126.5, 128.32, 136.6],
      regularMarketPrice: 136.6,
      previousClose: 128.32,
    });

    const metrics = await fetchYahooFinanceMarketMetrics('SAP.DE');

    expect(metrics?.price).toBe(136.6);
    expect(metrics?.d1).toBe(6.45);
  });

  it('repairs a missing current daily close without making a second request', async () => {
    mockYahooChart({
      closes: [100, 102, null],
      highs: [101, 103, 106],
      regularMarketPrice: 105,
    });

    const metrics = await fetchYahooFinanceMarketMetrics('TEST');

    expect(metrics?.price).toBe(105);
    expect(metrics?.d1).toBe(2.94);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('adds the current session when daily history ends on the previous session', async () => {
    mockYahooChart({
      closes: [100, 102],
      regularMarketPrice: 105,
    });

    const metrics = await fetchYahooFinanceMarketMetrics('TEST');

    expect(metrics?.price).toBe(105);
    expect(metrics?.d1).toBe(2.94);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fetches all market metrics with a single cache-busted history request', async () => {
    mockYahooChart({
      closes: [100, 102],
      regularMarketPrice: 103,
      previousClose: 102,
    });

    await fetchYahooFinanceMarketMetrics('TEST');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = vi.mocked(fetch).mock.calls[0];
    const proxyUrl = new URL(String(input));
    const targetUrl = new URL(proxyUrl.searchParams.get('url') ?? '');
    expect(targetUrl.searchParams.get('interval')).toBe('1d');
    expect(targetUrl.searchParams.get('range')).toBe('1y');
    expect(targetUrl.searchParams.get('_')).toBeTruthy();
    expect(init).toEqual({ cache: 'no-store' });
  });

  it('falls back to consecutive daily candles when Yahoo metadata is unavailable', async () => {
    mockYahooChart({ closes: [100, 102] });

    const metrics = await fetchYahooFinanceMarketMetrics('TEST');

    expect(metrics?.price).toBe(102);
    expect(metrics?.d1).toBe(2);
  });

  it('calculates yield changes from metadata in basis points', async () => {
    mockYahooChart({
      closes: [4.5, 4.6],
      regularMarketPrice: 47,
      previousClose: 46,
    });

    const metrics = await fetchYahooFinanceMarketMetrics('^TNX');

    expect(metrics?.price).toBe(4.7);
    expect(metrics?.d1).toBe(10);
  });

  it('calculates 1M, 3M, 6M and trend metrics from daily history', async () => {
    const closes = Array.from({ length: 127 }, (_, index) => 100 + index);
    mockYahooChart({ closes });

    const metrics = await fetchYahooFinanceMarketMetrics('TEST');

    expect(metrics?.m1).toBe(10.24);
    expect(metrics?.m3).toBe(38.65);
    expect(metrics?.m6).toBe(126);
    expect(metrics?.ema_uptrend).toBe(true);
  });

  it('returns unavailable long-period metrics for a newly listed symbol', async () => {
    mockYahooChart({ closes: [100, 101, 102, 103, 104] });

    const metrics = await fetchYahooFinanceMarketMetrics('NEW');

    expect(metrics?.m1).toBeUndefined();
    expect(metrics?.m3).toBeUndefined();
    expect(metrics?.m6).toBeUndefined();
    expect(metrics?.ema_uptrend).toBeUndefined();
  });

  it('calculates longer yield periods in basis points', async () => {
    const closes = Array.from({ length: 127 }, (_, index) => 4 + index * 0.01);
    mockYahooChart({ closes });

    const metrics = await fetchYahooFinanceMarketMetrics('^TNX');

    expect(metrics?.m1).toBe(21);
    expect(metrics?.m3).toBe(63);
    expect(metrics?.m6).toBe(126);
  });
});

describe('Yahoo Finance daily chart history', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('repairs a latest same-session null close from the market snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                timestamp: [1_784_813_400, 1_784_899_800],
                indicators: {
                  quote: [
                    {
                      open: [138.52, 137.72],
                      high: [142.33, 137.81],
                      low: [138.15, 133.53],
                      close: [139.49, null],
                    },
                  ],
                },
                meta: {
                  regularMarketPrice: 136.69,
                  regularMarketTime: 1_784_923_200,
                },
              },
            ],
          },
        }),
      }),
    );

    const lineHistory = await fetchYahooFinanceDailyHistory('USO');
    const ohlcHistory = await fetchYahooFinanceOhlcHistory('USO');

    expect(lineHistory?.at(-1)).toEqual({
      time: '2026-07-24',
      value: 136.69,
    });
    expect(ohlcHistory?.at(-1)).toEqual({
      time: '2026-07-24',
      open: 137.72,
      high: 137.81,
      low: 133.53,
      close: 136.69,
    });
  });

  it('does not apply a market snapshot from a different session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                timestamp: [1_784_813_400, 1_784_899_800],
                indicators: {
                  quote: [
                    {
                      open: [138.52, 137.72],
                      high: [142.33, 137.81],
                      low: [138.15, 133.53],
                      close: [139.49, null],
                    },
                  ],
                },
                meta: {
                  regularMarketPrice: 136.69,
                  regularMarketTime: 1_784_836_800,
                },
              },
            ],
          },
        }),
      }),
    );

    const history = await fetchYahooFinanceOhlcHistory('USO');

    expect(history).toHaveLength(1);
    expect(history?.at(-1)?.time).toBe('2026-07-23');
  });
});
