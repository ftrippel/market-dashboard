function readPositiveIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  liveData: {
    /** Delay between Yahoo price fetches when symbols are visible (ms). */
    refreshIntervalMs: readPositiveIntEnv(import.meta.env.VITE_LIVE_DATA_REFRESH_MS, 1000),
    /** Retry delay when no symbols are visible in the viewport (ms). */
    idleRetryIntervalMs: readPositiveIntEnv(import.meta.env.VITE_LIVE_DATA_IDLE_RETRY_MS, 2000),
  },
  tradingView: {
    /** Enable hover preview chart (enabled by default). */
    enableHoverPreview: true,
    /** Enable display name / symbol underlining (disabled by default). */
    enableUnderline: false,
    /** Render modal charts with lightweight-charts + Yahoo Finance instead of TradingView embed. */
    useCustomCharts: false,
  },
} as const;

