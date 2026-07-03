import { useCallback, useEffect, useState } from 'react';
import { useChartModal } from '../../context/ChartModalContext';
import { useTheme } from '../../context/ThemeContext';
import { useSymbolPreview } from '../../context/SymbolPreviewContext';
import { colors } from '../../utils/formatting';
import { Icon } from './Icon';
import { TradingViewAdvancedChart } from './TradingViewAdvancedChart';

export function TradingViewModal() {
  const { chart, closeChart } = useChartModal();
  const { theme } = useTheme();
  const [chartReady, setChartReady] = useState(false);

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
}: {
  sym: string;
  name: string;
  flag?: string;
  label?: string;
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
        openChart(sym, name);
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
