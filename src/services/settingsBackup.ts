import { loadWatchlistStorage, persistWatchlistStorage } from '../features/watchlist/watchlistStorage';
import type { Watchlist, WatchlistItem, WatchlistStorage } from '../features/watchlist/types';
import type { SparklineMode } from '../context/SettingsContext';
import type { Theme } from '../context/ThemeContext';
import { config } from '../config';
import {
  REMOTE_SETTINGS_APPLIED_EVENT,
  setSettingsLastModified,
  touchAllSettingsModified,
  type SettingsDomain,
} from './settingsEvents';

export const SETTINGS_EXPORT_VERSION = 2;

export interface PreferencesSettings {
  theme: Theme;
  enableHoverPreview: boolean;
  sparklineMode: SparklineMode;
}

export interface CalculatorSettings {
  equity: number;
  riskPct: number;
}

export interface DashboardSettingsExport {
  version: typeof SETTINGS_EXPORT_VERSION;
  exportedAt: string;
  theme: Theme;
  enableHoverPreview: boolean;
  sparklineMode: SparklineMode;
  calculator: CalculatorSettings;
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

export function exportPreferencesSettings(): PreferencesSettings {
  return {
    theme: readTheme(),
    enableHoverPreview: readBoolean(
      STORAGE_KEYS.enableHoverPreview,
      config.tradingView.enableHoverPreview,
    ),
    sparklineMode: readSparklineMode(),
  };
}

export function exportCalculatorSettings(): CalculatorSettings {
  return {
    equity: readCalculatorNumber(STORAGE_KEYS.calcEquity, 10_000_000),
    riskPct: readCalculatorNumber(STORAGE_KEYS.calcRiskPct, 0.3),
  };
}

export function exportWatchlistsSettings(): WatchlistStorage {
  return loadWatchlistStorage();
}

export function countWatchlistItems(storage: WatchlistStorage): number {
  return storage.watchlists.reduce((sum, watchlist) => sum + watchlist.items.length, 0);
}

export function watchlistsContentEqual(a: WatchlistStorage, b: WatchlistStorage): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function exportDashboardSettings(): DashboardSettingsExport {
  return {
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    ...exportPreferencesSettings(),
    calculator: exportCalculatorSettings(),
    watchlists: exportWatchlistsSettings(),
  };
}

function dispatchRemoteApplied(domain: SettingsDomain): void {
  window.dispatchEvent(new CustomEvent(REMOTE_SETTINGS_APPLIED_EVENT, { detail: { domain } }));
}

export function applyPreferencesSettings(
  data: PreferencesSettings,
  options: { source: 'local' | 'remote'; updatedAt?: string },
): void {
  localStorage.setItem(STORAGE_KEYS.theme, data.theme);
  localStorage.setItem(STORAGE_KEYS.enableHoverPreview, String(data.enableHoverPreview));
  localStorage.setItem(STORAGE_KEYS.sparklineMode, data.sparklineMode);
  document.documentElement.setAttribute('data-theme', data.theme);

  if (options.source === 'remote') {
    setSettingsLastModified('preferences', options.updatedAt ?? new Date().toISOString());
    dispatchRemoteApplied('preferences');
  }
}

export function applyCalculatorSettings(
  data: CalculatorSettings,
  options: { source: 'local' | 'remote'; updatedAt?: string },
): void {
  localStorage.setItem(STORAGE_KEYS.calcEquity, String(data.equity));
  localStorage.setItem(STORAGE_KEYS.calcRiskPct, String(data.riskPct));

  if (options.source === 'remote') {
    setSettingsLastModified('calculator', options.updatedAt ?? new Date().toISOString());
    dispatchRemoteApplied('calculator');
  }
}

export function applyWatchlistsSettings(
  data: WatchlistStorage,
  options: { source: 'local' | 'remote'; updatedAt?: string },
): void {
  persistWatchlistStorage(data);

  if (options.source === 'remote') {
    setSettingsLastModified('watchlists', options.updatedAt ?? new Date().toISOString());
    dispatchRemoteApplied('watchlists');
  }
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
  applyPreferencesSettings(
    {
      theme: data.theme,
      enableHoverPreview: data.enableHoverPreview,
      sparklineMode: data.sparklineMode,
    },
    { source: 'local' },
  );
  applyCalculatorSettings(data.calculator, { source: 'local' });
  applyWatchlistsSettings(data.watchlists, { source: 'local' });
  for (const key of OBSOLETE_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  touchAllSettingsModified();
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

export function parsePreferencesSettings(value: unknown): PreferencesSettings | null {
  if (!isRecord(value)) return null;
  const theme = parseTheme(value.theme);
  const sparklineMode = parseSparklineMode(value.sparklineMode);
  if (!theme || !sparklineMode || typeof value.enableHoverPreview !== 'boolean') return null;
  return {
    theme,
    enableHoverPreview: value.enableHoverPreview,
    sparklineMode,
  };
}

export function parseCalculatorSettings(value: unknown): CalculatorSettings | null {
  if (!isRecord(value)) return null;
  const equity = Number(value.equity);
  const riskPct = Number(value.riskPct);
  if (!Number.isFinite(equity) || !Number.isFinite(riskPct)) return null;
  return { equity, riskPct };
}

export function parseWatchlistsSettings(value: unknown): WatchlistStorage | null {
  return parseWatchlistStorage(value);
}
