import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, CrosshairMode } from 'lightweight-charts';
import { fetchYahooFinanceOhlcHistory, type DailyOhlcPoint } from '../../services/api';
import { buildIndicatorSeries, calculateEMA, calculateSMA } from '../../utils/chartIndicators';
import {
  createChartInteractionController,
  type ChartInteractionUi,
  type CrosshairInfo,
} from '../../utils/chartInteractionController';
import { colors } from '../../utils/formatting';
import { MeasureToolPrimitive } from '../../utils/measureToolPrimitive';
import { Icon } from './Icon';

interface TradingViewCustomChartProps {
  symbol: string;
  theme: 'light' | 'dark';
  onReady?: () => void;
}

const INDICATORS = [
  { label: 'EMA 20', period: 20, type: 'ema' as const, color: { dark: '#f5a623', light: '#e65100' } },
  { label: 'SMA 50', period: 50, type: 'sma' as const, color: { dark: '#5b8cff', light: '#1f5aff' } },
  { label: 'SMA 200', period: 200, type: 'sma' as const, color: { dark: '#c084fc', light: '#7c3aed' } },
];

/** ~6 months of trading days. */
const DEFAULT_VISIBLE_BARS = 126;
/** Empty bars to the right of the latest candle. */
const RIGHT_OFFSET_BARS = 12;

function formatCrosshairChange(changePct: number | null): string {
  if (changePct === null) return '—';
  const sign = changePct > 0 ? '+' : '';
  return `${sign}${changePct.toFixed(2)}%`;
}

export const TradingViewCustomChart = memo(function TradingViewCustomChart({
  symbol,
  theme,
  onReady,
}: TradingViewCustomChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<DailyOhlcPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [crosshairInfo, setCrosshairInfo] = useState<CrosshairInfo | null>(null);
  const [interactionUi, setInteractionUi] = useState<ChartInteractionUi | null>(null);
  const isYield = symbol === 'US10Y' || symbol === 'US30Y';
  const priceDecimals = isYield ? 3 : 2;

  const handleMeasureButtonPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      interactionUi?.toggleMeasureMode();
    },
    [interactionUi],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setCrosshairInfo(null);
    setInteractionUi(null);

    fetchYahooFinanceOhlcHistory(symbol)
      .then((history) => {
        if (!active) return;
        if (history && history.length > 0) {
          setData(history);
        } else {
          setError('No historical data available');
          onReady?.();
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error(err);
        setError('Failed to load chart');
        setLoading(false);
        onReady?.();
      });

    return () => {
      active = false;
    };
  }, [symbol]);

  useEffect(() => {
    if (!data || !containerRef.current) return;

    const container = containerRef.current;
    const isDark = theme === 'dark';

    const chart = createChart(container, {
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? '#131722' : '#ffffff',
        },
        textColor: isDark ? '#9aa5b4' : '#686d78',
        fontSize: 11,
        fontFamily: 'IBM Plex Mono, monospace',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(42, 46, 57, 0.6)' : 'rgba(197, 203, 206, 0.4)' },
        horzLines: { color: isDark ? 'rgba(42, 46, 57, 0.6)' : 'rgba(197, 203, 206, 0.4)' },
      },
      rightPriceScale: {
        borderColor: isDark ? '#2a2e39' : '#d1d4dc',
      },
      timeScale: {
        borderColor: isDark ? '#2a2e39' : '#d1d4dc',
        rightOffset: RIGHT_OFFSET_BARS,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      width: container.clientWidth || 960,
      height: container.clientHeight || 560,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: isDark ? '#26a69a' : '#089981',
      downColor: isDark ? '#ef5350' : '#f23645',
      borderVisible: false,
      wickUpColor: isDark ? '#26a69a' : '#089981',
      wickDownColor: isDark ? '#ef5350' : '#f23645',
    });

    candleSeries.setData(data);

    const measurePrimitive = new MeasureToolPrimitive(theme);
    candleSeries.attachPrimitive(measurePrimitive);

    const closes = data.map((point) => point.close);
    const times = data.map((point) => point.time);

    for (const indicator of INDICATORS) {
      const values =
        indicator.type === 'ema'
          ? calculateEMA(closes, indicator.period)
          : calculateSMA(closes, indicator.period);

      const lineSeries = chart.addSeries(LineSeries, {
        color: indicator.color[theme],
        lineWidth: 2,
        crosshairMarkerVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      lineSeries.setData(buildIndicatorSeries(times, values));
    }

    const lastIndex = data.length - 1;
    const fromIndex = Math.max(0, lastIndex - DEFAULT_VISIBLE_BARS + 1);
    // `to` must extend past the last bar — setVisibleLogicalRange derives rightOffset from (to - baseIndex).
    chart.timeScale().setVisibleLogicalRange({
      from: fromIndex,
      to: lastIndex + RIGHT_OFFSET_BARS,
    });
    onReady?.();

    const interaction = createChartInteractionController({
      container,
      chart,
      candleSeries,
      measurePrimitive,
      data,
      onCrosshairInfoChange: setCrosshairInfo,
      onUiChange: setInteractionUi,
    });

    const handleResize = () => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      interaction.dispose();
      resizeObserver.disconnect();
      setInteractionUi(null);
      chart.remove();
    };
  }, [data, theme, onReady]);

  const isMeasuring = interactionUi?.mode === 'measuring';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          gap: '14px',
          padding: '6px 10px',
          fontSize: '10px',
          fontFamily: 'IBM Plex Mono, monospace',
          color: theme === 'dark' ? '#9aa5b4' : '#686d78',
          borderBottom: `1px solid ${theme === 'dark' ? '#2a2e39' : '#d1d4dc'}`,
          background: theme === 'dark' ? '#131722' : '#ffffff',
          flexShrink: 0,
        }}
      >
        {INDICATORS.map((indicator) => (
          <span key={indicator.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                width: '10px',
                height: '2px',
                background: indicator.color[theme],
                display: 'inline-block',
              }}
            />
            {indicator.label}
          </span>
        ))}
        {!loading && !error && (
          <button
            type="button"
            className={`tv-measure-btn${isMeasuring ? ' active' : ''}`}
            onPointerDown={handleMeasureButtonPointerDown}
            aria-label={isMeasuring ? 'Cancel measure tool' : 'Measure tool'}
            aria-pressed={isMeasuring}
            title={isMeasuring ? 'Tap two points on the chart (cancel)' : 'Measure — tap two points on the chart'}
          >
            <Icon name="straighten" size="sm" label={isMeasuring ? 'Cancel measure' : 'Measure'} />
          </button>
        )}
        {crosshairInfo && (
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '10px',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: theme === 'dark' ? '#e6edf3' : '#131722' }}>{crosshairInfo.date}</span>
            <span style={{ color: theme === 'dark' ? '#9aa5b4' : '#686d78' }}>
              {crosshairInfo.close.toFixed(priceDecimals)}
            </span>
            <span
              style={{
                color:
                  crosshairInfo.changePct === null
                    ? colors.text3
                    : crosshairInfo.changePct > 0
                      ? colors.green
                      : crosshairInfo.changePct < 0
                        ? colors.red
                        : colors.text3,
                fontWeight: 600,
              }}
            >
              {formatCrosshairChange(crosshairInfo.changePct)}
            </span>
          </span>
        )}
      </div>
      {loading && (
        <div className="tv-frame-loading" aria-live="polite">
          Loading history...
        </div>
      )}
      {error && (
        <div className="tv-frame-loading" style={{ color: 'var(--red)' }}>
          {error}
        </div>
      )}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={containerRef} className="tv-advanced-chart" style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
});
