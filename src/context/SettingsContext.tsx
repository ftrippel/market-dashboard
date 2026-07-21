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

export type SparklineMode = 'none' | 'line' | 'bar' | 'dot';

interface SettingsContextValue {
  enableHoverPreview: boolean;
  setEnableHoverPreview: (val: boolean) => void;
  sparklineMode: SparklineMode;
  setSparklineMode: (mode: SparklineMode) => void;
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

function persistChartMaSettingsToStorage(settings: ChartMaSettings): void {
  localStorage.setItem('chartMaSettings', JSON.stringify(settings));
  touchSettingsModified('preferences');
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [enableHoverPreview, setEnableHoverPreviewState] = useState<boolean>(readHoverPreview);
  const [sparklineMode, setSparklineModeState] = useState<SparklineMode>(readSparklineMode);
  const [chartMaSettings, setChartMaSettingsState] = useState<ChartMaSettings>(readChartMaSettings);

  useEffect(() => {
    const handleRemoteApply = (event: Event) => {
      if (!isRemoteSettingsAppliedEvent(event) || event.detail.domain !== 'preferences') return;
      setEnableHoverPreviewState(readHoverPreview());
      setSparklineModeState(readSparklineMode());
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
