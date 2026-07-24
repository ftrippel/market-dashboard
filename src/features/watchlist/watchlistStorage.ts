import { touchSettingsModified } from '../../services/settingsEvents';
import type { Watchlist, WatchlistStorage } from './types';

const STORAGE_KEY = 'agy_watchlists';
const DEFAULT_WATCHLIST_NAME = 'DEFAULT';
const UNTITLED_WATCHLIST_NAME = 'UNTITLED';

function createId(): string {
  return crypto.randomUUID();
}

function createDefaultWatchlist(): Watchlist {
  return {
    id: createId(),
    name: DEFAULT_WATCHLIST_NAME,
    comment: '',
    items: [],
  };
}

export function normalizeWatchlistName(name: string): string {
  return (name.trim() || UNTITLED_WATCHLIST_NAME).toUpperCase();
}

export function normalizeWatchlistStorage(state: WatchlistStorage): WatchlistStorage {
  const watchlists = state.watchlists.map((watchlist) => ({
    ...watchlist,
    name: normalizeWatchlistName(watchlist.name),
    comment: watchlist.comment ?? '',
    items: (watchlist.items ?? []).map((item) => ({
      sym: item.sym.toUpperCase(),
      tags: item.tags ?? [],
      comment: item.comment ?? '',
    })),
  }));
  const activeId = watchlists.some((watchlist) => watchlist.id === state.activeId)
    ? state.activeId
    : watchlists[0]?.id ?? state.activeId;

  return { watchlists, activeId };
}

export function createDefaultWatchlistStorage(): WatchlistStorage {
  const watchlist = createDefaultWatchlist();
  return { watchlists: [watchlist], activeId: watchlist.id };
}

export function loadWatchlistStorage(): WatchlistStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const watchlist = createDefaultWatchlist();
      return { watchlists: [watchlist], activeId: watchlist.id };
    }

    const parsed = JSON.parse(raw) as WatchlistStorage;
    if (!parsed.watchlists?.length) {
      const watchlist = createDefaultWatchlist();
      return { watchlists: [watchlist], activeId: watchlist.id };
    }

    const normalized = normalizeWatchlistStorage(parsed);
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    const watchlist = createDefaultWatchlist();
    return { watchlists: [watchlist], activeId: watchlist.id };
  }
}

export function persistWatchlistStorage(state: WatchlistStorage): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeWatchlistStorage(state)));
}

export function moveWatchlistItem(
  state: WatchlistStorage,
  sourceWatchlistId: string,
  targetWatchlistId: string,
  sym: string,
): WatchlistStorage {
  if (sourceWatchlistId === targetWatchlistId) return state;

  const source = state.watchlists.find((watchlist) => watchlist.id === sourceWatchlistId);
  const target = state.watchlists.find((watchlist) => watchlist.id === targetWatchlistId);
  const item = source?.items.find((candidate) => candidate.sym === sym);

  if (!source || !target || !item || target.items.some((candidate) => candidate.sym === sym)) {
    return state;
  }

  return {
    ...state,
    watchlists: state.watchlists.map((watchlist) => {
      if (watchlist.id === sourceWatchlistId) {
        return {
          ...watchlist,
          items: watchlist.items.filter((candidate) => candidate.sym !== sym),
        };
      }
      if (watchlist.id === targetWatchlistId) {
        return { ...watchlist, items: [...watchlist.items, item] };
      }
      return watchlist;
    }),
  };
}

export function renameWatchlistTag(
  state: WatchlistStorage,
  watchlistId: string,
  currentTag: string,
  newTag: string,
): WatchlistStorage {
  const trimmedTag = newTag.trim();
  if (!trimmedTag) return state;

  const currentKey = currentTag.toLowerCase();
  let changed = false;

  const watchlists = state.watchlists.map((watchlist) => {
    if (watchlist.id !== watchlistId) return watchlist;

    const items = watchlist.items.map((item) => {
      if (!item.tags.some((tag) => tag.toLowerCase() === currentKey)) return item;

      changed = true;
      const seen = new Set<string>();
      const tags: string[] = [];

      for (const tag of item.tags) {
        const renamedTag = tag.toLowerCase() === currentKey ? trimmedTag : tag;
        const key = renamedTag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(renamedTag);
      }

      return { ...item, tags };
    });

    return changed ? { ...watchlist, items } : watchlist;
  });

  return changed ? { ...state, watchlists } : state;
}

/** Replace watchlist storage entirely (used when applying cloud data). */
export function replaceWatchlistStorage(state: WatchlistStorage): void {
  localStorage.removeItem(STORAGE_KEY);
  persistWatchlistStorage(state);
}

export function saveWatchlistStorage(state: WatchlistStorage): void {
  persistWatchlistStorage(state);
  touchSettingsModified('watchlists');
}

export function createWatchlist(name: string): Watchlist {
  return {
    id: createId(),
    name: normalizeWatchlistName(name),
    comment: '',
    items: [],
  };
}

export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of input.split(',')) {
    const tag = part.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function normalizeSymbol(input: string): string {
  return input.trim().toUpperCase();
}
