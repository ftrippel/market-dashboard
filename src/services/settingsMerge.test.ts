import { describe, expect, it } from 'vitest';
import type { Watchlist, WatchlistItem } from '../features/watchlist/types';
import type { PreferencesSettings } from './settingsBackup';
import { mergePreferencesForUpload, mergeWatchlistsForUpload } from './settingsMerge';

const BASE_PREFERENCES: PreferencesSettings = {
  theme: 'dark',
  enableHoverPreview: true,
  sparklineMode: 'line',
  marketColumns: ['d1', 'w1', 'hi52', 'ytd', 'spark', 'trend'],
  defaultMarketSortColumn: 'w1',
  chartMaSettings: [],
};

describe('mergePreferencesForUpload', () => {
  it('preserves remote columns when the pending local edit changed only the theme', () => {
    const local = { ...BASE_PREFERENCES, theme: 'light' as const };
    const remote = {
      ...BASE_PREFERENCES,
      marketColumns: ['d1', 'w1', 'm3', 'm6'] as PreferencesSettings['marketColumns'],
      defaultMarketSortColumn: 'm3' as const,
    };

    expect(mergePreferencesForUpload(BASE_PREFERENCES, local, remote)).toEqual({
      ...remote,
      theme: 'light',
    });
  });

  it('keeps the pending local value when both devices changed the same field', () => {
    const local = {
      ...BASE_PREFERENCES,
      marketColumns: ['d1', 'm3'] as PreferencesSettings['marketColumns'],
    };
    const remote = {
      ...BASE_PREFERENCES,
      marketColumns: ['w1', 'm6'] as PreferencesSettings['marketColumns'],
    };

    expect(mergePreferencesForUpload(BASE_PREFERENCES, local, remote).marketColumns).toEqual([
      'd1',
      'm3',
    ]);
  });
});

function item(sym: string, comment = ''): WatchlistItem {
  return { sym, tags: [], comment };
}

function payload(items: WatchlistItem[], comment = ''): { watchlists: Watchlist[] } {
  return { watchlists: [{ id: 'main', name: 'Main', comment, items }] };
}

function watchlists(...ids: string[]): { watchlists: Watchlist[] } {
  return {
    watchlists: ids.map((id) => ({ id, name: id.toUpperCase(), comment: '', items: [] })),
  };
}

describe('mergeWatchlistsForUpload', () => {
  it('preserves remote and local entries when an old device has no sync base', () => {
    const merged = mergeWatchlistsForUpload(null, payload([item('AAPL')]), payload([item('MSFT')]));

    expect(merged.watchlists[0].items.map(({ sym }) => sym)).toEqual(['MSFT', 'AAPL']);
  });

  it('keeps an intentional local deletion when remote data is unchanged', () => {
    const base = payload([item('AAPL'), item('MSFT')]);
    const merged = mergeWatchlistsForUpload(base, payload([item('MSFT')]), base);

    expect(merged.watchlists[0].items.map(({ sym }) => sym)).toEqual(['MSFT']);
  });

  it('keeps a remote deletion when the local copy did not change that entry', () => {
    const base = payload([item('AAPL'), item('MSFT')]);
    const local = payload([item('AAPL'), item('MSFT', 'local note')]);
    const remote = payload([item('MSFT')]);
    const merged = mergeWatchlistsForUpload(base, local, remote);

    expect(merged.watchlists[0].items).toEqual([item('MSFT', 'local note')]);
  });

  it('does not delete an entry concurrently edited on another device', () => {
    const base = payload([item('AAPL')]);
    const merged = mergeWatchlistsForUpload(
      base,
      payload([]),
      payload([item('AAPL', 'remote note')]),
    );

    expect(merged.watchlists[0].items).toEqual([item('AAPL', 'remote note')]);
  });

  it('preserves watchlists independently created on two devices', () => {
    const local = { watchlists: [{ id: 'local', name: 'Local', items: [item('AAPL')] }] };
    const remote = { watchlists: [{ id: 'remote', name: 'Remote', items: [item('MSFT')] }] };
    const merged = mergeWatchlistsForUpload(null, local, remote);

    expect(merged.watchlists.map(({ id }) => id)).toEqual(['remote', 'local']);
  });

  it('keeps a local tab reorder when the remote order is unchanged', () => {
    const base = watchlists('one', 'two', 'three');
    const local = watchlists('three', 'one', 'two');

    const merged = mergeWatchlistsForUpload(base, local, base);

    expect(merged.watchlists.map(({ id }) => id)).toEqual(['three', 'one', 'two']);
  });

  it('takes a remote tab reorder when the local order is unchanged', () => {
    const base = watchlists('one', 'two', 'three');
    const remote = watchlists('two', 'three', 'one');

    const merged = mergeWatchlistsForUpload(base, base, remote);

    expect(merged.watchlists.map(({ id }) => id)).toEqual(['two', 'three', 'one']);
  });

  it('retains remote tabs added while a local reorder is pending', () => {
    const base = watchlists('one', 'two', 'three');
    const local = watchlists('three', 'one', 'two');
    const remote = watchlists('one', 'two', 'three', 'remote');

    const merged = mergeWatchlistsForUpload(base, local, remote);

    expect(merged.watchlists.map(({ id }) => id)).toEqual(['three', 'one', 'two', 'remote']);
  });

  it('takes a remote watchlist comment when the local comment is unchanged', () => {
    const base = payload([item('AAPL')], 'Original');
    const remote = payload([item('AAPL')], 'Remote note');

    expect(mergeWatchlistsForUpload(base, base, remote).watchlists[0].comment).toBe(
      'Remote note',
    );
  });

  it('keeps a local watchlist comment when the remote comment is unchanged', () => {
    const base = payload([item('AAPL')], 'Original');
    const local = payload([item('AAPL')], 'Local note');

    expect(mergeWatchlistsForUpload(base, local, base).watchlists[0].comment).toBe('Local note');
  });
});
