import { useCallback, useEffect, useState } from 'react';
import { useChartModal } from '../../context/ChartModalContext';
import { useTheme } from '../../context/ThemeContext';
import { useSymbolPreview } from '../../context/SymbolPreviewContext';
import { colors } from '../../utils/formatting';
import { Icon } from './Icon';
import { TradingViewAdvancedChart } from './TradingViewAdvancedChart';

export function TradingViewModal() {
  const { chart, openChart, closeChart } = useChartModal();
  const { theme } = useTheme();
  const [chartReady, setChartReady] = useState(false);

  const siblings = chart.siblings || [];
  const currentIndex = siblings.findIndex((s) => s.sym === chart.rawSym);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < siblings.length - 1;

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
  }, [chart.tvSym, theme]);

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

  if (!chart.open) return null;

  return (
    <div
      id="tv-modal"
      className="tv-modal open"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeChart();
      }}
    >
      <div id="tv-modal-box">
        <div id="tv-modal-hdr">
          <div id="tv-modal-title">
            {chart.name} · {chart.tvSym}
          </div>
          {siblings.length > 1 && (
            <div className="tv-modal-nav" style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={handlePrev}
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
                onClick={handleNext}
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
          <button type="button" onClick={closeChart}>
            <Icon name="close" size="xs" />
            CLOSE
          </button>
        </div>
        <div id="tv-frame-wrap" className={chartReady ? 'ready' : 'loading'}>
          {!chartReady && (
            <div className="tv-frame-loading" aria-live="polite">
              Loading chart...
            </div>
          )}
          <TradingViewAdvancedChart
            key={`${chart.tvSym}-${theme}`}
            symbol={chart.tvSym}
            theme={theme}
            onReady={handleChartReady}
          />
        </div>
      </div>
    </div>
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

  const handleMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onMouseEnterLink(sym, name, rect);
  };

  return (
    <button
      type="button"
      className="tn-link"
      onClick={() => {
        hidePreview();
        openChart(sym, name, siblings);
      }}
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
        borderBottom: `1px dotted ${colors.linkUnderline}`,
      }}
    >
      {flag ? `${flag} ` : ''}
      {label ?? name}
    </button>
  );
}
