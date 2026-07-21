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
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_BUILD_NUMBER?: string;
  readonly VITE_BUILD_TIME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
