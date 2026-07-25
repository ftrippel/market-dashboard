import { beforeEach, describe, expect, it, vi } from 'vitest';

const yahooMocks = vi.hoisted(() => ({
  chart: vi.fn(),
}));

vi.mock('yahoo-finance2/createYahooFinance', () => ({
  default: () =>
    class YahooFinanceMock {
      chart = yahooMocks.chart;
    },
}));

vi.mock('yahoo-finance2/modules/chart', () => ({
  default: vi.fn(),
}));

import { fetchYahooChart } from './yahooChart';

describe('fetchYahooChart', () => {
  beforeEach(() => {
    yahooMocks.chart.mockReset();
  });

  it('uses yahoo-finance2 and returns only the chart fields used by the client', async () => {
    yahooMocks.chart.mockResolvedValue({
      timestamp: [1_700_000_000, 1_700_086_400],
      indicators: {
        quote: [
          {
            open: [100, 102],
            high: [103, 105],
            low: [99, 101],
            close: [102, null],
            volume: [1_000, 2_000],
          },
        ],
      },
      meta: {
        symbol: '^GDAXI',
        regularMarketPrice: 104,
        previousClose: 102,
        regularMarketTime: new Date(1_700_090_000 * 1000),
        unused: 'discarded',
      },
    });

    const result = await fetchYahooChart('^GDAXI', '1d', '1y');

    expect(yahooMocks.chart).toHaveBeenCalledOnce();
    expect(yahooMocks.chart).toHaveBeenCalledWith(
      '^GDAXI',
      expect.objectContaining({
        interval: '1d',
        includePrePost: false,
        return: 'object',
        period1: expect.any(Date),
        period2: expect.any(Date),
      }),
    );
    expect(result).toEqual({
      timestamp: [1_700_000_000, 1_700_086_400],
      indicators: {
        quote: [
          {
            open: [100, 102],
            high: [103, 105],
            low: [99, 101],
            close: [102, null],
            volume: [1_000, 2_000],
          },
        ],
      },
      meta: {
        symbol: '^GDAXI',
        regularMarketPrice: 104,
        previousClose: 102,
        regularMarketTime: 1_700_090_000,
      },
    });
  });

  it('rejects incomplete upstream chart responses', async () => {
    yahooMocks.chart.mockResolvedValue({
      timestamp: [],
      indicators: { quote: [{ close: [] }] },
      meta: {},
    });

    await expect(fetchYahooChart('AAPL', '1d', '1y')).rejects.toThrow(
      'Yahoo returned an incomplete chart response.',
    );
  });
});
