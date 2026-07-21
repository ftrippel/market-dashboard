import { loadWatchlistStorage, saveWatchlistStorage } from '../features/watchlist/watchlistStorage';
import type { Watchlist, WatchlistItem, WatchlistStorage } from '../features/watchlist/types';
import type { SparklineMode } from '../context/SettingsContext';
import type { Theme } from '../context/ThemeContext';
import { config } from '../config';
import { touchSettingsModified } from './settingsEvents';

export const SETTINGS_EXPORT_VERSION = 2;

export interface DashboardSettingsExport {
  version: typeof SETTINGS_EXPORT_VERSION;
  exportedAt: string;
  theme: Theme;
  enableHoverPreview: boolean;
  sparklineMode: SparklineMode;
  calculator: {
    equity: number;
    riskPct: number;
  };
  watchlists: WatchlistStorage;
}

const STORAGE_KEYS = {
  theme: 'market-dashboard-theme',
  enableHoverPreview: 'enableHoverPreview',
  sparklineMode: 'sparklineMode',
  calcEquity: 'agy_calc_equity',
  calcRiskPct: 'agy_calc_riskPct',
} as const;

/** Obsolete keys removed in settings export v2. */
const OBSOLETE_STORAGE_KEYS = ['hoverPreviewPlacement', 'useCustomCharts'] as const;

function readTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  return stored === 'light' ? 'light' : 'dark';
}

function readBoolean(key: string, fallback: boolean): boolean {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  return stored === 'true';
}

function readSparklineMode(): SparklineMode {
  const stored = localStorage.getItem(STORAGE_KEYS.sparklineMode);
  if (stored === 'none' || stored === 'line' || stored === 'bar' || stored === 'dot') return stored;
  return 'line';
}

function readCalculatorNumber(key: string, fallback: number): number {
  const stored = localStorage.getItem(key);
  const parsed = stored ? Number(stored) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function exportDashboardSettings(): DashboardSettingsExport {
  return {
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    theme: readTheme(),
    enableHoverPreview: readBoolean(
      STORAGE_KEYS.enableHoverPreview,
      config.tradingView.enableHoverPreview,
    ),
    sparklineMode: readSparklineMode(),
    calculator: {
      equity: readCalculatorNumber(STORAGE_KEYS.calcEquity, 10_000_000),
      riskPct: readCalculatorNumber(STORAGE_KEYS.calcRiskPct, 0.3),
    },
    watchlists: loadWatchlistStorage(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTheme(value: unknown): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

function parseSparklineMode(value: unknown): SparklineMode | null {
  return value === 'none' || value === 'line' || value === 'bar' || value === 'dot' ? value : null;
}

function parseWatchlistItem(value: unknown): WatchlistItem | null {
  if (!isRecord(value) || typeof value.sym !== 'string') return null;
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const comment = typeof value.comment === 'string' ? value.comment : undefined;
  return { sym: value.sym.toUpperCase(), tags, comment };
}

function parseWatchlistStorage(value: unknown): WatchlistStorage | null {
  if (!isRecord(value) || !Array.isArray(value.watchlists)) return null;

  const watchlists: Watchlist[] = [];
  for (const entry of value.watchlists) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      continue;
    }
    const items = Array.isArray(entry.items)
      ? entry.items
          .map(parseWatchlistItem)
          .filter((item): item is WatchlistItem => item !== null)
      : [];
    watchlists.push({ id: entry.id, name: entry.name, items });
  }

  if (watchlists.length === 0) return null;

  const activeId =
    typeof value.activeId === 'string' && watchlists.some((w) => w.id === value.activeId)
      ? value.activeId
      : watchlists[0].id;

  return { watchlists, activeId };
}

function parseSharedSettings(raw: Record<string, unknown>): Omit<DashboardSettingsExport, 'version' | 'exportedAt'> | null {
  const theme = parseTheme(raw.theme);
  const sparklineMode = parseSparklineMode(raw.sparklineMode);

  if (!theme || !sparklineMode) {
    return null;
  }

  if (typeof raw.enableHoverPreview !== 'boolean') {
    return null;
  }

  if (!isRecord(raw.calculator)) {
    return null;
  }

  const equity = Number(raw.calculator.equity);
  const riskPct = Number(raw.calculator.riskPct);
  if (!Number.isFinite(equity) || !Number.isFinite(riskPct)) {
    return null;
  }

  const watchlists = parseWatchlistStorage(raw.watchlists);
  if (!watchlists) {
    return null;
  }

  return {
    theme,
    enableHoverPreview: raw.enableHoverPreview,
    sparklineMode,
    calculator: { equity, riskPct },
    watchlists,
  };
}

export function parseDashboardSettingsExport(raw: unknown): DashboardSettingsExport {
  if (!isRecord(raw)) {
    throw new Error('Invalid settings file: expected a JSON object.');
  }

  const version = raw.version;
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported settings version: ${String(raw.version)}`);
  }

  const shared = parseSharedSettings(raw);
  if (!shared) {
    throw new Error('Invalid settings file: missing or invalid dashboard preferences.');
  }

  return {
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    ...shared,
  };
}

export function importDashboardSettings(data: DashboardSettingsExport): void {
  localStorage.setItem(STORAGE_KEYS.theme, data.theme);
  localStorage.setItem(STORAGE_KEYS.enableHoverPreview, String(data.enableHoverPreview));
  localStorage.setItem(STORAGE_KEYS.sparklineMode, data.sparklineMode);
  localStorage.setItem(STORAGE_KEYS.calcEquity, String(data.calculator.equity));
  localStorage.setItem(STORAGE_KEYS.calcRiskPct, String(data.calculator.riskPct));
  for (const key of OBSOLETE_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  saveWatchlistStorage(data.watchlists);
  touchSettingsModified();
}

export function downloadDashboardSettings(): void {
  const payload = exportDashboardSettings();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `market-dashboard-settings-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importDashboardSettingsFromFile(file: File): Promise<void> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file.');
  }
  const data = parseDashboardSettingsExport(parsed);
  importDashboardSettings(data);
}
