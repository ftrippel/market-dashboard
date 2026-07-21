import type { MarketData, MarketState, Holding } from '../types';
import { isYieldSymbol, isYahooFetchable, toYahooFinanceSymbol } from '../data/symbolMaps';

export { toYahooFinanceSymbol };

interface RawData {
  generated_at?: string;
  futures?: MarketData[];
  dxvix?: MarketData[];
  crypto?: MarketData[];
  metals?: MarketData[];
  commod?: MarketData[];
  yields?: MarketData[];
  global?: MarketData[];
  etfmain?: MarketData[];
  submarket?: MarketData[];
  sector?: MarketData[];
  sectorew?: MarketData[];
  thematic?: MarketData[];
  country?: MarketData[];
  breadth?: MarketState['breadth'];
  holdings?: Record<string, Holding[]>;
}

export async function fetchMarketData(): Promise<MarketState> {
  const response = await fetch(`${import.meta.env.BASE_URL}data.json?_=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.statusText}`);
  }
  const data: RawData = await response.json();
  return transformData(data);
}

function sortByW1(data: MarketData[]): MarketData[] {
  return [...data].sort((a, b) => (b.w1 ?? 0) - (a.w1 ?? 0));
}

function prepareSectors(
  sectors: MarketData[] | undefined,
  etfmain: MarketData[] | undefined,
  benchmarkSym: string
): MarketData[] {
  const benchmark = etfmain?.find((e) => e.sym === benchmarkSym);
  let data = sectors ? [...sectors] : [];
  if (benchmark && !data.find((e) => e.sym === benchmarkSym)) {
    data.push({ ...benchmark });
  }
  return sortByW1(data);
}

function transformData(raw: RawData): MarketState {
  const etfmain = raw.etfmain ?? [];

  return {
    futures: raw.futures ?? [],
    dxvix: raw.dxvix ?? [],
    crypto: raw.crypto ?? [],
    metals: raw.metals ?? [],
    commodities: raw.commod ?? [],
    yields: raw.yields ?? [],
    global: raw.global ?? [],
    etfs: etfmain,
    submkt: sortByW1(raw.submarket ?? []),
    sectors: prepareSectors(raw.sector, etfmain, 'SPY'),
    sectorsEW: prepareSectors(raw.sectorew, etfmain, 'RSP'),
    thematic: sortByW1(raw.thematic ?? []),
    country: sortByW1(raw.country ?? []),
    breadth: raw.breadth ?? null,
    holdings: raw.holdings ?? {},
    generatedAt: raw.generated_at ?? null,
    lastUpdated: raw.generated_at ? new Date(raw.generated_at) : new Date(),
    loading: false,
    error: null,
  };
}

export function buildYahooFinanceQuoteUrl(sym: string): string {
  const yfSym = toYahooFinanceSymbol(sym);
  return `https://finance.yahoo.com/quote/${encodeURIComponent(yfSym)}/`;
}

export async function fetchYahooFinancePrice(sym: string): Promise<{ price: number; d1: number; updatedAt?: number } | null> {
  if (!isYahooFetchable(sym)) return null;

  const yfSym = toYahooFinanceSymbol(sym);
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSym)}?interval=1m&range=1d`;
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;

  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch live price for ${sym}: HTTP ${res.status}`);
  }
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  let currentPrice = meta.regularMarketPrice;
  let prevClose = meta.previousClose ?? meta.chartPreviousClose;
  if (currentPrice == null || prevClose == null || prevClose === 0) return null;

  const isYield = isYieldSymbol(sym);
  
  if (isYield) {
    // If the index is scaled by 10 (e.g. 44.0 instead of 4.4), scale it down
    if (currentPrice > 10) currentPrice = currentPrice / 10;
    if (prevClose > 10) prevClose = prevClose / 10;
  }

  const d1 = isYield
    ? (currentPrice - prevClose) * 100
    : ((currentPrice - prevClose) / prevClose) * 100;

  return {
    price: currentPrice,
    d1: roundToDecimals(d1, isYield ? 1 : 2),
    updatedAt: meta.regularMarketTime ? meta.regularMarketTime * 1000 : undefined,
  };
}

export interface DailyHistoryPoint {
  time: string;
  value: number;
}

export interface DailyOhlcPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

function formatYahooTimestamp(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function scaleYieldValue(value: number): number {
  return value > 10 ? value / 10 : value;
}

async function fetchYahooFinanceChartResult(sym: string, range: string) {
  if (!isYahooFetchable(sym)) return null;

  const yfSym = toYahooFinanceSymbol(sym);
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSym)}?interval=1d&range=${range}`;
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;

  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch daily history for ${sym}: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data?.chart?.result?.[0] ?? null;
}

export async function fetchYahooFinanceDailyHistory(sym: string): Promise<DailyHistoryPoint[] | null> {
  const result = await fetchYahooFinanceChartResult(sym, '1y');
  if (!result) return null;

  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;
  if (!timestamps || !closes) return null;

  const history: DailyHistoryPoint[] = [];
  const isYield = isYieldSymbol(sym);

  for (let i = 0; i < timestamps.length; i++) {
    let close = closes[i];
    if (close == null) continue;

    if (isYield) {
      close = scaleYieldValue(close);
    }

    history.push({
      time: formatYahooTimestamp(timestamps[i]),
      value: roundToDecimals(close, isYield ? 3 : 2),
    });
  }

  return history;
}

export async function fetchYahooFinanceOhlcHistory(sym: string): Promise<DailyOhlcPoint[] | null> {
  const result = await fetchYahooFinanceChartResult(sym, '2y');
  if (!result) return null;

  const timestamps = result.timestamp;
  const quote = result.indicators?.quote?.[0];
  if (!timestamps || !quote) return null;

  const opens = quote.open;
  const highs = quote.high;
  const lows = quote.low;
  const closes = quote.close;
  if (!opens || !highs || !lows || !closes) return null;

  const history: DailyOhlcPoint[] = [];
  const isYield = isYieldSymbol(sym);
  const decimals = isYield ? 3 : 2;

  for (let i = 0; i < timestamps.length; i++) {
    let open = opens[i];
    let high = highs[i];
    let low = lows[i];
    let close = closes[i];
    if (open == null || high == null || low == null || close == null) continue;

    if (isYield) {
      open = scaleYieldValue(open);
      high = scaleYieldValue(high);
      low = scaleYieldValue(low);
      close = scaleYieldValue(close);
    }

    history.push({
      time: formatYahooTimestamp(timestamps[i]),
      open: roundToDecimals(open, decimals),
      high: roundToDecimals(high, decimals),
      low: roundToDecimals(low, decimals),
      close: roundToDecimals(close, decimals),
    });
  }

  return history;
}

function roundToDecimals(val: number, decimals: number): number {
  const p = Math.pow(10, decimals);
  return Math.round(val * p) / p;
}

function pctChange(newVal: number, oldVal: number, decimals = 2): number {
  if (!oldVal || oldVal === 0) return 0;
  return roundToDecimals(((newVal - oldVal) / Math.abs(oldVal)) * 100, decimals);
}

export interface YahooMarketMetrics {
  price: number;
  d1: number;
  w1: number;
  hi52: number;
  ytd: number;
  spark: number[];
  updatedAt?: number;
}

function computeMetricsFromChartResult(
  sym: string,
  result: NonNullable<Awaited<ReturnType<typeof fetchYahooFinanceChartResult>>>,
): YahooMarketMetrics | null {
  const timestamps = result.timestamp;
  const quote = result.indicators?.quote?.[0];
  if (!timestamps?.length || !quote) return null;

  const closes: number[] = [];
  const highs: number[] = [];
  const years: number[] = [];
  const isYield = isYieldSymbol(sym);

  for (let i = 0; i < timestamps.length; i++) {
    let close = quote.close?.[i];
    let high = quote.high?.[i];
    if (close == null || high == null) continue;

    if (isYield) {
      close = scaleYieldValue(close);
      high = scaleYieldValue(high);
    }

    closes.push(close);
    highs.push(high);
    years.push(new Date(timestamps[i] * 1000).getUTCFullYear());
  }

  if (closes.length < 2) return null;

  const price = closes[closes.length - 1];
  const hi52Price = Math.max(...highs);
  const thisYear = new Date().getUTCFullYear();
  const ytdStartIdx = years.findIndex((year) => year === thisYear);
  const ytdStart = ytdStartIdx >= 0 ? closes[ytdStartIdx] : null;

  let d1: number;
  let w1: number;
  let hi52: number;
  let ytd: number;

  if (isYield) {
    d1 = closes.length >= 2 ? roundToDecimals((closes[closes.length - 1] - closes[closes.length - 2]) * 100, 1) : 0;
    w1 = closes.length >= 6 ? roundToDecimals((closes[closes.length - 1] - closes[closes.length - 6]) * 100, 1) : 0;
    hi52 = roundToDecimals((price - hi52Price) * 100, 1);
    ytd = ytdStart != null ? roundToDecimals((price - ytdStart) * 100, 1) : 0;
  } else {
    d1 = closes.length >= 2 ? pctChange(closes[closes.length - 1], closes[closes.length - 2]) : 0;
    w1 = closes.length >= 6 ? pctChange(closes[closes.length - 1], closes[closes.length - 6]) : 0;
    hi52 = pctChange(price, hi52Price);
    ytd = ytdStart != null ? pctChange(price, ytdStart) : 0;
  }

  const spark: number[] = [];
  for (let i = Math.max(1, closes.length - 5); i < closes.length; i++) {
    spark.push(
      isYield
        ? roundToDecimals((closes[i] - closes[i - 1]) * 100, 2)
        : roundToDecimals(pctChange(closes[i], closes[i - 1]), 2),
    );
  }
  while (spark.length < 5) {
    spark.unshift(0);
  }

  const meta = result.meta as { regularMarketTime?: number } | undefined;
  const updatedAt = meta?.regularMarketTime ? meta.regularMarketTime * 1000 : undefined;

  return { price, d1, w1, hi52, ytd, spark, updatedAt };
}

export async function fetchYahooFinanceMarketMetrics(sym: string): Promise<YahooMarketMetrics | null> {
  const result = await fetchYahooFinanceChartResult(sym, '1y');
  if (!result) return null;
  return computeMetricsFromChartResult(sym, result);
}

