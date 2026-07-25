import type {
  InstrumentMetadata,
  YahooChartData,
  YahooChartInterval,
  YahooChartRange,
} from '../../shared/api/contracts';

export interface BackendBindings {
  ALLOWED_ORIGINS?: string;
}

export interface BackendVariables {
  requestId: string;
}

export interface BackendEnv {
  Bindings: BackendBindings;
  Variables: BackendVariables;
}

export interface InstrumentLookupResult {
  instruments: InstrumentMetadata[];
  missingSymbols: string[];
}

export interface BackendDependencies {
  lookupInstruments: (symbols: string[]) => Promise<InstrumentLookupResult>;
  lookupChart?: (
    symbol: string,
    interval: YahooChartInterval,
    range: YahooChartRange,
  ) => Promise<YahooChartData>;
  cache?: Cache | null;
  now?: () => number;
}
