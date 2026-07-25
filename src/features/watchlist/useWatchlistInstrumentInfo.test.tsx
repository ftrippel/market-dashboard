// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstrumentMetadataBySymbol } from '../../services/instrumentApi';
import type { MarketState } from '../../types';
import { fetchInstrumentMetadata } from '../../services/instrumentApi';
import { useWatchlistInstrumentInfo } from './useWatchlistInstrumentInfo';

vi.mock('../../services/backendApi', () => ({
  isBackendApiConfigured: () => true,
}));

vi.mock('../../services/instrumentApi', () => ({
  fetchInstrumentMetadata: vi.fn(),
}));

const mockedFetchInstrumentMetadata = vi.mocked(fetchInstrumentMetadata);
const emptyStore = {} as MarketState;

describe('useWatchlistInstrumentInfo', () => {
  beforeEach(() => {
    mockedFetchInstrumentMetadata.mockReset();
  });

  it('lets an in-flight lookup finish when the unresolved symbol set changes', async () => {
    let resolveLookup!: (value: InstrumentMetadataBySymbol) => void;
    mockedFetchInstrumentMetadata.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const { result, rerender } = renderHook(
      ({ symbols }) => useWatchlistInstrumentInfo(symbols, emptyStore),
      { initialProps: { symbols: ['AAPL', 'MSFT'] } },
    );

    await waitFor(() => {
      expect(mockedFetchInstrumentMetadata).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    });

    rerender({ symbols: ['AAPL'] });
    expect(mockedFetchInstrumentMetadata).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLookup({
        AAPL: {
          symbol: 'AAPL',
          displayName: 'Apple Inc.',
          type: 'EQUITY',
          exchange: 'NMS',
        },
      });
    });

    await waitFor(() => {
      expect(result.current.AAPL?.displayName).toBe('Apple Inc.');
    });
  });

  it('does not look up symbols already included in dashboard market data', () => {
    const store = {
      etfs: [
        {
          sym: 'SPY',
          d1: 0,
          w1: 0,
          hi52: 0,
          ytd: 0,
          spark: [],
        },
      ],
    } as unknown as MarketState;

    renderHook(() => useWatchlistInstrumentInfo(['SPY'], store));

    expect(mockedFetchInstrumentMetadata).not.toHaveBeenCalled();
  });
});
