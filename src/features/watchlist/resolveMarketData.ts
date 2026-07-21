import { getDisplayName, getSymbolMeta } from '../../data/symbolMaps';
import type { MarketData, MarketState } from '../../types';
import type { WatchlistQuote } from './useWatchlistQuotes';
import type { WatchlistItem } from './types';

const MARKET_ARRAY_KEYS: (keyof MarketState)[] = [
  'futures',
  'dxvix',
  'crypto',
  'metals',
  'commodities',
  'yields',
  'global',
  'etfs',
  'submkt',
  'sectors',
  'sectorsEW',
  'thematic',
  'country',
];

export function findMarketData(store: MarketState, sym: string): MarketData | undefined {
  for (const key of MARKET_ARRAY_KEYS) {
    const arr = store[key];
    if (!Array.isArray(arr)) continue;
    const found = arr.find((item) => item.sym === sym);
    if (found) return found;
  }
  return undefined;
}

export function watchlistItemToMarketData(
  item: WatchlistItem,
  store: MarketState,
  quotes: Record<string, WatchlistQuote> = {},
): MarketData {
  const existing = findMarketData(store, item.sym);
  if (existing) return existing;

  const quote = quotes[item.sym];
  const meta = getSymbolMeta(item.sym);

  return {
    sym: item.sym,
    name: meta.name,
    price: quote?.price,
    d1: quote?.d1 ?? 0,
    w1: quote?.w1 ?? 0,
    hi52: quote?.hi52 ?? 0,
    ytd: quote?.ytd ?? 0,
    spark: quote?.spark ?? [],
    updatedAt: quote?.updatedAt,
  };
}

export function getWatchlistMetrics(
  item: WatchlistItem,
  store: MarketState,
  quotes: Record<string, WatchlistQuote> = {},
) {
  const existing = findMarketData(store, item.sym);
  const quote = quotes[item.sym];
  return {
    d1: existing?.d1 ?? quote?.d1,
    w1: existing?.w1 ?? quote?.w1,
    hi52: existing?.hi52 ?? quote?.hi52,
    ytd: existing?.ytd ?? quote?.ytd,
  };
}

export function matchesWatchlistSearch(
  item: WatchlistItem,
  store: MarketState,
  query: string,
): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const market = findMarketData(store, item.sym);
  const displayName = getDisplayName(item.sym, market?.name);
  const tagMatch = item.tags.some((tag) => tag.toLowerCase().includes(q));
  const commentMatch = (item.comment ?? '').toLowerCase().includes(q);

  return (
    item.sym.toLowerCase().includes(q) ||
    displayName.toLowerCase().includes(q) ||
    tagMatch ||
    commentMatch
  );
}

export function matchesWatchlistTags(item: WatchlistItem, activeTags: string[]): boolean {
  if (activeTags.length === 0) return true;
  const itemTags = item.tags.map((tag) => tag.toLowerCase());
  return activeTags.some((tag) => itemTags.includes(tag.toLowerCase()));
}
