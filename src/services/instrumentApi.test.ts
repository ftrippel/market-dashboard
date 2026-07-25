import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstrumentsData } from '../../shared/api/contracts';
import { fetchBackendData } from './backendApi';
import { fetchInstrumentMetadata } from './instrumentApi';

vi.mock('./backendApi', () => ({
  fetchBackendData: vi.fn(),
}));

const mockedFetchBackendData = vi.mocked(fetchBackendData);

describe('fetchInstrumentMetadata', () => {
  beforeEach(() => {
    mockedFetchBackendData.mockReset();
  });

  it('maps Yahoo symbols back to dashboard symbols', async () => {
    mockedFetchBackendData.mockResolvedValue({
      instruments: [
        {
          symbol: 'AAPL',
          displayName: 'Apple Inc.',
          type: 'EQUITY',
          exchange: 'NMS',
          holdings: [
            { s: 'MSFT', n: 'Microsoft Corp.', w: 7.25 },
          ],
        },
        {
          symbol: '^VIX',
          displayName: 'CBOE Volatility Index',
          type: 'INDEX',
          exchange: 'WCB',
        },
      ],
      missingSymbols: [],
    } satisfies InstrumentsData);

    const result = await fetchInstrumentMetadata(['AAPL', 'CBOE:VIX']);

    expect(mockedFetchBackendData).toHaveBeenCalledWith('/instruments', {
      query: { symbols: 'AAPL,^VIX' },
      signal: undefined,
    });
    expect(result.AAPL.displayName).toBe('Apple Inc.');
    expect(result.AAPL.holdings).toEqual([
      { s: 'MSFT', n: 'Microsoft Corp.', w: 7.25 },
    ]);
    expect(result['CBOE:VIX'].displayName).toBe('CBOE Volatility Index');
  });

  it('does not send FRED-only symbols to the Yahoo backend', async () => {
    mockedFetchBackendData.mockResolvedValue({
      instruments: [],
      missingSymbols: [],
    } satisfies InstrumentsData);

    const result = await fetchInstrumentMetadata(['US2Y']);

    expect(result).toEqual({});
    expect(mockedFetchBackendData).not.toHaveBeenCalled();
  });
});
