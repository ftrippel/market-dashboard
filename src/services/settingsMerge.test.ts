import { describe, expect, it } from 'vitest';
import type { Watchlist, WatchlistItem } from '../features/watchlist/types';
import { mergeWatchlistsForUpload } from './settingsMerge';

function item(sym: string, comment = ''): WatchlistItem {
  return { sym, tags: [], comment };
}

function payload(items: WatchlistItem[], comment = ''): { watchlists: Watchlist[] } {
  return { watchlists: [{ id: 'main', name: 'Main', comment, items }] };
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
