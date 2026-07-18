import { memo, useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries, CrosshairMode } from 'lightweight-charts';
import { fetchYahooFinanceDailyHistory, type DailyHistoryPoint } from '../../services/api';

interface TradingViewMiniChartProps {
  symbol: string;
  theme: 'light' | 'dark';
  onReady?: () => void;
}

export const TradingViewMiniChart = memo(function TradingViewMiniChart({
  symbol,
  theme,
  onReady,
}: TradingViewMiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<DailyHistoryPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);

    fetchYahooFinanceDailyHistory(symbol)
      .then((history) => {
        if (!active) return;
        if (history && history.length > 0) {
          setData(history);
        } else {
          setError('No historical data available');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error(err);
        setError('Failed to load chart');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [symbol]);

  useEffect(() => {
    if (!data || !containerRef.current) return;

    const container = containerRef.current;

    const chart = createChart(container, {
      layout: {
        background: {
          type: ColorType.Solid,
          color: theme === 'dark' ? '#0f1419' : '#ffffff',
        },
        textColor: theme === 'dark' ? '#9aa5b4' : '#686d78',
        fontSize: 10,
        fontFamily: 'IBM Plex Mono, monospace',
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        horzLine: {
          visible: true,
          labelVisible: true,
        },
        vertLine: {
          visible: true,
          labelVisible: true,
        },
      },
      width: container.clientWidth || 330,
      height: container.clientHeight || 180,
      handleScale: false,
      handleScroll: false,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: theme === 'dark' ? '#5b8cff' : '#1f5aff',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
    });

    lineSeries.setData(data);
    chart.timeScale().fitContent();

    onReady?.();

    const handleResize = () => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, theme, onReady]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {loading && (
        <div className="tv-preview-loading" aria-live="polite">
          Loading history...
        </div>
      )}
      {error && (
        <div className="tv-preview-loading" style={{ color: 'var(--red)' }}>
          {error}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});
