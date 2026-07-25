export interface ApiMeta {
  requestId: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ApiMeta;
}

export interface HealthData {
  status: 'ok';
  service: 'market-dashboard-api';
}

export interface InstrumentHolding {
  s: string;
  n: string;
  w: number;
}

export interface InstrumentMetadata {
  symbol: string;
  displayName: string;
  shortName?: string;
  longName?: string;
  type: string;
  exchange: string;
  holdings?: InstrumentHolding[];
}

export interface InstrumentsData {
  instruments: InstrumentMetadata[];
  missingSymbols: string[];
}

export type YahooChartInterval = '1m' | '1d';
export type YahooChartRange = '1d' | '1y' | '2y';

export interface YahooChartQuote {
  open: Array<number | null>;
  high: Array<number | null>;
  low: Array<number | null>;
  close: Array<number | null>;
  volume: Array<number | null>;
}

export interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketTime?: number;
}

export interface YahooChartData {
  timestamp: number[];
  indicators: {
    quote: [YahooChartQuote];
  };
  meta: YahooChartMeta;
}
