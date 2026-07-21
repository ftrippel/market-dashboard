import { touchSettingsModified } from '../../services/settingsEvents';
import type { Watchlist, WatchlistStorage } from './types';

const STORAGE_KEY = 'agy_watchlists';

function createId(): string {
  return crypto.randomUUID();
}

function createDefaultWatchlist(): Watchlist {
  return {
    id: createId(),
    name: 'Default',
    items: [],
  };
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

    const activeId = parsed.watchlists.some((w) => w.id === parsed.activeId)
      ? parsed.activeId
      : parsed.watchlists[0].id;

    return {
      watchlists: parsed.watchlists.map((w) => ({
        id: w.id,
        name: w.name || 'Untitled',
        items: (w.items ?? []).map((item) => ({
          sym: item.sym.toUpperCase(),
          tags: item.tags ?? [],
          comment: item.comment ?? '',
        })),
      })),
      activeId,
    };
  } catch {
    const watchlist = createDefaultWatchlist();
    return { watchlists: [watchlist], activeId: watchlist.id };
  }
}

export function saveWatchlistStorage(state: WatchlistStorage): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  touchSettingsModified();
}

export function createWatchlist(name: string): Watchlist {
  return {
    id: createId(),
    name: name.trim() || 'Untitled',
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
