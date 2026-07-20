import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries, CrosshairMode } from 'lightweight-charts';
import { fetchYahooFinanceDailyHistory, type DailyHistoryPoint } from '../../services/api';
import {
  buildLastTradeCrosshairInfoFromHistory,
  formatCrosshairChange,
  type CrosshairInfo,
} from '../../utils/chartInteractionController';
import { colors } from '../../utils/formatting';

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
  const [crosshairInfo, setCrosshairInfo] = useState<CrosshairInfo | null>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setCrosshairInfo(null);

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
    const closeByTime = new Map(data.map((point, index) => [point.time, data[index - 1]?.value ?? null]));

    const chart = createChart(container, {
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? '#0f1419' : '#ffffff',
        },
        textColor: isDark ? '#9aa5b4' : '#686d78',
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
      height: container.clientHeight || 160,
      handleScale: false,
      handleScroll: false,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: isDark ? '#5b8cff' : '#1f5aff',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
    });

    lineSeries.setData(data);
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setCrosshairInfo(null);
        return;
      }

      const barData = param.seriesData.get(lineSeries);
      if (!barData || typeof (barData as { value?: number }).value !== 'number') {
        setCrosshairInfo(null);
        return;
      }

      const time = String(param.time);
      const value = (barData as { value: number }).value;
      const prevValue = closeByTime.get(time) ?? null;
      const changePct =
        prevValue !== null && prevValue !== 0 ? ((value - prevValue) / prevValue) * 100 : null;

      setCrosshairInfo({ date: time, close: value, changePct });
    });

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
      setCrosshairInfo(null);
      chart.remove();
    };
  }, [data, isDark, onReady]);

  const lastTradeInfo = useMemo(
    () => (data ? buildLastTradeCrosshairInfoFromHistory(data) : null),
    [data],
  );
  const displayInfo = crosshairInfo ?? lastTradeInfo;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {!loading && !error && displayInfo && (
        <div
          className="tv-preview-chart-data"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '5px 10px',
            fontSize: '10px',
            fontFamily: 'IBM Plex Mono, monospace',
            color: isDark ? '#9aa5b4' : '#686d78',
            borderBottom: `1px solid ${isDark ? '#2a2e39' : '#d1d4dc'}`,
            background: isDark ? '#0f1419' : '#ffffff',
          }}
        >
          <span style={{ color: isDark ? '#e6edf3' : '#131722' }}>{displayInfo.date}</span>
          <span
            style={{
              color:
                displayInfo.changePct === null
                  ? colors.text3
                  : displayInfo.changePct > 0
                    ? colors.green
                    : displayInfo.changePct < 0
                      ? colors.red
                      : colors.text3,
              fontWeight: 600,
            }}
          >
            {formatCrosshairChange(displayInfo.changePct)}
          </span>
        </div>
      )}
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
      <div ref={containerRef} style={{ width: '100%', flex: 1, minHeight: 0 }} />
    </div>
  );
});
