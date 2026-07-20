import { CrosshairMode, type IChartApi, type ISeriesApi, type MouseEventParams } from 'lightweight-charts';
import type { DailyOhlcPoint } from '../services/api';
import { blurActiveElement } from './focus';
import { createMeasureAnchor, type MeasureToolPrimitive } from './measureToolPrimitive';

export type ChartInteractionMode = 'crosshair' | 'panning' | 'measuring';

export interface CrosshairInfo {
  date: string;
  close: number;
  changePct: number | null;
}

export function buildLastTradeCrosshairInfo(data: DailyOhlcPoint[]): CrosshairInfo | null {
  const last = data.at(-1);
  if (!last) return null;

  const prevClose = data.at(-2)?.close ?? null;
  const changePct =
    prevClose !== null && prevClose !== 0 ? ((last.close - prevClose) / prevClose) * 100 : null;

  return { date: last.time, close: last.close, changePct };
}

/** Long-press duration before the crosshair pins on touch. */
const TOUCH_CROSSHAIR_LONG_PRESS_MS = 450;
/** Movement beyond this cancels long-press and starts panning instead. */
const TOUCH_PAN_THRESHOLD_PX = 10;
/** Movement beyond this completes a measure drag on pointer up. */
const MEASURE_DRAG_THRESHOLD_PX = 6;

export interface ChartInteractionUi {
  mode: ChartInteractionMode;
  toggleMeasureMode: () => void;
}

export interface ChartInteractionControllerOptions {
  container: HTMLElement;
  chart: IChartApi;
  candleSeries: ISeriesApi<'Candlestick'>;
  measurePrimitive: MeasureToolPrimitive;
  data: DailyOhlcPoint[];
  onCrosshairInfoChange: (info: CrosshairInfo | null) => void;
  onUiChange: (ui: ChartInteractionUi) => void;
}

export interface ChartInteractionController {
  dispose: () => void;
}

export function createChartInteractionController({
  container,
  chart,
  candleSeries,
  measurePrimitive,
  data,
  onCrosshairInfoChange,
  onUiChange,
}: ChartInteractionControllerOptions): ChartInteractionController {
  let mode: ChartInteractionMode = 'crosshair';
  let measurePlacing = false;
  let measureDragged = false;
  let measurePointerStart: { x: number; y: number } | null = null;
  let suppressCrosshairUntilPointerUp = false;
  let crosshairPinned = false;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let touchPointerStart: { x: number; y: number } | null = null;
  let chartPointerDown = false;
  let lastPointerType = 'mouse';

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest('button, a, input, textarea, select, label, [role="button"]') !== null;

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

  const buildCrosshairInfo = (time: string, close: number): CrosshairInfo => {
    const prevClose = closeByTime.get(time) ?? null;
    const changePct =
      prevClose !== null && prevClose !== 0 ? ((close - prevClose) / prevClose) * 100 : null;
    return { date: time, close, changePct };
  };

  const updateCrosshairInfoFromParam = (param: MouseEventParams) => {
    if (!param.time || !param.point) {
      if (!crosshairPinned) onCrosshairInfoChange(null);
      return;
    }

    const barData = param.seriesData.get(candleSeries);
    if (!barData || !('close' in barData) || barData.close == null) {
      if (!crosshairPinned) onCrosshairInfoChange(null);
      return;
    }

    onCrosshairInfoChange(buildCrosshairInfo(String(param.time), barData.close));
  };

  const updateCrosshairInfoAtTime = (time: string, close: number) => {
    onCrosshairInfoChange(buildCrosshairInfo(time, close));
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
    onCrosshairInfoChange(null);
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
      onCrosshairInfoChange(null);
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

    onUiChange({ mode, toggleMeasureMode });
  };

  const setMode = (next: ChartInteractionMode) => {
    if (next !== 'crosshair') {
      cancelLongPress();
      crosshairPinned = false;
      onCrosshairInfoChange(null);
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
    measureDragged = false;
    measurePointerStart = null;
  };

  const exitMeasureMode = () => {
    clearMeasurement();
    crosshairPinned = false;
    suppressCrosshairUntilPointerUp = false;
    setMode('crosshair');
    blurActiveElement();
  };

  const enterMeasureMode = () => {
    clearMeasurement();
    cancelLongPress();
    crosshairPinned = false;
    chart.clearCrosshairPosition();
    onCrosshairInfoChange(null);
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

  const toggleMeasureMode = () => {
    if (mode === 'measuring') exitMeasureMode();
    else enterMeasureMode();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (suppressCrosshairUntilPointerUp) return;
    if (isInteractiveTarget(event.target)) return;

    lastPointerType = event.pointerType;

    const point = getLocalPoint(event);
    const anchor = createMeasureAnchor(chart, candleSeries, point.x, point.y);
    if (!anchor) return;

    chartPointerDown = true;

    if (mode === 'crosshair' && event.shiftKey) {
      cancelLongPress();
      startMeasurement(anchor);
      measurePointerStart = point;
      measureDragged = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (mode === 'measuring') {
      cancelLongPress();
      if (!measurePlacing) {
        startMeasurement(anchor);
        measurePointerStart = point;
        measureDragged = false;
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

    if (mode === 'crosshair' && event.pointerType === 'pen') {
      cancelLongPress();
      touchPointerStart = point;
      return;
    }

    if (mode === 'crosshair') {
      cancelLongPress();
      setMode('panning');
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (isHoverPointer(event.pointerType)) {
      const reenableHover =
        (lastPointerType === 'touch' || lastPointerType === 'pen') &&
        mode === 'crosshair' &&
        !crosshairPinned;
      lastPointerType = event.pointerType;
      if (reenableHover && !suppressCrosshairUntilPointerUp) {
        applyModeEffects();
      }
    }

    if (touchPointerStart && (event.pointerType === 'touch' || event.pointerType === 'pen')) {
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

      if (measurePointerStart) {
        const dx = point.x - measurePointerStart.x;
        const dy = point.y - measurePointerStart.y;
        if (Math.hypot(dx, dy) > MEASURE_DRAG_THRESHOLD_PX) {
          measureDragged = true;
        }
      }

      measurePrimitive.setMeasurement(start, anchor);
      event.preventDefault();
      return;
    }

    if (mode === 'panning') {
      chart.clearCrosshairPosition();
      onCrosshairInfoChange(null);
    }
  };

  const finishMeasureDrag = (event: PointerEvent) => {
    if (mode !== 'measuring' || !measurePlacing || !measureDragged) return false;

    const point = getLocalPoint(event);
    const anchor = createMeasureAnchor(chart, candleSeries, point.x, point.y);
    if (!anchor) return false;

    completeMeasurement(anchor);
    return true;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return;

    const fromChart = chartPointerDown;
    if (chartPointerDown) chartPointerDown = false;

    if (fromChart && finishMeasureDrag(event)) {
      suppressCrosshairUntilPointerUp = false;
      applyModeEffects();
      chart.clearCrosshairPosition();
      onCrosshairInfoChange(null);
      return;
    }

    if (fromChart && longPressTimer !== null) {
      cancelLongPress();
    } else if (fromChart && touchPointerStart !== null) {
      touchPointerStart = null;
    }

    if (suppressCrosshairUntilPointerUp) {
      suppressCrosshairUntilPointerUp = false;
      applyModeEffects();
      chart.clearCrosshairPosition();
      onCrosshairInfoChange(null);
      return;
    }

    if (fromChart && mode === 'panning') {
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

  onUiChange({ mode, toggleMeasureMode });

  return {
    dispose: () => {
      cancelLongPress();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
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
    },
  };
}
