import { useEffect, useState } from 'react';
import { fetchYahooFinanceMarketMetrics, type YahooMarketMetrics } from '../../services/api';
import type { MarketState } from '../../types';
import { findMarketData } from './resolveMarketData';

export type WatchlistQuote = YahooMarketMetrics;

export function useWatchlistQuotes(symbols: string[], store: MarketState) {
  const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});

  const missingSymbols = symbols.filter((sym) => !findMarketData(store, sym));
  const missingKey = missingSymbols.join(',');

  useEffect(() => {
    if (missingSymbols.length === 0) return;

    let active = true;

    const fetchAll = async () => {
      for (const sym of missingSymbols) {
        if (!active) return;
        try {
          const res = await fetchYahooFinanceMarketMetrics(sym);
          if (!active || !res) continue;
          setQuotes((prev) => ({
            ...prev,
            [sym]: res,
          }));
        } catch (err) {
          console.warn(`Failed to fetch watchlist metrics for ${sym}:`, err);
        }
      }
    };

    void fetchAll();

    return () => {
      active = false;
    };
  }, [missingKey]);

  return quotes;
}
