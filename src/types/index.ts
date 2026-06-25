/**
 * Core type definitions for market dashboard
 */

export interface MarketData {
  sym: string;
  name?: string;
  flag?: string;
  price?: number;
  d1: number;
  w1: number;
  hi52: number;
  ytd: number;
  spark: number[];
  ema_uptrend?: boolean;
}

export interface Future extends MarketData {
  sym: string;
}

export interface DXVix extends MarketData {
  sym: string;
}

export interface Crypto extends MarketData {
  sym: string;
}

export interface Metal extends MarketData {
  sym: string;
}

export interface Commodity extends MarketData {
  sym: string;
}

export interface Yield extends MarketData {
  sym: string;
}

export interface GlobalIndex extends MarketData {
  sym: string;
}

export interface ETF extends MarketData {
  sym: string;
}

export interface Sector extends MarketData {
  sym: string;
}

export interface Holding {
  s: string;
  n: string;
  w: number;
}

export interface BreadthFearGreed {
  score: number;
  rating: string;
}

export interface BreadthNaaim {
  value: number;
  date?: string;
}

export interface BreadthAdvanceDecline {
  advancers: number;
  decliners: number;
}

export interface BreadthNewHighLow {
  new_highs: number;
  new_lows: number;
}

export interface Breadth {
  fear_greed?: BreadthFearGreed;
  naaim?: BreadthNaaim | null;
  advance_decline?: BreadthAdvanceDecline;
  new_high_low?: BreadthNewHighLow;
  pct_above_sma20?: number;
  pct_above_sma50?: number;
  pct_above_sma200?: number;
}

export interface MarketState {
  futures: Future[];
  dxvix: DXVix[];
  crypto: Crypto[];
  metals: Metal[];
  commodities: Commodity[];
  yields: Yield[];
  global: GlobalIndex[];
  etfs: ETF[];
  submkt: ETF[];
  sectors: Sector[];
  sectorsEW: Sector[];
  thematic: ETF[];
  country: ETF[];
  breadth: Breadth | null;
  holdings: Record<string, Holding[]>;
  generatedAt: string | null;

  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
}

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  format?: 'number' | 'percent' | 'pnl' | 'bps' | 'text';
  width?: string;
  onRender?: (value: unknown, row: MarketData) => React.ReactNode;
}

export interface MarketTableOptions {
  rank?: boolean;
  hasPrice?: boolean;
  isYield?: boolean;
  showSpark?: boolean;
  showTrend?: boolean;
  showHoldings?: boolean;
  benchmarkSym?: string;
  sortBy?: keyof MarketData | string;
  sortOrder?: 'asc' | 'desc';
  nameLabel?: string;
  priceLabel?: string;
  /** Show only the first N rows after sorting (full dataset is still used for sort). */
  maxRows?: number;
}
