import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toTradingViewSymbol } from '../utils/tradingView';

interface ChartState {
  open: boolean;
  rawSym: string;
  name: string;
  tvSym: string;
}

interface ChartModalContextValue {
  chart: ChartState;
  openChart: (rawSym: string, name: string) => void;
  closeChart: () => void;
}

const closedState: ChartState = {
  open: false,
  rawSym: '',
  name: '',
  tvSym: '',
};

const ChartModalContext = createContext<ChartModalContextValue | null>(null);

export function ChartModalProvider({ children }: { children: ReactNode }) {
  const [chart, setChart] = useState<ChartState>(closedState);

  const openChart = useCallback((rawSym: string, name: string) => {
    const tvSym = toTradingViewSymbol(rawSym);
    setChart({
      open: true,
      rawSym,
      name,
      tvSym,
    });
  }, []);

  const closeChart = useCallback(() => {
    setChart(closedState);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChart();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeChart]);

  useEffect(() => {
    document.body.style.overflow = chart.open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [chart.open]);

  const value = useMemo(
    () => ({ chart, openChart, closeChart }),
    [chart, openChart, closeChart]
  );

  return <ChartModalContext.Provider value={value}>{children}</ChartModalContext.Provider>;
}

export function useChartModal(): ChartModalContextValue {
  const ctx = useContext(ChartModalContext);
  if (!ctx) {
    throw new Error('useChartModal must be used within ChartModalProvider');
  }
  return ctx;
}
