import { useEffect, useMemo, useRef, useState } from 'react';
import { getDisplayName } from '../../data/symbolMaps';
import { isBackendApiConfigured } from '../../services/backendApi';
import {
  fetchInstrumentMetadata,
  type InstrumentMetadataBySymbol,
} from '../../services/instrumentApi';
import type { MarketState } from '../../types';
import { findMarketData } from './resolveMarketData';

export function useWatchlistInstrumentInfo(symbols: string[], store: MarketState) {
  const unresolvedKey = useMemo(
    () =>
      symbols
        .filter((symbol) => {
          const existing = findMarketData(store, symbol);
          return getDisplayName(symbol, existing?.name) === symbol;
        })
        .join(','),
    [symbols, store],
  );
  const [instrumentInfo, setInstrumentInfo] = useState<InstrumentMetadataBySymbol>({});
  const requestedSymbolsRef = useRef(new Set<string>());
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isBackendApiConfigured() || !unresolvedKey) return;

    const pendingSymbols = unresolvedKey
      .split(',')
      .filter((symbol) => !requestedSymbolsRef.current.has(symbol));
    if (pendingSymbols.length === 0) return;

    for (const symbol of pendingSymbols) {
      requestedSymbolsRef.current.add(symbol);
    }

    // Let an in-flight batch finish when watchlists or market data settle. Aborting
    // here caused Chrome to cancel valid Worker requests during normal rerenders.
    void fetchInstrumentMetadata(pendingSymbols)
      .then((result) => {
        if (!mountedRef.current) return;
        setInstrumentInfo((previous) => ({ ...previous, ...result }));
      })
      .catch((error) => {
        for (const symbol of pendingSymbols) {
          requestedSymbolsRef.current.delete(symbol);
        }
        if (!mountedRef.current) return;
        console.warn('Failed to fetch watchlist instrument metadata:', error);
      });
  }, [unresolvedKey]);

  return instrumentInfo;
}
