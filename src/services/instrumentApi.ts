import type { InstrumentMetadata, InstrumentsData } from '../../shared/api/contracts';
import { isYahooFetchable, toYahooFinanceSymbol } from '../data/symbolMaps';
import { fetchBackendData } from './backendApi';

const MAX_SYMBOLS_PER_REQUEST = 25;

export type InstrumentMetadataBySymbol = Record<string, InstrumentMetadata>;

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function fetchInstrumentMetadata(
  dashboardSymbols: string[],
  signal?: AbortSignal,
): Promise<InstrumentMetadataBySymbol> {
  const symbolsByYahoo = new Map<string, string[]>();

  for (const dashboardSymbol of new Set(dashboardSymbols.map((symbol) => symbol.toUpperCase()))) {
    if (!isYahooFetchable(dashboardSymbol)) continue;
    const yahooSymbol = toYahooFinanceSymbol(dashboardSymbol).toUpperCase();
    const mapped = symbolsByYahoo.get(yahooSymbol) ?? [];
    mapped.push(dashboardSymbol);
    symbolsByYahoo.set(yahooSymbol, mapped);
  }

  const result: InstrumentMetadataBySymbol = {};
  const yahooSymbols = [...symbolsByYahoo.keys()];

  for (const batch of chunks(yahooSymbols, MAX_SYMBOLS_PER_REQUEST)) {
    const data = await fetchBackendData<InstrumentsData>('/instruments', {
      query: { symbols: batch.join(',') },
      signal,
    });

    for (const instrument of data.instruments) {
      const dashboardMatches = symbolsByYahoo.get(instrument.symbol.toUpperCase()) ?? [];
      for (const dashboardSymbol of dashboardMatches) {
        result[dashboardSymbol] = instrument;
      }
    }
  }

  return result;
}
