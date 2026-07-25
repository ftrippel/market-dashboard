import createYahooFinance from 'yahoo-finance2/createYahooFinance';
import quote from 'yahoo-finance2/modules/quote';
import type { InstrumentMetadata } from '../../../shared/api/contracts';
import type { InstrumentLookupResult } from '../env';

const YahooFinance = createYahooFinance({ modules: { quote } });
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function lookupYahooInstruments(
  symbols: string[],
): Promise<InstrumentLookupResult> {
  const quotes = await yahooFinance.quote(symbols);
  const instruments: InstrumentMetadata[] = quotes.map((result) => ({
    symbol: result.symbol,
    displayName: result.shortName?.trim() || result.longName?.trim() || result.symbol,
    ...(result.shortName?.trim() ? { shortName: result.shortName.trim() } : {}),
    ...(result.longName?.trim() ? { longName: result.longName.trim() } : {}),
    type: result.quoteType,
    exchange: result.exchange,
  }));
  const found = new Set(instruments.map(({ symbol }) => symbol.toUpperCase()));

  return {
    instruments,
    missingSymbols: symbols.filter((symbol) => !found.has(symbol)),
  };
}
