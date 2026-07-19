import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, CrosshairMode, type MouseEventParams } from 'lightweight-charts';
import { fetchYahooFinanceOhlcHistory, type DailyOhlcPoint } from '../../services/api';
import { buildIndicatorSeries, calculateEMA, calculateSMA } from '../../utils/chartIndicators';
import { colors } from '../../utils/formatting';
import { blurActiveElement } from '../../utils/focus';
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

/** Long-press duration before the crosshair pins on touch. */
const TOUCH_CROSSHAIR_LONG_PRESS_MS = 450;
/** Movement beyond this cancels long-press and starts panning instead. */
const TOUCH_PAN_THRESHOLD_PX = 10;

type ChartInteractionMode = 'crosshair' | 'panning' | 'measuring';

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
  const setChartModeRef = useRef<(mode: ChartInteractionMode) => void>(() => {});
  const measureActionsRef = useRef<{
    enterMeasureMode: () => void;
    exitMeasureMode: () => void;
    clear: () => void;
  } | null>(null);
  const [data, setData] = useState<DailyOhlcPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [crosshairInfo, setCrosshairInfo] = useState<CrosshairInfo | null>(null);
  const [chartMode, setChartMode] = useState<ChartInteractionMode>('crosshair');
  const isYield = symbol === 'US10Y' || symbol === 'US30Y';
  const priceDecimals = isYield ? 3 : 2;

  setChartModeRef.current = setChartMode;

  const toggleMeasureTool = useCallback(() => {
    if (chartMode === 'measuring') {
      measureActionsRef.current?.exitMeasureMode();
      return;
    }
    measureActionsRef.current?.enterMeasureMode();
  }, [chartMode]);

  const handleMeasureButtonPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      toggleMeasureTool();
    },
    [toggleMeasureTool],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setCrosshairInfo(null);
    setChartMode('crosshair');

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

    let mode: ChartInteractionMode = 'crosshair';
    let measurePlacing = false;
    let suppressCrosshairUntilPointerUp = false;
    let crosshairPinned = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let touchPointerStart: { x: number; y: number } | null = null;
    let lastPointerType = 'mouse';
    const closeByTime = new Map(data.map((point, index) => [point.time, data[index - 1]?.close ?? null]));

    const isHoverPointer = (pointerType: string) => pointerType === 'pen' || pointerType === 'mouse';

    const canShowHoverCrosshair = () =>
      isHoverPointer(lastPointerType) || (lastPointerType === 'touch' && crosshairPinned);

    const cancelLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      touchPointerStart = null;
    };

    const updateCrosshairInfoFromParam = (param: MouseEventParams) => {
      if (!param.time || !param.point) {
        if (!crosshairPinned) setCrosshairInfo(null);
        return;
      }

      const barData = param.seriesData.get(candleSeries);
      if (!barData || !('close' in barData) || barData.close == null) {
        if (!crosshairPinned) setCrosshairInfo(null);
        return;
      }

      const date = String(param.time);
      const close = barData.close;
      const prevClose = closeByTime.get(date) ?? null;
      const changePct =
        prevClose !== null && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;

      setCrosshairInfo({ date, close, changePct });
    };

    const updateCrosshairInfoAtTime = (time: string, close: number) => {
      const prevClose = closeByTime.get(time) ?? null;
      const changePct =
        prevClose !== null && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;
      setCrosshairInfo({ date: time, close, changePct });
    };

    const resolveAnchorTime = (anchor: NonNullable<ReturnType<typeof createMeasureAnchor>>) => {
      if (anchor.time) return anchor.time;
      const index = Math.max(0, Math.min(data.length - 1, Math.round(anchor.logical)));
      return data[index]?.time ?? null;
    };

    const pinCrosshair = (anchor: NonNullable<ReturnType<typeof createMeasureAnchor>>) => {
      const time = resolveAnchorTime(anchor);
      if (!time) return;

      const bar = data.find((point) => point.time === time);

      crosshairPinned = true;
      applyModeEffects();
      chart.setCrosshairPosition(anchor.price, time, candleSeries);
      if (bar) updateCrosshairInfoAtTime(time, bar.close);
    };

    const unpinCrosshair = () => {
      crosshairPinned = false;
      chart.clearCrosshairPosition();
      setCrosshairInfo(null);
      applyModeEffects();
    };

    const applyModeEffects = () => {
      container.classList.remove(
        'tv-chart-mode-panning',
        'tv-chart-measure-armed',
        'tv-chart-measure-active',
      );

      const showCrosshair =
        mode === 'crosshair' &&
        !suppressCrosshairUntilPointerUp &&
        (crosshairPinned || canShowHoverCrosshair());

      chart.applyOptions({
        crosshair: {
          mode: showCrosshair ? CrosshairMode.Normal : CrosshairMode.Hidden,
        },
        handleScroll: mode === 'measuring' ? false : true,
      });

      if (!showCrosshair && !crosshairPinned) {
        chart.clearCrosshairPosition();
        setCrosshairInfo(null);
      }

      switch (mode) {
        case 'crosshair':
          container.style.cursor = '';
          measurePlacing = false;
          break;
        case 'panning':
          container.classList.add('tv-chart-mode-panning');
          container.style.cursor = 'grabbing';
          break;
        case 'measuring':
          container.style.cursor = 'crosshair';
          container.classList.add(
            measurePlacing ? 'tv-chart-measure-active' : 'tv-chart-measure-armed',
          );
          break;
      }

      setChartModeRef.current(mode);
    };

    const setMode = (next: ChartInteractionMode) => {
      if (next !== 'crosshair') {
        cancelLongPress();
        crosshairPinned = false;
        setCrosshairInfo(null);
      }
      mode = next;
      applyModeEffects();
    };

    const onCrosshairMove = (param: MouseEventParams) => {
      if (suppressCrosshairUntilPointerUp) return;
      if (mode !== 'crosshair') return;
      if (lastPointerType === 'touch' && !crosshairPinned) return;
      updateCrosshairInfoFromParam(param);
    };

    chart.subscribeCrosshairMove(onCrosshairMove);

    const getLocalPoint = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      return {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    };

    const clearMeasurement = () => {
      measurePrimitive.clear();
      measurePlacing = false;
    };

    const exitMeasureMode = () => {
      clearMeasurement();
      crosshairPinned = false;
      setMode('crosshair');
      blurActiveElement();
    };

    const enterMeasureMode = () => {
      clearMeasurement();
      cancelLongPress();
      crosshairPinned = false;
      chart.clearCrosshairPosition();
      setCrosshairInfo(null);
      setMode('measuring');
    };

    const completeMeasurement = (anchor: NonNullable<ReturnType<typeof createMeasureAnchor>>) => {
      const start = measurePrimitive.getStart();
      if (start) {
        measurePrimitive.setMeasurement(start, anchor);
      }
      clearMeasurement();
      suppressCrosshairUntilPointerUp = true;
      setMode('crosshair');
      blurActiveElement();
    };

    const startMeasurement = (anchor: NonNullable<ReturnType<typeof createMeasureAnchor>>) => {
      measurePlacing = true;
      measurePrimitive.setMeasurement(anchor, anchor);
      setMode('measuring');
    };

    measureActionsRef.current = {
      enterMeasureMode,
      exitMeasureMode,
      clear: clearMeasurement,
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (suppressCrosshairUntilPointerUp) return;

      lastPointerType = event.pointerType;

      const point = getLocalPoint(event);
      const anchor = createMeasureAnchor(chart, candleSeries, point.x, point.y);
      if (!anchor) return;

      if (mode === 'crosshair' && event.shiftKey) {
        cancelLongPress();
        startMeasurement(anchor);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (mode === 'measuring') {
        cancelLongPress();
        if (!measurePlacing) {
          startMeasurement(anchor);
        } else {
          completeMeasurement(anchor);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (mode === 'crosshair' && event.pointerType === 'touch') {
        if (crosshairPinned) {
          unpinCrosshair();
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        applyModeEffects();
        touchPointerStart = point;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          const pressPoint = touchPointerStart;
          touchPointerStart = null;
          if (!pressPoint) return;

          const pressAnchor = createMeasureAnchor(chart, candleSeries, pressPoint.x, pressPoint.y);
          if (pressAnchor) pinCrosshair(pressAnchor);
        }, TOUCH_CROSSHAIR_LONG_PRESS_MS);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (mode === 'crosshair') {
        cancelLongPress();
        setMode('panning');
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (isHoverPointer(event.pointerType)) {
        const reenableHover = lastPointerType === 'touch' && mode === 'crosshair' && !crosshairPinned;
        lastPointerType = event.pointerType;
        if (reenableHover && !suppressCrosshairUntilPointerUp) {
          applyModeEffects();
        }
      }

      if (longPressTimer !== null && touchPointerStart && event.pointerType === 'touch') {
        const point = getLocalPoint(event);
        const dx = point.x - touchPointerStart.x;
        const dy = point.y - touchPointerStart.y;
        if (Math.hypot(dx, dy) > TOUCH_PAN_THRESHOLD_PX) {
          cancelLongPress();
          setMode('panning');
        }
        return;
      }

      if (mode === 'measuring' && measurePlacing) {
        const point = getLocalPoint(event);
        const anchor = createMeasureAnchor(chart, candleSeries, point.x, point.y);
        const start = measurePrimitive.getStart();
        if (!anchor || !start) return;

        measurePrimitive.setMeasurement(start, anchor);
        event.preventDefault();
        return;
      }

      if (mode === 'panning') {
        chart.clearCrosshairPosition();
        setCrosshairInfo(null);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0) return;

      if (longPressTimer !== null) {
        cancelLongPress();
      }

      if (suppressCrosshairUntilPointerUp) {
        suppressCrosshairUntilPointerUp = false;
        applyModeEffects();
        chart.clearCrosshairPosition();
        setCrosshairInfo(null);
        return;
      }

      if (mode === 'panning') {
        setMode('crosshair');
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (mode === 'measuring') {
        exitMeasureMode();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (mode === 'crosshair' && crosshairPinned) {
        unpinCrosshair();
        event.preventDefault();
        event.stopPropagation();
      }
    };

    container.addEventListener('pointerdown', onPointerDown, { capture: true });
    container.addEventListener('pointermove', onPointerMove, { capture: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
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
      cancelLongPress();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      resizeObserver.disconnect();
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      container.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown, true);
      container.classList.remove(
        'tv-chart-mode-panning',
        'tv-chart-measure-armed',
        'tv-chart-measure-active',
      );
      container.style.cursor = '';
      measureActionsRef.current = null;
      chart.remove();
    };
  }, [data, theme, onReady]);

  const isMeasuring = chartMode === 'measuring';

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
