import { beforeEach, describe, expect, it } from 'vitest';
import type { WatchlistStorage } from './types';
import {
  createWatchlist,
  loadWatchlistStorage,
  moveWatchlistItem,
  persistWatchlistStorage,
} from './watchlistStorage';

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

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
});

function createStorage(): WatchlistStorage {
  return {
    activeId: 'source',
    watchlists: [
      {
        id: 'source',
        name: 'Source',
        comment: 'Source note',
        items: [
          {
            sym: 'AAPL',
            tags: ['Core', 'Tech'],
            comment: 'Preserve this symbol note',
          },
          { sym: 'MSFT', tags: [], comment: '' },
        ],
      },
      {
        id: 'target',
        name: 'Target',
        comment: 'Target note',
        items: [{ sym: 'NVDA', tags: ['AI'], comment: 'Existing item' }],
      },
    ],
  };
}

describe('moveWatchlistItem', () => {
  it('moves the complete item to the target watchlist', () => {
    const storage = createStorage();
    const moved = moveWatchlistItem(storage, 'source', 'target', 'AAPL');

    expect(moved.activeId).toBe('source');
    expect(moved.watchlists[0].items.map(({ sym }) => sym)).toEqual(['MSFT']);
    expect(moved.watchlists[1].items).toEqual([
      { sym: 'NVDA', tags: ['AI'], comment: 'Existing item' },
      {
        sym: 'AAPL',
        tags: ['Core', 'Tech'],
        comment: 'Preserve this symbol note',
      },
    ]);
    expect(moved.watchlists[0].comment).toBe('Source note');
    expect(moved.watchlists[1].comment).toBe('Target note');
  });

  it('does not overwrite an item that is already in the target watchlist', () => {
    const storage = createStorage();
    storage.watchlists[1].items.push({
      sym: 'AAPL',
      tags: ['Target version'],
      comment: 'Keep me',
    });

    expect(moveWatchlistItem(storage, 'source', 'target', 'AAPL')).toBe(storage);
  });

  it('does nothing for invalid source or target watchlists', () => {
    const storage = createStorage();

    expect(moveWatchlistItem(storage, 'missing', 'target', 'AAPL')).toBe(storage);
    expect(moveWatchlistItem(storage, 'source', 'missing', 'AAPL')).toBe(storage);
    expect(moveWatchlistItem(storage, 'source', 'source', 'AAPL')).toBe(storage);
  });
});

describe('watchlist name normalization', () => {
  it('uppercases newly created watchlist names', () => {
    expect(createWatchlist('  Growth picks  ').name).toBe('GROWTH PICKS');
  });

  it('normalizes names before persisting', () => {
    const storage = createStorage();
    persistWatchlistStorage(storage);

    const persisted = JSON.parse(localStorage.getItem('agy_watchlists') ?? '{}') as WatchlistStorage;
    expect(persisted.watchlists.map(({ name }) => name)).toEqual(['SOURCE', 'TARGET']);
  });

  it('migrates mixed-case names already in storage', () => {
    const storage = createStorage();
    localStorage.setItem('agy_watchlists', JSON.stringify(storage));

    const loaded = loadWatchlistStorage();
    const migrated = JSON.parse(localStorage.getItem('agy_watchlists') ?? '{}') as WatchlistStorage;

    expect(loaded.watchlists.map(({ name }) => name)).toEqual(['SOURCE', 'TARGET']);
    expect(migrated.watchlists.map(({ name }) => name)).toEqual(['SOURCE', 'TARGET']);
  });
});
