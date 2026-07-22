import { createDefaultWatchlistStorage, loadWatchlistStorage, persistWatchlistStorage, replaceWatchlistStorage } from '../features/watchlist/watchlistStorage';
import type { Watchlist, WatchlistItem, WatchlistStorage } from '../features/watchlist/types';
import type { SparklineMode } from '../context/SettingsContext';
import type { Theme } from '../context/ThemeContext';
import { config } from '../config';
import {
  DEFAULT_CHART_MA_SETTINGS,
  MAX_CHART_MAS,
  clampMaPeriod,
  createMaId,
  type ChartMaSettings,
  type MaType,
  type MovingAverageConfig,
} from '../types/chartMaSettings';
import {
  REMOTE_SETTINGS_APPLIED_EVENT,
  SETTINGS_DOMAINS,
  setSettingsLastModified,
  touchAllSettingsModified,
  touchSettingsModified,
  type SettingsDomain,
} from './settingsEvents';

export const SETTINGS_EXPORT_VERSION = 2;

export interface PreferencesSettings {
  theme: Theme;
  enableHoverPreview: boolean;
  sparklineMode: SparklineMode;
  chartMaSettings: ChartMaSettings;
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
  chartMaSettings: ChartMaSettings;
  calculator: CalculatorSettings;
  watchlists: WatchlistStorage;
}

const STORAGE_KEYS = {
  theme: 'market-dashboard-theme',
  enableHoverPreview: 'enableHoverPreview',
  sparklineMode: 'sparklineMode',
  chartMaSettings: 'chartMaSettings',
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

function parseMaType(value: unknown): MaType {
  return value === 'ema' ? 'ema' : 'sma';
}

function parseMaColor(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
}

function parseMovingAverageConfig(value: unknown, fallback: MovingAverageConfig): MovingAverageConfig | null {
  if (!isRecord(value)) return null;

  const period = clampMaPeriod(Number(value.period));
  const type = parseMaType(value.type);
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled;
  const color = parseMaColor(
    value.color ?? value.colorDark,
    fallback.color,
  );
  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : createMaId();

  return { id, type, period, color, enabled };
}

function migrateLegacyChartMaObject(value: Record<string, unknown>): ChartMaSettings {
  const legacyEntries: { key: string; type: MaType; fallback: MovingAverageConfig }[] = [
    { key: 'ema', type: 'ema', fallback: DEFAULT_CHART_MA_SETTINGS[0] },
    { key: 'sma50', type: 'sma', fallback: DEFAULT_CHART_MA_SETTINGS[1] },
    { key: 'sma200', type: 'sma', fallback: DEFAULT_CHART_MA_SETTINGS[2] },
  ];

  const migrated = legacyEntries
    .map(({ key, type, fallback }) => {
      const entry = value[key];
      if (!isRecord(entry)) return null;

      return parseMovingAverageConfig(
        {
          id: `legacy-${key}`,
          type,
          period: entry.period,
          color: entry.color ?? entry.colorDark,
          enabled: entry.enabled,
        },
        fallback,
      );
    })
    .filter((entry): entry is MovingAverageConfig => entry !== null);

  return migrated.length > 0 ? migrated : DEFAULT_CHART_MA_SETTINGS;
}

export function parseChartMaSettings(value: unknown): ChartMaSettings {
  if (Array.isArray(value)) {
    const parsed = value
      .map((entry, index) =>
        parseMovingAverageConfig(entry, DEFAULT_CHART_MA_SETTINGS[index] ?? DEFAULT_CHART_MA_SETTINGS[0]),
      )
      .filter((entry): entry is MovingAverageConfig => entry !== null)
      .slice(0, MAX_CHART_MAS);

    return parsed.length > 0 ? parsed : DEFAULT_CHART_MA_SETTINGS;
  }

  if (isRecord(value) && ('ema' in value || 'sma50' in value || 'sma200' in value)) {
    return migrateLegacyChartMaObject(value);
  }

  return DEFAULT_CHART_MA_SETTINGS;
}

export function readChartMaSettings(): ChartMaSettings {
  const stored = localStorage.getItem(STORAGE_KEYS.chartMaSettings);
  if (!stored) return DEFAULT_CHART_MA_SETTINGS;

  try {
    return parseChartMaSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_CHART_MA_SETTINGS;
  }
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
    chartMaSettings: readChartMaSettings(),
  };
}

export function exportCalculatorSettings(): CalculatorSettings {
  return {
    equity: readCalculatorNumber(STORAGE_KEYS.calcEquity, 10_000_000),
    riskPct: readCalculatorNumber(STORAGE_KEYS.calcRiskPct, 0.3),
  };
}

export function getDefaultPreferencesSettings(): PreferencesSettings {
  return {
    theme: 'dark',
    enableHoverPreview: config.tradingView.enableHoverPreview,
    sparklineMode: 'line',
    chartMaSettings: DEFAULT_CHART_MA_SETTINGS,
  };
}

export function getDefaultCalculatorSettings(): CalculatorSettings {
  return {
    equity: 10_000_000,
    riskPct: 0.3,
  };
}

export function exportWatchlistsSettings(): WatchlistStorage {
  return loadWatchlistStorage();
}

export interface WatchlistsSyncPayload {
  watchlists: Watchlist[];
}

export function exportWatchlistsForSync(): WatchlistsSyncPayload {
  return { watchlists: loadWatchlistStorage().watchlists };
}

export function watchlistsContentEqual(a: Watchlist[], b: Watchlist[]): boolean {
  const normalize = (watchlists: Watchlist[]) =>
    watchlists.map((watchlist) => ({
      id: watchlist.id,
      name: watchlist.name,
      comment: watchlist.comment ?? '',
      items: watchlist.items.map((item) => ({
        sym: item.sym,
        tags: item.tags,
        comment: item.comment ?? '',
      })),
    }));
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
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
  localStorage.setItem(STORAGE_KEYS.chartMaSettings, JSON.stringify(data.chartMaSettings));
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

export function applyWatchlistsFromSync(
  data: WatchlistsSyncPayload,
  options: { source: 'local' | 'remote'; updatedAt?: string },
): void {
  const current = loadWatchlistStorage();
  const watchlists =
    data.watchlists.length > 0 ? data.watchlists : createDefaultWatchlistStorage().watchlists;
  const storage: WatchlistStorage = {
    watchlists,
    activeId: watchlists.some((watchlist) => watchlist.id === current.activeId)
      ? current.activeId
      : watchlists[0].id,
  };

  if (options.source === 'remote') {
    replaceWatchlistStorage(storage);
    setSettingsLastModified('watchlists', options.updatedAt ?? new Date().toISOString());
    dispatchRemoteApplied('watchlists');
    return;
  }

  persistWatchlistStorage(storage);
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
    const comment = typeof entry.comment === 'string' ? entry.comment : '';
    watchlists.push({ id: entry.id, name: entry.name, comment, items });
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
    chartMaSettings: parseChartMaSettings(raw.chartMaSettings),
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
      chartMaSettings: data.chartMaSettings,
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

export function resetWatchlistsToDefault(): void {
  replaceWatchlistStorage(createDefaultWatchlistStorage());
  touchSettingsModified('watchlists');
  dispatchRemoteApplied('watchlists');
}

export function resetAllSettingsToDefaults(): void {
  applyPreferencesSettings(getDefaultPreferencesSettings(), { source: 'local' });
  applyCalculatorSettings(getDefaultCalculatorSettings(), { source: 'local' });
  replaceWatchlistStorage(createDefaultWatchlistStorage());
  for (const key of OBSOLETE_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  touchAllSettingsModified();
  for (const domain of SETTINGS_DOMAINS) {
    dispatchRemoteApplied(domain);
  }
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
    chartMaSettings: parseChartMaSettings(value.chartMaSettings),
  };
}

export function parseCalculatorSettings(value: unknown): CalculatorSettings | null {
  if (!isRecord(value)) return null;
  const equity = Number(value.equity);
  const riskPct = Number(value.riskPct);
  if (!Number.isFinite(equity) || !Number.isFinite(riskPct)) return null;
  return { equity, riskPct };
}

export function parseWatchlistsSyncPayload(value: unknown): WatchlistsSyncPayload | null {
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
    const comment = typeof entry.comment === 'string' ? entry.comment : '';
    watchlists.push({ id: entry.id, name: entry.name, comment, items });
  }

  if (watchlists.length === 0) return { watchlists: [] };
  return { watchlists };
}

export function parseWatchlistsSettings(value: unknown): WatchlistStorage | null {
  return parseWatchlistStorage(value);
}
