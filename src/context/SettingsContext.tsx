import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { config } from '../config';

export type SparklineMode = 'none' | 'line' | 'bar' | 'dot';
export type HoverPreviewPlacement = 'above-below' | 'left-right';

interface SettingsContextValue {
  enableHoverPreview: boolean;
  setEnableHoverPreview: (val: boolean) => void;
  hoverPreviewPlacement: HoverPreviewPlacement;
  setHoverPreviewPlacement: (placement: HoverPreviewPlacement) => void;
  sparklineMode: SparklineMode;
  setSparklineMode: (mode: SparklineMode) => void;
  useCustomCharts: boolean;
  setUseCustomCharts: (val: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [enableHoverPreview, setEnableHoverPreviewState] = useState<boolean>(() => {
    const stored = localStorage.getItem('enableHoverPreview');
    if (stored !== null) return stored === 'true';
    return config.tradingView.enableHoverPreview;
  });

  const [hoverPreviewPlacement, setHoverPreviewPlacementState] = useState<HoverPreviewPlacement>(() => {
    const stored = localStorage.getItem('hoverPreviewPlacement') as HoverPreviewPlacement | null;
    if (stored === 'above-below' || stored === 'left-right') return stored;
    return 'above-below';
  });

  const [sparklineMode, setSparklineModeState] = useState<SparklineMode>(() => {
    const stored = localStorage.getItem('sparklineMode') as SparklineMode | null;
    if (stored === 'none' || stored === 'line' || stored === 'bar' || stored === 'dot') return stored;
    return 'line'; // default to line
  });

  const [useCustomCharts, setUseCustomChartsState] = useState<boolean>(() => {
    const stored = localStorage.getItem('useCustomCharts');
    if (stored !== null) return stored === 'true';
    return config.tradingView.useCustomCharts;
  });

  const setEnableHoverPreview = useCallback((val: boolean) => {
    setEnableHoverPreviewState(val);
    localStorage.setItem('enableHoverPreview', String(val));
  }, []);

  const setHoverPreviewPlacement = useCallback((placement: HoverPreviewPlacement) => {
    setHoverPreviewPlacementState(placement);
    localStorage.setItem('hoverPreviewPlacement', placement);
  }, []);

  const setSparklineMode = useCallback((mode: SparklineMode) => {
    setSparklineModeState(mode);
    localStorage.setItem('sparklineMode', mode);
  }, []);

  const setUseCustomCharts = useCallback((val: boolean) => {
    setUseCustomChartsState(val);
    localStorage.setItem('useCustomCharts', String(val));
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        enableHoverPreview,
        setEnableHoverPreview,
        hoverPreviewPlacement,
        setHoverPreviewPlacement,
        sparklineMode,
        setSparklineMode,
        useCustomCharts,
        setUseCustomCharts,
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
