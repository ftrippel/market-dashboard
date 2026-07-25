import createYahooFinance from 'yahoo-finance2/createYahooFinance';
import chart from 'yahoo-finance2/modules/chart';
import type {
  YahooChartData,
  YahooChartInterval,
  YahooChartQuote,
  YahooChartRange,
} from '../../../shared/api/contracts';

const YahooFinance = createYahooFinance({ modules: { chart } });
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const RANGE_MS: Record<YahooChartRange, number> = {
  '1d': 2 * 24 * 60 * 60 * 1000,
  '1y': 366 * 24 * 60 * 60 * 1000,
  '2y': 2 * 366 * 24 * 60 * 60 * 1000,
};

function nullableNumberArray(value: unknown): Array<number | null> {
  if (!Array.isArray(value)) return [];
  return value.map((item) =>
    typeof item === 'number' && Number.isFinite(item) ? item : null,
  );
}

function normalizeQuote(value: unknown): YahooChartQuote {
  const quote = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  return {
    open: nullableNumberArray(quote.open),
    high: nullableNumberArray(quote.high),
    low: nullableNumberArray(quote.low),
    close: nullableNumberArray(quote.close),
    volume: nullableNumberArray(quote.volume),
  };
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function epochSeconds(value: unknown): number | undefined {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  return optionalNumber(value);
}

export async function fetchYahooChart(
  symbol: string,
  interval: YahooChartInterval,
  range: YahooChartRange,
): Promise<YahooChartData> {
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - RANGE_MS[range]);
  const result = await yahooFinance.chart(symbol, {
    period1,
    period2,
    interval,
    includePrePost: false,
    return: 'object',
  });

  const timestamp =
    Array.isArray(result.timestamp) &&
    result.timestamp.every(
      (item): item is number => typeof item === 'number' && Number.isFinite(item),
    )
      ? result.timestamp
      : [];
  const quote = normalizeQuote(result.indicators?.quote?.[0]);
  if (timestamp.length === 0 || quote.close.length === 0) {
    throw new Error('Yahoo returned an incomplete chart response.');
  }

  const meta = result.meta;
  const regularMarketPrice = optionalNumber(meta.regularMarketPrice);
  const previousClose = optionalNumber(meta.previousClose);
  const chartPreviousClose = optionalNumber(meta.chartPreviousClose);
  const regularMarketTime = epochSeconds(meta.regularMarketTime);
  return {
    timestamp,
    indicators: { quote: [quote] },
    meta: {
      ...(typeof meta.symbol === 'string' ? { symbol: meta.symbol } : {}),
      ...(regularMarketPrice === undefined ? {} : { regularMarketPrice }),
      ...(previousClose === undefined ? {} : { previousClose }),
      ...(chartPreviousClose === undefined ? {} : { chartPreviousClose }),
      ...(regularMarketTime === undefined ? {} : { regularMarketTime }),
    },
  };
}
