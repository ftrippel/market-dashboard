import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { toTradingViewSymbol } from '../utils/tradingView';
import { config } from '../config';

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
    if (!config.tradingView.enableHoverPreview) return;

    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    setPreview((current) => {
      // If we are already displaying this symbol, don't restart the show timeout
      if (current.open && current.rawSym === rawSym) {
        return current;
      }

      if (showTimeoutRef.current) {
        window.clearTimeout(showTimeoutRef.current);
      }

      showTimeoutRef.current = window.setTimeout(() => {
        const tvSym = toTradingViewSymbol(rawSym);
        setPreview({
          open: true,
          rawSym,
          name,
          tvSym,
          anchorRect: rect,
        });
        showTimeoutRef.current = null;
      }, 400); // 400ms delay to prevent overlay flashing during rapid movements

      return current;
    });
  }, []);

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
    }, 200); // 200ms delay allows mouse transition into the overlay card
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
