import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchYahooFinanceMarketMetrics } from './api';

function mockYahooChart({
  closes,
  highs = closes,
  regularMarketPrice,
  previousClose,
  regularMarketTime = 1_784_879_618,
}: {
  closes: number[];
  highs?: number[];
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
});
