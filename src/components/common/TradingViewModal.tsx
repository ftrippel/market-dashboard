import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChartModal } from '../../context/ChartModalContext';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { useSymbolPreview } from '../../context/SymbolPreviewContext';
import { colors } from '../../utils/formatting';
import { config } from '../../config';
import { Icon } from './Icon';
import { TradingViewAdvancedChart } from './TradingViewAdvancedChart';
import { TradingViewCustomChart } from './TradingViewCustomChart';
import { ChartOpenMenu } from './ChartOpenMenu';
import { usePenBackdropDismiss, usePenCompatibleClick } from '../../utils/penClick';
import { toYahooFinanceSymbol } from '../../services/api';

export function TradingViewModal() {
  const { chart, openChart, closeChart, setChartSymbol } = useChartModal();
  const { theme } = useTheme();
  const { useCustomCharts } = useSettings();
  const [chartReady, setChartReady] = useState(false);
  const [openMenu, setOpenMenu] = useState(false);
  const [symbolInput, setSymbolInput] = useState('');
  const symbolInputRef = useRef<HTMLInputElement>(null);

  const siblings = chart.siblings || [];
  const currentIndex = siblings.findIndex((s) => s.sym === chart.rawSym);
  const hasPrev = !chart.freeSymbol && currentIndex > 0;
  const hasNext = !chart.freeSymbol && currentIndex !== -1 && currentIndex < siblings.length - 1;
  const hasSymbol = chart.rawSym.length > 0;

  useEffect(() => {
    if (!chart.open) {
      setSymbolInput('');
      return;
    }
    setSymbolInput(chart.rawSym);
    if (chart.freeSymbol) {
      symbolInputRef.current?.focus();
    }
  }, [chart.open, chart.freeSymbol, chart.rawSym]);

  const handlePrev = () => {
    if (hasPrev) {
      const prevSibling = siblings[currentIndex - 1];
      openChart(prevSibling.sym, prevSibling.name, siblings);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      const nextSibling = siblings[currentIndex + 1];
      openChart(nextSibling.sym, nextSibling.name, siblings);
    }
  };

  useEffect(() => {
    setChartReady(false);
  }, [chart.tvSym, chart.rawSym, theme, useCustomCharts]);

  useEffect(() => {
    if (!chart.open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeChart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [chart.open, closeChart]);

  const handleChartReady = useCallback(() => {
    setChartReady(true);
  }, []);

  const submitSymbol = useCallback(() => {
    setChartSymbol(symbolInput);
  }, [setChartSymbol, symbolInput]);

  const closePenClick = usePenCompatibleClick(() => closeChart());
  const backdropPenDismiss = usePenBackdropDismiss(closeChart);
  const prevPenClick = usePenCompatibleClick(handlePrev);
  const nextPenClick = usePenCompatibleClick(handleNext);
  const loadPenClick = usePenCompatibleClick(() => submitSymbol());

  if (!chart.open) return null;

  const displaySym = hasSymbol
    ? useCustomCharts
      ? toYahooFinanceSymbol(chart.rawSym)
      : chart.tvSym
    : '';

  return createPortal(
    <div
      id="tv-modal"
      className="tv-modal open"
      data-scroll-lock-overlay
      {...backdropPenDismiss}
    >
      <div id="tv-modal-box">
        <div id="tv-modal-hdr">
          {chart.freeSymbol ? (
            <form
              id="tv-modal-title"
              onSubmit={(event) => {
                event.preventDefault();
                submitSymbol();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flex: 1,
                minWidth: 0,
              }}
            >
              <input
                ref={symbolInputRef}
                type="text"
                value={symbolInput}
                onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
                placeholder="Enter symbol (e.g. AAPL, ES=F, BTC-USD)"
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--bg3)',
                  color: 'var(--text)',
                  border: '1px solid var(--border2)',
                  borderRadius: '4px',
                  padding: '5px 8px',
                  fontSize: '11px',
                  fontFamily: 'IBM Plex Mono, monospace',
                  letterSpacing: '0.5px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                className="btn"
                {...loadPenClick}
                style={{
                  background: 'var(--accent)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontSize: '10px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                }}
              >
                LOAD
              </button>
            </form>
          ) : (
            <div id="tv-modal-title">
              {chart.name} · {displaySym}
            </div>
          )}
          {siblings.length > 1 && !chart.freeSymbol && (
            <div className="tv-modal-nav" style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                {...prevPenClick}
                disabled={!hasPrev}
                style={{
                  opacity: hasPrev ? 1 : 0.4,
                  cursor: hasPrev ? 'pointer' : 'not-allowed',
                  pointerEvents: hasPrev ? 'auto' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Icon name="chevron_left" size="xs" />
                PREV
              </button>
              <button
                type="button"
                {...nextPenClick}
                disabled={!hasNext}
                style={{
                  opacity: hasNext ? 1 : 0.4,
                  cursor: hasNext ? 'pointer' : 'not-allowed',
                  pointerEvents: hasNext ? 'auto' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                NEXT
                <Icon name="chevron_right" size="xs" />
              </button>
            </div>
          )}
          {hasSymbol && <ChartOpenMenu rawSym={chart.rawSym} onOpenChange={setOpenMenu} />}
          <button type="button" {...closePenClick}>
            <Icon name="close" size="xs" />
            CLOSE
          </button>
        </div>
        <div
          id="tv-frame-wrap"
          className={[
            hasSymbol && chartReady ? 'ready' : hasSymbol ? 'loading' : 'ready',
            openMenu ? 'menu-open' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!hasSymbol ? (
            <div className="tv-frame-loading" aria-live="polite">
              Enter a symbol and press Load
            </div>
          ) : (
            <>
              {!chartReady && (
                <div className="tv-frame-loading" aria-live="polite">
                  Loading chart...
                </div>
              )}
              {useCustomCharts ? (
                <TradingViewCustomChart
                  key={`${chart.rawSym}-${theme}`}
                  symbol={chart.rawSym}
                  theme={theme}
                  onReady={handleChartReady}
                />
              ) : (
                <TradingViewAdvancedChart
                  key={`${chart.tvSym}-${theme}`}
                  symbol={chart.tvSym}
                  theme={theme}
                  onReady={handleChartReady}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SymbolLink({
  sym,
  name,
  flag,
  label,
  siblings,
}: {
  sym: string;
  name: string;
  flag?: string;
  label?: string;
  siblings?: Array<{ sym: string; name: string }>;
}) {
  const { openChart } = useChartModal();
  const { onMouseEnterLink, onMouseLeaveLink, hidePreview } = useSymbolPreview();

  const openSymbol = useCallback(() => {
    hidePreview();
    openChart(sym, name, siblings);
  }, [hidePreview, openChart, sym, name, siblings]);

  const symbolPenClick = usePenCompatibleClick(openSymbol);

  const dismissPreview = useCallback(() => {
    hidePreview();
  }, [hidePreview]);

  const handleMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onMouseEnterLink(sym, name, rect);
  };

  return (
    <button
      type="button"
      className="tn-link"
      {...symbolPenClick}
      onPointerDown={dismissPreview}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onMouseLeaveLink}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        color: colors.text,
        fontWeight: 500,
        fontSize: '12px',
        fontFamily: 'inherit',
        borderBottom: config.tradingView.enableUnderline
          ? `1px dotted ${colors.linkUnderline}`
          : 'none',
      }}
    >
      {flag ? `${flag} ` : ''}
      {label ?? name}
    </button>
  );
}
