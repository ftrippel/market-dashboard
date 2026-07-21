import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSymbolPreviewActions, useSymbolPreviewState } from '../../context/SymbolPreviewContext';
import { useTheme } from '../../context/ThemeContext';
import { TradingViewMiniChart } from './TradingViewMiniChart';

export function SymbolPreviewOverlay() {
  const preview = useSymbolPreviewState();
  const { onMouseEnterPreview, onMouseLeavePreview } = useSymbolPreviewActions();
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

    const linkMiddle = rect.top + rect.height / 2;
    let top = linkMiddle - overlayHeight / 2;
    top = Math.max(10, Math.min(top, window.innerHeight - overlayHeight - 10));

    let left = rect.right + 8;
    let placeLeft = false;

    if (left + overlayWidth > window.innerWidth - 10) {
      left = rect.left - overlayWidth - 8;
      placeLeft = true;
    }

    left = Math.max(10, Math.min(left, window.innerWidth - overlayWidth - 10));
    const origin = placeLeft ? 'center right' : 'center left';

    setStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${overlayWidth}px`,
      height: `${overlayHeight}px`,
      display: 'flex',
      flexDirection: 'column',
      transformOrigin: origin,
    });
  }, [preview.open, preview.anchorRect]);

  if (!preview.open) return null;

  return createPortal(
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
          key={`${preview.rawSym}-${theme}`}
          symbol={preview.rawSym}
          theme={theme}
          onReady={() => setChartReady(true)}
        />
      </div>
      <div className="tv-preview-footer">

      </div>
    </div>,
    document.body,
  );
}
