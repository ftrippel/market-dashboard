import type { InstrumentMetadata } from '../../shared/api/contracts';

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
  cache?: Cache | null;
  now?: () => number;
}
