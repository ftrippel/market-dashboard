import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isTypingTarget } from '../utils/focus';
import { hasOpenOverlays } from '../utils/overlayStack';
import { toTradingViewSymbol } from '../utils/tradingView';
import { useSettings } from './SettingsContext';
import { useChartModal } from './ChartModalContext';

export interface PreviewState {
  open: boolean;
  rawSym: string;
  name: string;
  tvSym: string;
  anchorRect: DOMRect | null;
}

interface SymbolPreviewActions {
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

const SymbolPreviewStateContext = createContext<PreviewState | null>(null);
const SymbolPreviewActionsContext = createContext<SymbolPreviewActions | null>(null);

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

  const actions = useMemo(
    () => ({
      onMouseEnterLink,
      onMouseLeaveLink,
      onMouseEnterPreview,
      onMouseLeavePreview,
      hidePreview,
    }),
    [onMouseEnterLink, onMouseLeaveLink, onMouseEnterPreview, onMouseLeavePreview, hidePreview],
  );

  useEffect(() => {
    if (chart.open) hidePreview();
  }, [chart.open, hidePreview]);

  useEffect(() => {
    if (!preview.open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      if (isTypingTarget()) return;
      if (hasOpenOverlays()) return;

      event.preventDefault();
      hidePreview();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview.open, hidePreview]);

  return (
    <SymbolPreviewActionsContext.Provider value={actions}>
      <SymbolPreviewStateContext.Provider value={preview}>{children}</SymbolPreviewStateContext.Provider>
    </SymbolPreviewActionsContext.Provider>
  );
}

export function useSymbolPreviewState(): PreviewState {
  const state = useContext(SymbolPreviewStateContext);
  if (!state) {
    throw new Error('useSymbolPreviewState must be used within SymbolPreviewProvider');
  }
  return state;
}

export function useSymbolPreviewActions(): SymbolPreviewActions {
  const actions = useContext(SymbolPreviewActionsContext);
  if (!actions) {
    throw new Error('useSymbolPreviewActions must be used within SymbolPreviewProvider');
  }
  return actions;
}

/** Prefer useSymbolPreviewState / useSymbolPreviewActions to avoid unnecessary re-renders. */
export function useSymbolPreview() {
  return {
    preview: useSymbolPreviewState(),
    ...useSymbolPreviewActions(),
  };
}
