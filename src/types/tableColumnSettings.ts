export type MarketColumnKey =
  | 'price'
  | 'd1'
  | 'w1'
  | 'm1'
  | 'm3'
  | 'm6'
  | 'ytd'
  | 'hi52'
  | 'spark'
  | 'trend';

export type SortableMarketColumnKey = Exclude<MarketColumnKey, 'spark'>;

export interface MarketColumnDefinition {
  key: MarketColumnKey;
  label: string;
  sortable: boolean;
}

export const MARKET_COLUMN_DEFINITIONS: readonly MarketColumnDefinition[] = [
  { key: 'price', label: 'Price', sortable: true },
  { key: 'd1', label: '1D%', sortable: true },
  { key: 'w1', label: '1W%', sortable: true },
  { key: 'm1', label: '1M%', sortable: true },
  { key: 'm3', label: '3M%', sortable: true },
  { key: 'm6', label: '6M%', sortable: true },
  { key: 'ytd', label: 'YTD%', sortable: true },
  { key: 'hi52', label: '52W Hi%', sortable: true },
  { key: 'spark', label: 'Sparkline', sortable: false },
  { key: 'trend', label: 'Trend', sortable: true },
] as const;

export const MARKET_COLUMN_KEYS = MARKET_COLUMN_DEFINITIONS.map(({ key }) => key);
export const SORTABLE_MARKET_COLUMN_KEYS = MARKET_COLUMN_DEFINITIONS
  .filter(({ sortable }) => sortable)
  .map(({ key }) => key as SortableMarketColumnKey);

/**
 * The shared columns intentionally match the old watchlist layout. Individual
 * market sections merge their existing Price, Sparkline, and Trend columns in.
 */
export const DEFAULT_MARKET_COLUMNS: MarketColumnKey[] = ['d1', 'w1', 'hi52', 'ytd'];
export const DEFAULT_MARKET_SORT_COLUMN: SortableMarketColumnKey = 'w1';

export function isMarketColumnKey(value: unknown): value is MarketColumnKey {
  return typeof value === 'string' && MARKET_COLUMN_KEYS.includes(value as MarketColumnKey);
}

export function isSortableMarketColumnKey(value: unknown): value is SortableMarketColumnKey {
  return (
    typeof value === 'string' &&
    SORTABLE_MARKET_COLUMN_KEYS.includes(value as SortableMarketColumnKey)
  );
}

export function parseMarketColumns(value: unknown): MarketColumnKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_MARKET_COLUMNS];

  const selected = new Set(value.filter(isMarketColumnKey));
  return MARKET_COLUMN_KEYS.filter((key) => selected.has(key));
}

export function resolveMarketColumns(
  configuredColumns: readonly MarketColumnKey[],
  sectionColumns: readonly MarketColumnKey[] = [],
): MarketColumnKey[] {
  const selected = new Set([...configuredColumns, ...sectionColumns]);
  return MARKET_COLUMN_KEYS.filter((key) => selected.has(key));
}

export function resolveDefaultSortColumn(
  preferred: SortableMarketColumnKey,
  visibleColumns: readonly MarketColumnKey[],
): SortableMarketColumnKey | 'name' {
  if (visibleColumns.includes(preferred)) return preferred;
  const fallback = visibleColumns.find(
    (key): key is SortableMarketColumnKey => key !== 'spark',
  );
  return fallback ?? 'name';
}
