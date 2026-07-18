export interface TimeValuePoint {
  time: string;
  value: number;
}

export function calculateSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, index) => {
    if (index < period - 1) return null;
    const slice = closes.slice(index - period + 1, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

export function calculateEMA(closes: number[], period: number): (number | null)[] {
  const ema: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return ema;

  const multiplier = 2 / (period + 1);
  let previousEma = closes.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  ema[period - 1] = previousEma;

  for (let index = period; index < closes.length; index++) {
    previousEma = (closes[index] - previousEma) * multiplier + previousEma;
    ema[index] = previousEma;
  }

  return ema;
}

export function buildIndicatorSeries(
  times: string[],
  values: (number | null)[],
): TimeValuePoint[] {
  const series: TimeValuePoint[] = [];
  for (let index = 0; index < times.length; index++) {
    const value = values[index];
    if (value == null) continue;
    series.push({ time: times[index], value });
  }
  return series;
}
