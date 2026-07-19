import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSymbolPreview } from '../../context/SymbolPreviewContext';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { TradingViewMiniChart } from './TradingViewMiniChart';

export function SymbolPreviewOverlay() {
  const { preview, onMouseEnterPreview, onMouseLeavePreview } = useSymbolPreview();
  const { theme } = useTheme();
  const { hoverPreviewPlacement } = useSettings();
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

    let left = 0;
    let top = 0;
    let origin = 'bottom center';

    if (hoverPreviewPlacement === 'left-right') {
      // Calculate vertical position (centered relative to the link)
      const linkMiddle = rect.top + rect.height / 2;
      top = linkMiddle - overlayHeight / 2;
      // Clamp to screen viewport boundaries vertically
      top = Math.max(10, Math.min(top, window.innerHeight - overlayHeight - 10));

      // Calculate horizontal position (default to the right of the link)
      left = rect.right + 8;
      let placeLeft = false;

      if (left + overlayWidth > window.innerWidth - 10) {
        // Not enough space to the right, place to the left of the link
        left = rect.left - overlayWidth - 8;
        placeLeft = true;
      }

      // Clamp left horizontally
      left = Math.max(10, Math.min(left, window.innerWidth - overlayWidth - 10));
      origin = placeLeft ? 'center right' : 'center left';
    } else {
      // above-below
      // Calculate horizontal center
      const linkCenter = rect.left + rect.width / 2;
      left = linkCenter - overlayWidth / 2;
      // Clamp to screen viewport boundaries horizontally
      left = Math.max(10, Math.min(left, window.innerWidth - overlayWidth - 10));

      // Calculate vertical position (default above the link)
      top = rect.top - overlayHeight - 8;
      let placeBelow = false;

      if (top < 10) {
        // Not enough space above, place below the link
        top = rect.bottom + 8;
        placeBelow = true;
      }
      origin = placeBelow ? 'top center' : 'bottom center';
    }

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
  }, [preview.open, preview.anchorRect, hoverPreviewPlacement]);

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
