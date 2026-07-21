import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { config } from '../config';
import {
  isRemoteSettingsAppliedEvent,
  REMOTE_SETTINGS_APPLIED_EVENT,
  touchSettingsModified,
} from '../services/settingsEvents';

export type SparklineMode = 'none' | 'line' | 'bar' | 'dot';

interface SettingsContextValue {
  enableHoverPreview: boolean;
  setEnableHoverPreview: (val: boolean) => void;
  sparklineMode: SparklineMode;
  setSparklineMode: (mode: SparklineMode) => void;
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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [enableHoverPreview, setEnableHoverPreviewState] = useState<boolean>(readHoverPreview);
  const [sparklineMode, setSparklineModeState] = useState<SparklineMode>(readSparklineMode);

  useEffect(() => {
    const handleRemoteApply = (event: Event) => {
      if (!isRemoteSettingsAppliedEvent(event) || event.detail.domain !== 'preferences') return;
      setEnableHoverPreviewState(readHoverPreview());
      setSparklineModeState(readSparklineMode());
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

  return (
    <SettingsContext.Provider
      value={{
        enableHoverPreview,
        setEnableHoverPreview,
        sparklineMode,
        setSparklineMode,
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
