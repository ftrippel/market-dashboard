import { describe, expect, it } from 'vitest';
import { formatChartDate } from './chartDate';

describe('formatChartDate', () => {
  it('prefixes ISO dates with their abbreviated weekday', () => {
    expect(formatChartDate('2026-07-28')).toBe('Tue 2026-07-28');
  });

  it('formats business-day objects without applying a local timezone', () => {
    expect(formatChartDate({ year: 2026, month: 7, day: 28 })).toBe('Tue 2026-07-28');
  });
});
