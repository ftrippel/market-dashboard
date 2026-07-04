import type { MarketData, MarketState, Holding } from '../types';

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

const DASHBOARD_TO_YFINANCE: Record<string, string> = {
  // Futures
  'ES1!': 'ES=F',
  'NQ1!': 'NQ=F',
  'RTY1!': 'RTY=F',
  'YM1!': 'YM=F',
  // Metals
  'GC1!': 'GC=F',
  'SI1!': 'SI=F',
  'HG1!': 'HG=F',
  'PL1!': 'PL=F',
  'PA1!': 'PA=F',
  // Commodities
  'CL1!': 'CL=F',
  'NG1!': 'NG=F',
  // Yields
  'US10Y': '^TNX',
  'US30Y': '^TYX',
  // VIX
  'CBOE:VIX': '^VIX',
  // Crypto
  'BTC': 'BTC-USD',
  'ETH': 'ETH-USD',
  'SOL': 'SOL-USD',
  'XRP': 'XRP-USD',
};

function getYahooFinanceSymbol(sym: string): string {
  return DASHBOARD_TO_YFINANCE[sym] ?? sym;
}

export async function fetchYahooFinancePrice(sym: string): Promise<{ price: number; d1: number } | null> {
  if (sym === 'US2Y') return null; // Skip FRED-only yield

  const yfSym = getYahooFinanceSymbol(sym);
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

  const isYield = sym === 'US10Y' || sym === 'US30Y';
  
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
  };
}

export interface DailyHistoryPoint {
  time: string;
  value: number;
}

export async function fetchYahooFinanceDailyHistory(sym: string): Promise<DailyHistoryPoint[] | null> {
  if (sym === 'US2Y') return null; // Skip FRED-only yield

  const yfSym = getYahooFinanceSymbol(sym);
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSym)}?interval=1d&range=1y`;
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;

  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch daily history for ${sym}: HTTP ${res.status}`);
  }
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;
  if (!timestamps || !closes) return null;

  const history: DailyHistoryPoint[] = [];
  const isYield = sym === 'US10Y' || sym === 'US30Y';

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    let close = closes[i];
    if (close == null) continue;

    if (isYield && close > 10) {
      close = close / 10;
    }

    const d = new Date(timestamp * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const timeStr = `${yyyy}-${mm}-${dd}`;

    history.push({
      time: timeStr,
      value: roundToDecimals(close, isYield ? 3 : 2),
    });
  }

  return history;
}

function roundToDecimals(val: number, decimals: number): number {
  const p = Math.pow(10, decimals);
  return Math.round(val * p) / p;
}

