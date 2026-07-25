import { describe, expect, it } from 'vitest';
import type { MarketState } from '../../types';
import { matchesWatchlistSearch, watchlistItemToMarketData } from './resolveMarketData';

const emptyStore = {} as MarketState;
const appleInfo = {
  AAPL: {
    symbol: 'AAPL',
    displayName: 'Apple Inc.',
    type: 'EQUITY',
    exchange: 'NMS',
  },
};

describe('watchlist instrument metadata', () => {
  it('uses backend metadata as the display name for an otherwise unknown symbol', () => {
    const data = watchlistItemToMarketData(
      { sym: 'AAPL', tags: [] },
      emptyStore,
      {},
      appleInfo,
    );

    expect(data.name).toBe('Apple Inc.');
  });

  it('includes backend display names in watchlist search', () => {
    expect(
      matchesWatchlistSearch(
        { sym: 'AAPL', tags: [] },
        emptyStore,
        'apple',
        {},
        appleInfo,
      ),
    ).toBe(true);
  });
});
