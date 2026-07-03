import { useEffect, useState, useRef } from 'react';
import { useSymbolPreview } from '../../context/SymbolPreviewContext';
import { useTheme } from '../../context/ThemeContext';
import { TradingViewMiniChart } from './TradingViewMiniChart';

export function SymbolPreviewOverlay() {
  const { preview, onMouseEnterPreview, onMouseLeavePreview } = useSymbolPreview();
  const { theme } = useTheme();
  const [style, setStyle] = useState<React.CSSProperties>({ display: 'none' });
  const [chartReady, setChartReady] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!preview.open || !preview.anchorRect) {
      setStyle({ display: 'none' });
      setChartReady(false);
      return;
    }

    const overlayWidth = 350;
    const overlayHeight = 240;
    const rect = preview.anchorRect;

    // Calculate horizontal center
    const linkCenter = rect.left + rect.width / 2;
    let left = linkCenter - overlayWidth / 2;
    // Clamp to screen viewport boundaries
    left = Math.max(10, Math.min(left, window.innerWidth - overlayWidth - 10));

    // Calculate vertical position (default above the link)
    let top = rect.top - overlayHeight - 8;
    let placeBelow = false;

    if (top < 10) {
      // Not enough space above, place below the link
      top = rect.bottom + 8;
      placeBelow = true;
    }

    setStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${overlayWidth}px`,
      height: `${overlayHeight}px`,
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      transformOrigin: placeBelow ? 'top center' : 'bottom center',
    });
  }, [preview.open, preview.anchorRect]);

  if (!preview.open) return null;

  return (
    <div
      ref={overlayRef}
      className="tv-preview-overlay"
      style={style}
      onMouseEnter={onMouseEnterPreview}
      onMouseLeave={onMouseLeavePreview}
    >
      <div className="tv-preview-header">
        <span className="tv-preview-symbol">{preview.rawSym}</span>
        <span className="tv-preview-name">{preview.name}</span>
      </div>
      <div className="tv-preview-body">
        {!chartReady && (
          <div className="tv-preview-loading">
            Loading preview...
          </div>
        )}
        <TradingViewMiniChart
          key={`${preview.tvSym}-${theme}`}
          symbol={preview.tvSym}
          theme={theme}
          onReady={() => setChartReady(true)}
        />
      </div>
      <div className="tv-preview-footer">
        Click to view interactive chart
      </div>
    </div>
  );
}
