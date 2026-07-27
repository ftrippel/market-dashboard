import createYahooFinance from 'yahoo-finance2/createYahooFinance';
import quote from 'yahoo-finance2/modules/quote';
import quoteSummary from 'yahoo-finance2/modules/quoteSummary';
import type {
  InstrumentHolding,
  InstrumentMetadata,
  YahooQuoteSnapshot,
} from '../../../shared/api/contracts';
import type { InstrumentLookupResult, QuoteLookupResult } from '../env';

const YahooFinance = createYahooFinance({ modules: { quote, quoteSummary } });
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function epochSeconds(value: unknown): number | undefined {
  return value instanceof Date
    ? Math.floor(value.getTime() / 1000)
    : finiteNumber(value);
}

function percentageWeight(value: number): number {
  const percentage = value > 0 && value <= 1 ? value * 100 : value;
  return Math.round(percentage * 100) / 100;
}

async function lookupYahooEtfHoldings(symbol: string): Promise<InstrumentHolding[]> {
  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ['topHoldings'],
    });

    return (result.topHoldings?.holdings ?? []).slice(0, 10).map((holding) => ({
      s: holding.symbol,
      n: holding.holdingName?.trim() || holding.symbol,
      w: percentageWeight(holding.holdingPercent),
    }));
  } catch (error) {
    console.warn(`Failed to fetch ETF holdings for ${symbol}:`, error);
    return [];
  }
}

export async function lookupYahooInstruments(
  symbols: string[],
): Promise<InstrumentLookupResult> {
  const quotes = await yahooFinance.quote(symbols);
  const instruments: InstrumentMetadata[] = await Promise.all(
    quotes.map(async (result) => {
      const holdings =
        result.quoteType === 'ETF'
          ? await lookupYahooEtfHoldings(result.symbol)
          : [];

      return {
        symbol: result.symbol,
        displayName: result.shortName?.trim() || result.longName?.trim() || result.symbol,
        ...(result.shortName?.trim() ? { shortName: result.shortName.trim() } : {}),
        ...(result.longName?.trim() ? { longName: result.longName.trim() } : {}),
        type: result.quoteType,
        exchange: result.exchange,
        ...(holdings.length > 0 ? { holdings } : {}),
      };
    }),
  );
  const found = new Set(instruments.map(({ symbol }) => symbol.toUpperCase()));

  return {
    instruments,
    missingSymbols: symbols.filter((symbol) => !found.has(symbol)),
  };
}

export async function lookupYahooQuotes(
  symbols: string[],
): Promise<QuoteLookupResult> {
  const results = await yahooFinance.quote(symbols);
  const quotes: YahooQuoteSnapshot[] = [];

  for (const result of results) {
    const regularMarketPrice = finiteNumber(result.regularMarketPrice);
    const previousClose = finiteNumber(result.regularMarketPreviousClose);
    if (regularMarketPrice === undefined || previousClose === undefined || previousClose === 0) {
      continue;
    }

    const regularMarketTime = epochSeconds(result.regularMarketTime);
    quotes.push({
      symbol: result.symbol,
      regularMarketPrice,
      previousClose,
      ...(regularMarketTime === undefined ? {} : { regularMarketTime }),
    });
  }

  const found = new Set(quotes.map(({ symbol }) => symbol.toUpperCase()));
  return {
    quotes,
    missingSymbols: symbols.filter((symbol) => !found.has(symbol)),
  };
}
