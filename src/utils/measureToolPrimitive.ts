import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  Coordinate,
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';

export interface MeasureAnchor {
  logical: number;
  time: string | null;
  price: number;
}

export interface MeasureStats {
  priceDelta: number;
  percentChange: number;
  barCount: number;
  daySpan: number | null;
}

interface ViewPoint {
  x: Coordinate | null;
  y: Coordinate | null;
}

interface MeasureTheme {
  upFill: string;
  downFill: string;
  lineColor: string;
  labelText: string;
  endpointColor: string;
}

const THEMES: Record<'light' | 'dark', MeasureTheme> = {
  dark: {
    upFill: 'rgba(38, 166, 154, 0.18)',
    downFill: 'rgba(239, 83, 80, 0.18)',
    lineColor: '#9aa5b4',
    labelText: '#e6edf3',
    endpointColor: '#9aa5b4',
  },
  light: {
    upFill: 'rgba(8, 153, 129, 0.15)',
    downFill: 'rgba(242, 54, 69, 0.15)',
    lineColor: '#686d78',
    labelText: '#131722',
    endpointColor: '#686d78',
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function placeLabelOutsideMeasureArea(
  left: number,
  right: number,
  top: number,
  bottom: number,
  boxWidth: number,
  boxHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  gap: number,
  margin: number,
): { boxX: number; boxY: number } {
  const centeredX = (left + right) / 2 - boxWidth / 2;
  const centeredY = (top + bottom) / 2 - boxHeight / 2;

  const placements = [
    { boxX: centeredX, boxY: top - boxHeight - gap },
    { boxX: centeredX, boxY: bottom + gap },
    { boxX: right + gap, boxY: centeredY },
    { boxX: left - boxWidth - gap, boxY: centeredY },
  ];

  for (const placement of placements) {
    const fitsHorizontally =
      placement.boxX >= margin && placement.boxX + boxWidth <= canvasWidth - margin;
    const fitsVertically =
      placement.boxY >= margin && placement.boxY + boxHeight <= canvasHeight - margin;
    if (fitsHorizontally && fitsVertically) {
      return placement;
    }
  }

  return {
    boxX: clamp(centeredX, margin, canvasWidth - boxWidth - margin),
    boxY: clamp(top - boxHeight - gap, margin, canvasHeight - boxHeight - margin),
  };
}

class MeasurePaneRenderer implements IPrimitivePaneRenderer {
  private _p1: ViewPoint;
  private _p2: ViewPoint;
  private _stats: MeasureStats;
  private _theme: MeasureTheme;

  constructor(p1: ViewPoint, p2: ViewPoint, stats: MeasureStats, theme: MeasureTheme) {
    this._p1 = p1;
    this._p2 = p2;
    this._stats = stats;
    this._theme = theme;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (
      this._p1.x === null ||
      this._p1.y === null ||
      this._p2.x === null ||
      this._p2.y === null
    ) {
      return;
    }

    const stats = this._stats;
    const theme = this._theme;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const x1 = this._p1.x! * scope.horizontalPixelRatio;
      const y1 = this._p1.y! * scope.verticalPixelRatio;
      const x2 = this._p2.x! * scope.horizontalPixelRatio;
      const y2 = this._p2.y! * scope.verticalPixelRatio;

      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      const isUp = stats.priceDelta >= 0;
      const areaFill = isUp ? theme.upFill : theme.downFill;

      ctx.fillStyle = areaFill;
      ctx.fillRect(left, top, right - left, bottom - top);

      ctx.strokeStyle = theme.lineColor;
      ctx.lineWidth = Math.max(1, scope.horizontalPixelRatio);
      ctx.setLineDash([4 * scope.horizontalPixelRatio, 4 * scope.horizontalPixelRatio]);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y1);
      ctx.moveTo(x2, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const radius = 4 * scope.horizontalPixelRatio;
      for (const [x, y] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath();
        ctx.fillStyle = theme.endpointColor;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const sign = stats.priceDelta >= 0 ? '+' : '';
      const priceLine = `${sign}${stats.priceDelta.toFixed(2)} (${sign}${stats.percentChange.toFixed(2)}%)`;
      const barsLine = `${stats.barCount} bar${stats.barCount === 1 ? '' : 's'}`;
      const timeLine =
        stats.daySpan !== null
          ? `${stats.daySpan} day${stats.daySpan === 1 ? '' : 's'}`
          : null;

      const fontSize = Math.round(11 * scope.verticalPixelRatio);
      ctx.font = `${fontSize}px IBM Plex Mono, monospace`;
      const lines = timeLine ? [priceLine, barsLine, timeLine] : [priceLine, barsLine];
      const lineHeight = fontSize + 2 * scope.verticalPixelRatio;
      const paddingX = 8 * scope.horizontalPixelRatio;
      const paddingY = 6 * scope.verticalPixelRatio;
      const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = lines.length * lineHeight + paddingY * 2;
      const gap = 6 * scope.verticalPixelRatio;
      const margin = 4 * scope.verticalPixelRatio;
      const { boxX, boxY } = placeLabelOutsideMeasureArea(
        left,
        right,
        top,
        bottom,
        boxWidth,
        boxHeight,
        scope.bitmapSize.width,
        scope.bitmapSize.height,
        gap,
        margin,
      );

      ctx.fillStyle = areaFill;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4 * scope.horizontalPixelRatio);
      ctx.fill();

      ctx.fillStyle = theme.labelText;
      ctx.textBaseline = 'top';
      lines.forEach((line, index) => {
        ctx.fillText(line, boxX + paddingX, boxY + paddingY + index * lineHeight);
      });
    });
  }
}

class MeasurePaneView implements IPrimitivePaneView {
  private _p1: ViewPoint = { x: null, y: null };
  private _p2: ViewPoint = { x: null, y: null };
  private _stats: MeasureStats | null = null;
  private _source: MeasureToolPrimitive;

  constructor(source: MeasureToolPrimitive) {
    this._source = source;
  }

  update(): void {
    const start = this._source.getStart();
    const end = this._source.getEnd();
    if (!start || !end) {
      this._p1 = { x: null, y: null };
      this._p2 = { x: null, y: null };
      this._stats = null;
      return;
    }

    this._p1 = this._source.toViewPoint(start);
    this._p2 = this._source.toViewPoint(end);
    this._stats = this._source.getStats();
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._p1.x === null || this._p2.x === null || !this._stats) return null;
    return new MeasurePaneRenderer(this._p1, this._p2, this._stats, this._source.getTheme());
  }
}

export function createMeasureAnchor(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  x: number,
  y: number,
): MeasureAnchor | null {
  const price = series.coordinateToPrice(y as Coordinate);
  const logical = chart.timeScale().coordinateToLogical(x as Coordinate);
  if (price === null || logical === null) return null;

  const time = chart.timeScale().coordinateToTime(x as Coordinate);
  return {
    logical,
    time: typeof time === 'string' ? time : null,
    price,
  };
}

export function calcMeasureStats(start: MeasureAnchor, end: MeasureAnchor): MeasureStats {
  const priceDelta = end.price - start.price;
  const percentChange = start.price !== 0 ? (priceDelta / start.price) * 100 : 0;
  const barCount = Math.abs(Math.round(end.logical - start.logical));

  let daySpan: number | null = null;
  if (start.time && end.time) {
    const ms = Math.abs(new Date(end.time).getTime() - new Date(start.time).getTime());
    daySpan = Math.round(ms / 86_400_000);
  }

  return { priceDelta, percentChange, barCount, daySpan };
}

export class MeasureToolPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<'Candlestick'> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _start: MeasureAnchor | null = null;
  private _end: MeasureAnchor | null = null;
  private _themeName: 'light' | 'dark' = 'dark';
  private readonly _paneViews: MeasurePaneView[];

  constructor(theme: 'light' | 'dark' = 'dark') {
    this._themeName = theme;
    this._paneViews = [new MeasurePaneView(this)];
  }

  setTheme(theme: 'light' | 'dark'): void {
    this._themeName = theme;
    this._requestUpdate?.();
  }

  getTheme(): MeasureTheme {
    return THEMES[this._themeName];
  }

  getStart(): MeasureAnchor | null {
    return this._start;
  }

  getEnd(): MeasureAnchor | null {
    return this._end;
  }

  getStats(): MeasureStats | null {
    if (!this._start || !this._end) return null;
    return calcMeasureStats(this._start, this._end);
  }

  hasMeasurement(): boolean {
    return this._start !== null && this._end !== null;
  }

  setMeasurement(start: MeasureAnchor, end: MeasureAnchor): void {
    this._start = start;
    this._end = end;
    this._requestUpdate?.();
  }

  clear(): void {
    this._start = null;
    this._end = null;
    this._requestUpdate?.();
  }

  toViewPoint(anchor: MeasureAnchor): ViewPoint {
    if (!this._chart || !this._series) {
      return { x: null, y: null };
    }

    const y = this._series.priceToCoordinate(anchor.price);
    let x: Coordinate | null = null;
    if (anchor.time) {
      x = this._chart.timeScale().timeToCoordinate(anchor.time as Time);
    }
    if (x === null) {
      x = this._chart.timeScale().logicalToCoordinate(anchor.logical as Logical);
    }

    return { x, y };
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart;
    this._series = param.series as ISeriesApi<'Candlestick'>;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews(): void {
    this._paneViews.forEach((view) => view.update());
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }
}
