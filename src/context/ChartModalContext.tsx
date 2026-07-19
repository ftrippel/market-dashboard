import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useScrollLock } from '../hooks/useScrollLock';
import { blurActiveElement, isTypingTarget } from '../utils/focus';
import { toTradingViewSymbol } from '../utils/tradingView';

interface SiblingSymbol {
  sym: string;
  name: string;
}

interface ChartState {
  open: boolean;
  rawSym: string;
  name: string;
  tvSym: string;
  siblings?: SiblingSymbol[];
  freeSymbol: boolean;
}

interface ChartModalContextValue {
  chart: ChartState;
  openChart: (rawSym: string, name: string, siblings?: SiblingSymbol[]) => void;
  openFreeChart: () => void;
  setChartSymbol: (rawSym: string) => void;
  closeChart: () => void;
}

const closedState: ChartState = {
  open: false,
  rawSym: '',
  name: '',
  tvSym: '',
  siblings: [],
  freeSymbol: false,
};

const ChartModalContext = createContext<ChartModalContextValue | null>(null);

export function ChartModalProvider({ children }: { children: ReactNode }) {
  const [chart, setChart] = useState<ChartState>(closedState);

  useScrollLock(chart.open);

  const openChart = useCallback((rawSym: string, name: string, siblings?: SiblingSymbol[]) => {
    const tvSym = toTradingViewSymbol(rawSym);
    setChart({
      open: true,
      rawSym,
      name,
      tvSym,
      siblings,
      freeSymbol: false,
    });
  }, []);

  const openFreeChart = useCallback(() => {
    setChart({
      open: true,
      rawSym: '',
      name: '',
      tvSym: '',
      siblings: [],
      freeSymbol: true,
    });
  }, []);

  const setChartSymbol = useCallback((rawSym: string) => {
    const trimmed = rawSym.trim();
    if (!trimmed) return;
    setChart((prev) => ({
      ...prev,
      rawSym: trimmed,
      name: trimmed,
      tvSym: toTradingViewSymbol(trimmed),
    }));
  }, []);

  const closeChart = useCallback(() => {
    blurActiveElement();
    setChart(closedState);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'c' && event.key !== 'C') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.repeat) return;
      if (isTypingTarget()) return;
      if (chart.open) return;

      event.preventDefault();
      openFreeChart();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chart.open, openFreeChart]);

  useEffect(() => {
    if (!chart.open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeChart();
        return;
      }

      if (!chart.siblings || chart.siblings.length <= 1) return;

      const currentIndex = chart.siblings.findIndex((s) => s.sym === chart.rawSym);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        if (currentIndex >= chart.siblings.length - 1) return;
        nextIndex = currentIndex + 1;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        if (currentIndex <= 0) return;
        nextIndex = currentIndex - 1;
      } else {
        return;
      }

      event.preventDefault();
      const nextSibling = chart.siblings[nextIndex];
      openChart(nextSibling.sym, nextSibling.name, chart.siblings);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chart.open, chart.siblings, chart.rawSym, openChart, closeChart]);

  const value = useMemo(
    () => ({ chart, openChart, openFreeChart, setChartSymbol, closeChart }),
    [chart, openChart, openFreeChart, setChartSymbol, closeChart]
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
