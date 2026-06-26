import { useEffect, useRef } from 'react';
import {
  TRADINGVIEW_ADVANCED_CHART_SCRIPT,
  buildAdvancedChartWidgetConfig,
} from '../../utils/tradingView';

interface TradingViewAdvancedChartProps {
  symbol: string;
  theme: 'light' | 'dark';
  onReady?: () => void;
}

export function TradingViewAdvancedChart({
  symbol,
  theme,
  onReady,
}: TradingViewAdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const widget = container.querySelector('.tradingview-widget-container__widget');
    if (widget) widget.innerHTML = '';
    container.querySelectorAll('script').forEach((node) => node.remove());

    const script = document.createElement('script');
    script.src = TRADINGVIEW_ADVANCED_CHART_SCRIPT;
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify(buildAdvancedChartWidgetConfig(symbol, theme));

    const finishLoading = () => {
      window.setTimeout(() => onReady?.(), 400);
    };

    script.addEventListener('load', finishLoading);
    script.addEventListener('error', finishLoading);
    container.appendChild(script);

    return () => {
      script.removeEventListener('load', finishLoading);
      script.removeEventListener('error', finishLoading);
      script.remove();
      if (widget) widget.innerHTML = '';
    };
  }, [symbol, theme, onReady]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container tv-advanced-chart"
      style={{ height: '100%', width: '100%' }}
    >
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
