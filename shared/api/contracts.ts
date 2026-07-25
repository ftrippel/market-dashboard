export interface ApiMeta {
  requestId: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ApiMeta;
}

export interface HealthData {
  status: 'ok';
  service: 'market-dashboard-api';
}

export interface InstrumentHolding {
  s: string;
  n: string;
  w: number;
}

export interface InstrumentMetadata {
  symbol: string;
  displayName: string;
  shortName?: string;
  longName?: string;
  type: string;
  exchange: string;
  holdings?: InstrumentHolding[];
}

export interface InstrumentsData {
  instruments: InstrumentMetadata[];
  missingSymbols: string[];
}
