import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toTradingViewSymbol } from '../utils/tradingView';
import { useSettings } from './SettingsContext';
import { useChartModal } from './ChartModalContext';

interface PreviewState {
  open: boolean;
  rawSym: string;
  name: string;
  tvSym: string;
  anchorRect: DOMRect | null;
}

interface SymbolPreviewContextValue {
  preview: PreviewState;
  onMouseEnterLink: (rawSym: string, name: string, rect: DOMRect) => void;
  onMouseLeaveLink: () => void;
  onMouseEnterPreview: () => void;
  onMouseLeavePreview: () => void;
  hidePreview: () => void;
}

const closedState: PreviewState = {
  open: false,
  rawSym: '',
  name: '',
  tvSym: '',
  anchorRect: null,
};

const SymbolPreviewContext = createContext<SymbolPreviewContextValue | null>(null);

export function SymbolPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<PreviewState>(closedState);
  const { enableHoverPreview } = useSettings();
  const { chart } = useChartModal();
  const chartOpenRef = useRef(chart.open);

  chartOpenRef.current = chart.open;

  const showTimeoutRef = useRef<any>(null);
  const hideTimeoutRef = useRef<any>(null);

  const clearTimeouts = () => {
    if (showTimeoutRef.current) {
      window.clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const onMouseEnterLink = useCallback((rawSym: string, name: string, rect: DOMRect) => {
    if (!enableHoverPreview || chartOpenRef.current) return;

    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    setPreview((current) => {
      if (current.open && current.rawSym === rawSym) {
        return current;
      }

      if (showTimeoutRef.current) {
        window.clearTimeout(showTimeoutRef.current);
      }

      showTimeoutRef.current = window.setTimeout(() => {
        if (chartOpenRef.current) return;
        const tvSym = toTradingViewSymbol(rawSym);
        setPreview({
          open: true,
          rawSym,
          name,
          tvSym,
          anchorRect: rect,
        });
        showTimeoutRef.current = null;
      }, 0);

      return current;
    });
  }, [enableHoverPreview]);

  const onMouseLeaveLink = useCallback(() => {
    if (showTimeoutRef.current) {
      window.clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }

    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
    }

    hideTimeoutRef.current = window.setTimeout(() => {
      setPreview(closedState);
      hideTimeoutRef.current = null;
    }, 200);
  }, []);

  const onMouseEnterPreview = useCallback(() => {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const onMouseLeavePreview = useCallback(() => {
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
    }

    hideTimeoutRef.current = window.setTimeout(() => {
      setPreview(closedState);
      hideTimeoutRef.current = null;
    }, 150);
  }, []);

  const hidePreview = useCallback(() => {
    clearTimeouts();
    setPreview(closedState);
  }, []);

  useEffect(() => {
    if (chart.open) hidePreview();
  }, [chart.open, hidePreview]);

  return (
    <SymbolPreviewContext.Provider
      value={{
        preview,
        onMouseEnterLink,
        onMouseLeaveLink,
        onMouseEnterPreview,
        onMouseLeavePreview,
        hidePreview,
      }}
    >
      {children}
    </SymbolPreviewContext.Provider>
  );
}

export function useSymbolPreview() {
  const ctx = useContext(SymbolPreviewContext);
  if (!ctx) {
    throw new Error('useSymbolPreview must be used within SymbolPreviewProvider');
  }
  return ctx;
}
