import type {
  YahooQuoteSnapshot,
  YahooQuotesData,
} from '../../shared/api/contracts';
import { isYahooFetchable, toYahooFinanceSymbol } from '../data/symbolMaps';
import {
  fetchBackendData,
  isBackendApiConfigured,
} from './backendApi';

const MAX_SYMBOLS_PER_REQUEST = 25;

export type YahooQuoteSnapshotsBySymbol = Record<string, YahooQuoteSnapshot>;

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function fetchYahooQuoteSnapshots(
  dashboardSymbols: string[],
  signal?: AbortSignal,
): Promise<YahooQuoteSnapshotsBySymbol | null> {
  if (!isBackendApiConfigured()) return null;

  const symbolsByYahoo = new Map<string, string[]>();
  for (const dashboardSymbol of new Set(dashboardSymbols.map((symbol) => symbol.toUpperCase()))) {
    if (!isYahooFetchable(dashboardSymbol)) continue;
    const yahooSymbol = toYahooFinanceSymbol(dashboardSymbol).toUpperCase();
    const mapped = symbolsByYahoo.get(yahooSymbol) ?? [];
    mapped.push(dashboardSymbol);
    symbolsByYahoo.set(yahooSymbol, mapped);
  }

  const result: YahooQuoteSnapshotsBySymbol = {};
  for (const batch of chunks([...symbolsByYahoo.keys()], MAX_SYMBOLS_PER_REQUEST)) {
    const data = await fetchBackendData<YahooQuotesData>('/quotes', {
      query: { symbols: batch.join(',') },
      signal,
    });

    for (const quote of data.quotes) {
      const dashboardMatches = symbolsByYahoo.get(quote.symbol.toUpperCase()) ?? [];
      for (const dashboardSymbol of dashboardMatches) {
        result[dashboardSymbol] = quote;
      }
    }
  }

  return result;
}
