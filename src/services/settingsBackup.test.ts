import { beforeEach, describe, expect, it } from 'vitest';
import { loadWatchlistStorage } from '../features/watchlist/watchlistStorage';
import {
  applyWatchlistsFromSync,
  parseWatchlistsSyncPayload,
  watchlistNamesNeedNormalization,
  watchlistsContentEqual,
} from './settingsBackup';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const first = { id: 'first', name: 'First', items: [] };
const second = { id: 'second', name: 'Second', items: [] };

describe('applyWatchlistsFromSync', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it('preserves the locally active watchlist when it still exists', () => {
    localStorage.setItem(
      'agy_watchlists',
      JSON.stringify({ watchlists: [first, second], activeId: 'second' }),
    );

    applyWatchlistsFromSync({ watchlists: [first, second] }, { source: 'local' });

    expect(loadWatchlistStorage().activeId).toBe('second');
  });

  it('falls back to the first watchlist only when the active one was deleted', () => {
    localStorage.setItem(
      'agy_watchlists',
      JSON.stringify({ watchlists: [first, second], activeId: 'second' }),
    );

    applyWatchlistsFromSync({ watchlists: [first] }, { source: 'local' });

    expect(loadWatchlistStorage().activeId).toBe('first');
  });

  it('loads older synced watchlists without a comment', () => {
    const parsed = parseWatchlistsSyncPayload({ watchlists: [first] });

    expect(parsed?.watchlists[0].comment).toBe('');
  });

  it('normalizes mixed-case synced watchlist names', () => {
    const payload = {
      watchlists: [{ ...first, name: 'Growth Picks' }],
    };
    const parsed = parseWatchlistsSyncPayload(payload);

    expect(parsed?.watchlists[0].name).toBe('GROWTH PICKS');
    expect(watchlistNamesNeedNormalization(payload)).toBe(true);
    expect(watchlistNamesNeedNormalization(parsed)).toBe(false);
  });

  it('treats reordered Firestore fields as identical watchlist content', () => {
    const local = [{ id: 'first', name: 'First', comment: 'Note', items: [] }];
    const remote = [{ comment: 'Note', items: [], name: 'First', id: 'first' }];

    expect(watchlistsContentEqual(local, remote)).toBe(true);
  });

  it('preserves line breaks in individual symbol comments', () => {
    const parsed = parseWatchlistsSyncPayload({
      watchlists: [
        {
          ...first,
          items: [{ sym: 'AAPL', tags: [], comment: 'First line\nSecond line' }],
        },
      ],
    });

    expect(parsed?.watchlists[0].items[0].comment).toBe('First line\nSecond line');
  });
});
