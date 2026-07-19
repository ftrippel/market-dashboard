/// <reference types="vite/client" />

declare module '../../config/symbolMaps.json' {
  const value: {
    version: number;
    symbols: Record<
      string,
      {
        name?: string;
        displaySym?: string;
        sym?: string;
        tradingView?: string;
        flag?: string;
        isYield?: boolean;
        source?: 'yahoo' | 'fred';
        massive?: string;
      }
    >;
  };
  export default value;
}

interface ImportMetaEnv {
  readonly VITE_LIVE_DATA_REFRESH_MS?: string;
  readonly VITE_LIVE_DATA_IDLE_RETRY_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
