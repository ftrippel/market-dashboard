import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, CrosshairMode, type MouseEventParams } from 'lightweight-charts';
import { fetchYahooFinanceOhlcHistory, type DailyOhlcPoint } from '../../services/api';
import { buildIndicatorSeries, calculateEMA, calculateSMA } from '../../utils/chartIndicators';
import { colors } from '../../utils/formatting';
import {
  createMeasureAnchor,
  MeasureToolPrimitive,
} from '../../utils/measureToolPrimitive';
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

interface CrosshairInfo {
  date: string;
  close: number;
  changePct: number | null;
}

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
  const measureArmedRef = useRef(false);
  const setMeasureArmedRef = useRef<(armed: boolean) => void>(() => {});
  const measureActionsRef = useRef<{ clear: () => void; deactivate: () => void } | null>(null);
  const [data, setData] = useState<DailyOhlcPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [crosshairInfo, setCrosshairInfo] = useState<CrosshairInfo | null>(null);
  const [measureArmed, setMeasureArmed] = useState(false);
  const isYield = symbol === 'US10Y' || symbol === 'US30Y';
  const priceDecimals = isYield ? 3 : 2;

  setMeasureArmedRef.current = setMeasureArmed;

  useEffect(() => {
    measureArmedRef.current = measureArmed;
  }, [measureArmed]);

  const toggleMeasureTool = useCallback(() => {
    setMeasureArmed((armed) => {
      if (armed) {
        measureActionsRef.current?.deactivate();
        return false;
      }
      measureActionsRef.current?.clear();
      return true;
    });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setCrosshairInfo(null);
    setMeasureArmed(false);

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

    let crosshairActive = true;
    const closeByTime = new Map(data.map((point, index) => [point.time, data[index - 1]?.close ?? null]));

    const onCrosshairMove = (param: MouseEventParams) => {
      if (!crosshairActive) return;

      if (!param.time || !param.point) {
        setCrosshairInfo(null);
        return;
      }

      const barData = param.seriesData.get(candleSeries);
      if (!barData || !('close' in barData) || barData.close == null) {
        setCrosshairInfo(null);
        return;
      }

      const date = String(param.time);
      const prevClose = closeByTime.get(date) ?? null;
      const close = barData.close;
      const changePct =
        prevClose !== null && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;

      setCrosshairInfo({ date, close, changePct });
    };

    chart.subscribeCrosshairMove(onCrosshairMove);

    let measurePhase: 'idle' | 'active' = 'idle';

    const getLocalPoint = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      return {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    };

    const clearMeasurement = () => {
      measurePrimitive.clear();
      measurePhase = 'idle';
      container.style.cursor = '';
      container.classList.remove('tv-chart-measure-active');
    };

    const deactivateMeasure = () => {
      clearMeasurement();
      setMeasureArmedRef.current(false);
    };

    measureActionsRef.current = {
      clear: clearMeasurement,
      deactivate: deactivateMeasure,
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const point = getLocalPoint(event);
      const anchor = createMeasureAnchor(chart, candleSeries, point.x, point.y);
      if (!anchor) return;

      const measureInput = event.shiftKey || measureArmedRef.current;

      if (measurePhase === 'idle' && measureInput) {
        measurePhase = 'active';
        measurePrimitive.setMeasurement(anchor, anchor);
        container.style.cursor = 'crosshair';
        container.classList.add('tv-chart-measure-active');
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (measurePhase === 'active') {
        const start = measurePrimitive.getStart();
        if (!start) {
          deactivateMeasure();
          return;
        }
        measurePrimitive.setMeasurement(start, anchor);
        deactivateMeasure();
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (measurePhase !== 'active') return;

      const point = getLocalPoint(event);
      const anchor = createMeasureAnchor(chart, candleSeries, point.x, point.y);
      const start = measurePrimitive.getStart();
      if (!anchor || !start) return;

      measurePrimitive.setMeasurement(start, anchor);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (measurePhase !== 'active' && !measurePrimitive.hasMeasurement()) return;

      measurePrimitive.clear();
      deactivateMeasure();
      event.preventDefault();
      event.stopPropagation();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    window.addEventListener('keydown', onKeyDown, true);

    const handleResize = () => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      crosshairActive = false;
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      resizeObserver.disconnect();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown, true);
      container.classList.remove('tv-chart-measure-active');
      container.style.cursor = '';
      measureActionsRef.current = null;
      chart.remove();
    };
  }, [data, theme, onReady]);

  useEffect(() => {
    if (!measureArmed || !containerRef.current) return;
    containerRef.current.classList.add('tv-chart-measure-armed');
    return () => {
      containerRef.current?.classList.remove('tv-chart-measure-armed');
    };
  }, [measureArmed]);

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
        {!loading && !error && (
          <button
            type="button"
            className={`tv-measure-btn${measureArmed ? ' active' : ''}`}
            onClick={toggleMeasureTool}
            aria-label={measureArmed ? 'Cancel measure tool' : 'Measure tool'}
            aria-pressed={measureArmed}
            title={measureArmed ? 'Tap two points on the chart (cancel)' : 'Measure — tap two points on the chart'}
          >
            <Icon name="straighten" size="sm" label={measureArmed ? 'Cancel measure' : 'Measure'} />
          </button>
        )}
      </div>
    </div>
  );
});
