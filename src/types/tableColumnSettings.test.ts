import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARKET_COLUMNS,
  parseMarketColumns,
  resolveDefaultSortColumn,
  resolveMarketColumns,
} from './tableColumnSettings';

describe('table column settings', () => {
  it('uses the legacy standard columns when settings are absent', () => {
    expect(parseMarketColumns(undefined)).toEqual(DEFAULT_MARKET_COLUMNS);
  });

  it('normalizes configured columns into canonical display order', () => {
    expect(parseMarketColumns(['trend', 'm3', 'd1', 'm3', 'invalid'])).toEqual([
      'd1',
      'm3',
      'trend',
    ]);
  });

  it('merges standard and section-specific columns without duplicates', () => {
    expect(resolveMarketColumns(['d1', 'm1'], ['price', 'spark', 'd1'])).toEqual([
      'price',
      'd1',
      'm1',
      'spark',
    ]);
  });

  it('falls back to a visible sortable column and then name', () => {
    expect(resolveDefaultSortColumn('m6', ['d1', 'spark'])).toBe('d1');
    expect(resolveDefaultSortColumn('m6', ['spark'])).toBe('name');
  });
});
