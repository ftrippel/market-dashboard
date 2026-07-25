import { beforeEach, describe, expect, it, vi } from 'vitest';

const yahooMocks = vi.hoisted(() => ({
  quote: vi.fn(),
  quoteSummary: vi.fn(),
}));

vi.mock('yahoo-finance2/createYahooFinance', () => ({
  default: () =>
    class YahooFinanceMock {
      quote = yahooMocks.quote;
      quoteSummary = yahooMocks.quoteSummary;
    },
}));

vi.mock('yahoo-finance2/modules/quote', () => ({
  default: vi.fn(),
}));

vi.mock('yahoo-finance2/modules/quoteSummary', () => ({
  default: vi.fn(),
}));

import { lookupYahooInstruments } from './yahooFinance';

describe('lookupYahooInstruments', () => {
  beforeEach(() => {
    yahooMocks.quote.mockReset();
    yahooMocks.quoteSummary.mockReset();
  });

  it('fetches and normalizes top holdings only for ETFs', async () => {
    yahooMocks.quote.mockResolvedValue([
      {
        symbol: 'SPY',
        shortName: 'SPDR S&P 500 ETF Trust',
        quoteType: 'ETF',
        exchange: 'PCX',
      },
      {
        symbol: 'AAPL',
        shortName: 'Apple Inc.',
        quoteType: 'EQUITY',
        exchange: 'NMS',
      },
    ]);
    yahooMocks.quoteSummary.mockResolvedValue({
      topHoldings: {
        holdings: [
          {
            symbol: 'NVDA',
            holdingName: 'NVIDIA Corporation',
            holdingPercent: 0.0725,
          },
          {
            symbol: 'MSFT',
            holdingName: 'Microsoft Corporation',
            holdingPercent: 6.31,
          },
        ],
      },
    });

    const result = await lookupYahooInstruments(['SPY', 'AAPL']);

    expect(yahooMocks.quoteSummary).toHaveBeenCalledOnce();
    expect(yahooMocks.quoteSummary).toHaveBeenCalledWith('SPY', {
      modules: ['topHoldings'],
    });
    expect(result.instruments).toEqual([
      {
        symbol: 'SPY',
        displayName: 'SPDR S&P 500 ETF Trust',
        shortName: 'SPDR S&P 500 ETF Trust',
        type: 'ETF',
        exchange: 'PCX',
        holdings: [
          { s: 'NVDA', n: 'NVIDIA Corporation', w: 7.25 },
          { s: 'MSFT', n: 'Microsoft Corporation', w: 6.31 },
        ],
      },
      {
        symbol: 'AAPL',
        displayName: 'Apple Inc.',
        shortName: 'Apple Inc.',
        type: 'EQUITY',
        exchange: 'NMS',
      },
    ]);
  });
});
