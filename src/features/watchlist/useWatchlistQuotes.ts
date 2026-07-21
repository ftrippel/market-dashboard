import { useEffect, useState } from 'react';
import {
  fetchYahooFinanceMarketMetrics,
  fetchYahooFinancePrice,
  type YahooMarketMetrics,
} from '../../services/api';
import { config } from '../../config';
import { useMarketStore } from '../../store/marketStore';
import type { MarketState } from '../../types';
import { findMarketData } from './resolveMarketData';

export type WatchlistQuote = YahooMarketMetrics;

export function useWatchlistQuotes(
  symbols: string[],
  store: MarketState,
  liveEnabled = false,
) {
  const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});
  const updatePrice = useMarketStore((state) => state.updatePrice);

  const missingSymbols = symbols.filter((sym) => !findMarketData(store, sym));
  const missingKey = missingSymbols.join(',');
  const symbolsKey = symbols.join(',');

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

  useEffect(() => {
    if (!liveEnabled || symbols.length === 0) return;

    let active = true;
    let timeoutId: number | undefined;
    const updatedSymbols = new Set<string>();

    const updateNext = async () => {
      if (!active) return;

      let nextSym = symbols.find((sym) => !updatedSymbols.has(sym));
      if (!nextSym) {
        updatedSymbols.clear();
        nextSym = symbols[0];
      }

      if (nextSym) {
        updatedSymbols.add(nextSym);
        try {
          const res = await fetchYahooFinancePrice(nextSym);
          if (res && active) {
            const inStore = findMarketData(useMarketStore.getState(), nextSym);
            if (inStore) {
              updatePrice(nextSym, res.price, res.d1, res.updatedAt);
            } else {
              setQuotes((prev) => ({
                ...prev,
                [nextSym]: {
                  ...prev[nextSym],
                  price: res.price,
                  d1: res.d1,
                  updatedAt: res.updatedAt,
                  w1: prev[nextSym]?.w1 ?? 0,
                  hi52: prev[nextSym]?.hi52 ?? 0,
                  ytd: prev[nextSym]?.ytd ?? 0,
                  spark: prev[nextSym]?.spark ?? [],
                },
              }));
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch live watchlist price for ${nextSym}:`, err);
        }
      }

      timeoutId = window.setTimeout(updateNext, config.liveData.refreshIntervalMs);
    };

    updateNext();

    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [liveEnabled, symbolsKey, updatePrice]);

  return quotes;
}
