import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    if (!isBackendApiConfigured() || !unresolvedKey) return;

    const controller = new AbortController();
    const unresolvedSymbols = unresolvedKey.split(',');

    void fetchInstrumentMetadata(unresolvedSymbols, controller.signal)
      .then((result) => {
        setInstrumentInfo((previous) => ({ ...previous, ...result }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn('Failed to fetch watchlist instrument metadata:', error);
      });

    return () => controller.abort();
  }, [unresolvedKey]);

  return instrumentInfo;
}
