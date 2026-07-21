import type { Watchlist, WatchlistItem } from '../features/watchlist/types';
import type { WatchlistsSyncPayload } from './settingsBackup';

function contentEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeValue<T>(base: T, local: T, remote: T): T {
  if (contentEqual(local, base)) return remote;
  if (contentEqual(remote, base)) return local;
  return local;
}

function mergeTags(base: string[], local: string[], remote: string[]): string[] {
  const keys = new Set([...base, ...local, ...remote].map((tag) => tag.toLowerCase()));
  const result: string[] = [];

  for (const key of keys) {
    const baseTag = base.find((tag) => tag.toLowerCase() === key);
    const localTag = local.find((tag) => tag.toLowerCase() === key);
    const remoteTag = remote.find((tag) => tag.toLowerCase() === key);
    const baseHas = baseTag !== undefined;
    const localHas = localTag !== undefined;
    const remoteHas = remoteTag !== undefined;
    const keep = localHas === baseHas ? remoteHas : remoteHas === baseHas ? localHas : localHas;

    if (keep) result.push(localTag ?? remoteTag ?? baseTag ?? key);
  }

  return result;
}

function mergeItem(
  base: WatchlistItem | undefined,
  local: WatchlistItem | undefined,
  remote: WatchlistItem | undefined,
): WatchlistItem | undefined {
  if (!base) {
    if (!local) return remote;
    if (!remote) return local;
    return {
      sym: local.sym,
      tags: mergeTags([], local.tags ?? [], remote.tags ?? []),
      comment: local.comment || remote.comment || '',
    };
  }

  if (!local) return remote && !contentEqual(remote, base) ? remote : undefined;
  if (!remote) return !contentEqual(local, base) ? local : undefined;

  return {
    sym: local.sym,
    tags: mergeTags(base.tags ?? [], local.tags ?? [], remote.tags ?? []),
    comment: mergeValue(base.comment ?? '', local.comment ?? '', remote.comment ?? ''),
  };
}

function mergeItems(
  base: WatchlistItem[],
  local: WatchlistItem[],
  remote: WatchlistItem[],
): WatchlistItem[] {
  const baseBySymbol = new Map(base.map((item) => [item.sym, item]));
  const localBySymbol = new Map(local.map((item) => [item.sym, item]));
  const remoteBySymbol = new Map(remote.map((item) => [item.sym, item]));
  const symbols = [
    ...remote.map((item) => item.sym),
    ...local.map((item) => item.sym).filter((symbol) => !remoteBySymbol.has(symbol)),
  ];

  return symbols.flatMap((symbol) => {
    const item = mergeItem(
      baseBySymbol.get(symbol),
      localBySymbol.get(symbol),
      remoteBySymbol.get(symbol),
    );
    return item ? [item] : [];
  });
}

function mergeWatchlist(
  base: Watchlist | undefined,
  local: Watchlist | undefined,
  remote: Watchlist | undefined,
): Watchlist | undefined {
  if (!base) {
    if (!local) return remote;
    if (!remote) return local;
    return {
      id: local.id,
      name: local.name || remote.name,
      items: mergeItems([], local.items, remote.items),
    };
  }

  if (!local) return remote && !contentEqual(remote, base) ? remote : undefined;
  if (!remote) return !contentEqual(local, base) ? local : undefined;

  return {
    id: local.id,
    name: mergeValue(base.name, local.name, remote.name),
    items: mergeItems(base.items, local.items, remote.items),
  };
}

export function mergeWatchlistsForUpload(
  base: WatchlistsSyncPayload | null,
  local: WatchlistsSyncPayload,
  remote: WatchlistsSyncPayload,
): WatchlistsSyncPayload {
  const baseById = new Map((base?.watchlists ?? []).map((watchlist) => [watchlist.id, watchlist]));
  const localById = new Map(local.watchlists.map((watchlist) => [watchlist.id, watchlist]));
  const remoteById = new Map(remote.watchlists.map((watchlist) => [watchlist.id, watchlist]));
  const ids = [
    ...remote.watchlists.map((watchlist) => watchlist.id),
    ...local.watchlists.map((watchlist) => watchlist.id).filter((id) => !remoteById.has(id)),
  ];

  return {
    watchlists: ids.flatMap((id) => {
      const watchlist = mergeWatchlist(baseById.get(id), localById.get(id), remoteById.get(id));
      return watchlist ? [watchlist] : [];
    }),
  };
}
