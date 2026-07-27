import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { YahooQuotesData } from '../../shared/api/contracts';
import { fetchBackendData, isBackendApiConfigured } from './backendApi';
import { fetchYahooQuoteSnapshots } from './quoteApi';

vi.mock('./backendApi', () => ({
  fetchBackendData: vi.fn(),
  isBackendApiConfigured: vi.fn(),
}));

const mockedFetchBackendData = vi.mocked(fetchBackendData);
const mockedIsBackendApiConfigured = vi.mocked(isBackendApiConfigured);

describe('fetchYahooQuoteSnapshots', () => {
  beforeEach(() => {
    mockedFetchBackendData.mockReset();
    mockedIsBackendApiConfigured.mockReset();
  });

  it('maps Yahoo quote symbols back to dashboard symbols', async () => {
    mockedIsBackendApiConfigured.mockReturnValue(true);
    mockedFetchBackendData.mockResolvedValue({
      quotes: [
        {
          symbol: 'AAPL',
          regularMarketPrice: 336.97,
          previousClose: 333.02,
          regularMarketTime: 1_785_159_314,
        },
        {
          symbol: '^VIX',
          regularMarketPrice: 17.5,
          previousClose: 18,
        },
      ],
      missingSymbols: [],
    } satisfies YahooQuotesData);

    const result = await fetchYahooQuoteSnapshots(['AAPL', 'CBOE:VIX']);

    expect(mockedFetchBackendData).toHaveBeenCalledWith('/quotes', {
      query: { symbols: 'AAPL,^VIX' },
      signal: undefined,
    });
    expect(result?.AAPL.previousClose).toBe(333.02);
    expect(result?.['CBOE:VIX'].symbol).toBe('^VIX');
  });

  it('returns null when the batch backend is not configured', async () => {
    mockedIsBackendApiConfigured.mockReturnValue(false);

    expect(await fetchYahooQuoteSnapshots(['AAPL'])).toBeNull();
    expect(mockedFetchBackendData).not.toHaveBeenCalled();
  });
});
