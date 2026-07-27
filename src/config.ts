function readPositiveIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return fallback;
}

const backendApiUrl =
  import.meta.env.PROD && import.meta.env.BASE_URL === '/'
    ? window.location.origin
    : (import.meta.env.VITE_BACKEND_API_URL ?? '').replace(/\/+$/, '');

export const config = {
  backend: {
    /**
     * Base URL of the versioned market-dashboard backend (without /api/v1).
     * Root production builds run on the full-stack Worker and use its origin.
     */
    apiUrl: backendApiUrl,
  },
  liveData: {
    /** Delay between Yahoo price fetches when symbols are visible (ms). */
    refreshIntervalMs: readPositiveIntEnv(import.meta.env.VITE_LIVE_DATA_REFRESH_MS, 1000),
    /** Retry delay when no symbols are visible in the viewport (ms). */
    idleRetryIntervalMs: readPositiveIntEnv(import.meta.env.VITE_LIVE_DATA_IDLE_RETRY_MS, 2000),
  },
  sync: {
    /**
     * Check the deployed build marker before syncing settings.
     * Set VITE_ENABLE_BUILD_VERSION_CHECK=false at build time to disable it.
     */
    enableBuildVersionCheck: readBooleanEnv(
      import.meta.env.VITE_ENABLE_BUILD_VERSION_CHECK,
      true,
    ),
  },
  tradingView: {
    /** Enable hover preview chart (disabled by default). */
    enableHoverPreview: false,
    /** Enable display name / symbol underlining (disabled by default). */
    enableUnderline: false,
  },
} as const;
