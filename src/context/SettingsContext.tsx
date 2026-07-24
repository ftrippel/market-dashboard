import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { config } from '../config';
import {
  isRemoteSettingsAppliedEvent,
  REMOTE_SETTINGS_APPLIED_EVENT,
  touchSettingsModified,
} from '../services/settingsEvents';
import {
  MAX_CHART_MAS,
  createDefaultMa,
  type ChartMaSettings,
  type MovingAverageConfig,
} from '../types/chartMaSettings';
import { readChartMaSettings } from '../services/settingsBackup';
import {
  DEFAULT_MARKET_COLUMNS,
  DEFAULT_MARKET_SORT_COLUMN,
  type MarketColumnKey,
  type SortableMarketColumnKey,
} from '../types/tableColumnSettings';

export type SparklineMode = 'none' | 'line' | 'bar' | 'dot';

interface SettingsContextValue {
  enableHoverPreview: boolean;
  setEnableHoverPreview: (val: boolean) => void;
  sparklineMode: SparklineMode;
  setSparklineMode: (mode: SparklineMode) => void;
  marketColumns: MarketColumnKey[];
  setMarketColumns: (columns: MarketColumnKey[]) => void;
  defaultMarketSortColumn: SortableMarketColumnKey;
  setDefaultMarketSortColumn: (column: SortableMarketColumnKey) => void;
  chartMaSettings: ChartMaSettings;
  setChartMaSettings: (settings: ChartMaSettings) => void;
  updateChartMa: (id: string, update: Partial<Omit<MovingAverageConfig, 'id'>>) => void;
  addChartMa: () => void;
  removeChartMa: (id: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readHoverPreview(): boolean {
  const stored = localStorage.getItem('enableHoverPreview');
  if (stored !== null) return stored === 'true';
  return config.tradingView.enableHoverPreview;
}

function readSparklineMode(): SparklineMode {
  const stored = localStorage.getItem('sparklineMode') as SparklineMode | null;
  if (stored === 'none' || stored === 'line' || stored === 'bar' || stored === 'dot') return stored;
  return 'line';
}

function readMarketColumns(): MarketColumnKey[] {
  const stored = localStorage.getItem('marketColumns');
  if (!stored) return [...DEFAULT_MARKET_COLUMNS];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [...DEFAULT_MARKET_COLUMNS];
    const valid = new Set<MarketColumnKey>([
      'price',
      'd1',
      'w1',
      'm1',
      'm3',
      'm6',
      'ytd',
      'hi52',
      'spark',
      'trend',
    ]);
    return parsed.filter((value): value is MarketColumnKey => valid.has(value));
  } catch {
    return [...DEFAULT_MARKET_COLUMNS];
  }
}

function readDefaultMarketSortColumn(): SortableMarketColumnKey {
  const stored = localStorage.getItem('defaultMarketSortColumn');
  const valid = new Set<SortableMarketColumnKey>([
    'price',
    'd1',
    'w1',
    'm1',
    'm3',
    'm6',
    'ytd',
    'hi52',
    'trend',
  ]);
  return valid.has(stored as SortableMarketColumnKey)
    ? (stored as SortableMarketColumnKey)
    : DEFAULT_MARKET_SORT_COLUMN;
}

function persistChartMaSettingsToStorage(settings: ChartMaSettings): void {
  localStorage.setItem('chartMaSettings', JSON.stringify(settings));
  touchSettingsModified('preferences');
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [enableHoverPreview, setEnableHoverPreviewState] = useState<boolean>(readHoverPreview);
  const [sparklineMode, setSparklineModeState] = useState<SparklineMode>(readSparklineMode);
  const [marketColumns, setMarketColumnsState] = useState<MarketColumnKey[]>(readMarketColumns);
  const [defaultMarketSortColumn, setDefaultMarketSortColumnState] =
    useState<SortableMarketColumnKey>(readDefaultMarketSortColumn);
  const [chartMaSettings, setChartMaSettingsState] = useState<ChartMaSettings>(readChartMaSettings);

  useEffect(() => {
    const handleRemoteApply = (event: Event) => {
      if (!isRemoteSettingsAppliedEvent(event) || event.detail.domain !== 'preferences') return;
      setEnableHoverPreviewState(readHoverPreview());
      setSparklineModeState(readSparklineMode());
      setMarketColumnsState(readMarketColumns());
      setDefaultMarketSortColumnState(readDefaultMarketSortColumn());
      setChartMaSettingsState(readChartMaSettings());
    };

    window.addEventListener(REMOTE_SETTINGS_APPLIED_EVENT, handleRemoteApply);
    return () => window.removeEventListener(REMOTE_SETTINGS_APPLIED_EVENT, handleRemoteApply);
  }, []);

  const setEnableHoverPreview = useCallback((val: boolean) => {
    setEnableHoverPreviewState(val);
    localStorage.setItem('enableHoverPreview', String(val));
    touchSettingsModified('preferences');
  }, []);

  const setSparklineMode = useCallback((mode: SparklineMode) => {
    setSparklineModeState(mode);
    localStorage.setItem('sparklineMode', mode);
    touchSettingsModified('preferences');
  }, []);

  const setMarketColumns = useCallback((columns: MarketColumnKey[]) => {
    setMarketColumnsState(columns);
    localStorage.setItem('marketColumns', JSON.stringify(columns));
    touchSettingsModified('preferences');
  }, []);

  const setDefaultMarketSortColumn = useCallback((column: SortableMarketColumnKey) => {
    setDefaultMarketSortColumnState(column);
    localStorage.setItem('defaultMarketSortColumn', column);
    touchSettingsModified('preferences');
  }, []);

  const setChartMaSettings = useCallback((settings: ChartMaSettings) => {
    const next = settings.slice(0, MAX_CHART_MAS);
    setChartMaSettingsState(next);
    persistChartMaSettingsToStorage(next);
  }, []);

  const updateChartMa = useCallback((id: string, update: Partial<Omit<MovingAverageConfig, 'id'>>) => {
    setChartMaSettingsState((current) => {
      const next = current.map((ma) => (ma.id === id ? { ...ma, ...update } : ma));
      persistChartMaSettingsToStorage(next);
      return next;
    });
  }, []);

  const addChartMa = useCallback(() => {
    setChartMaSettingsState((current) => {
      if (current.length >= MAX_CHART_MAS) return current;
      const next = [...current, createDefaultMa()];
      persistChartMaSettingsToStorage(next);
      return next;
    });
  }, []);

  const removeChartMa = useCallback((id: string) => {
    setChartMaSettingsState((current) => {
      const next = current.filter((ma) => ma.id !== id);
      persistChartMaSettingsToStorage(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        enableHoverPreview,
        setEnableHoverPreview,
        sparklineMode,
        setSparklineMode,
        marketColumns,
        setMarketColumns,
        defaultMarketSortColumn,
        setDefaultMarketSortColumn,
        chartMaSettings,
        setChartMaSettings,
        updateChartMa,
        addChartMa,
        removeChartMa,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}
