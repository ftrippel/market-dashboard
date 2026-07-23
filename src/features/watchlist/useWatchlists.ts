import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsSync } from '../../context/SettingsSyncContext';
import {
  isRemoteSettingsAppliedEvent,
  REMOTE_SETTINGS_APPLIED_EVENT,
} from '../../services/settingsEvents';
import {
  createWatchlist,
  loadWatchlistStorage,
  moveWatchlistItem,
  normalizeSymbol,
  persistWatchlistStorage,
} from './watchlistStorage';
import { touchSettingsModified } from '../../services/settingsEvents';
import type { Watchlist, WatchlistItem, WatchlistStorage } from './types';

export function useWatchlists() {
  const { sessionReady } = useSettingsSync();
  const [storage, setStorage] = useState<WatchlistStorage>(() => loadWatchlistStorage());
  const hasHydratedWatchlists = useRef(false);
  const skipNextPersistRef = useRef(false);
  const prevWatchlistsJsonRef = useRef('');

  useEffect(() => {
    if (!hasHydratedWatchlists.current) {
      hasHydratedWatchlists.current = true;
      prevWatchlistsJsonRef.current = JSON.stringify(storage.watchlists);
      return;
    }
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      prevWatchlistsJsonRef.current = JSON.stringify(storage.watchlists);
      persistWatchlistStorage(storage);
      return;
    }

    const watchlistsJson = JSON.stringify(storage.watchlists);
    persistWatchlistStorage(storage);

    if (watchlistsJson === prevWatchlistsJsonRef.current) {
      return;
    }

    prevWatchlistsJsonRef.current = watchlistsJson;
    touchSettingsModified('watchlists');
  }, [storage]);

  useEffect(() => {
    if (!sessionReady) return;
    skipNextPersistRef.current = true;
    const next = loadWatchlistStorage();
    prevWatchlistsJsonRef.current = JSON.stringify(next.watchlists);
    setStorage(next);
  }, [sessionReady]);

  useEffect(() => {
    const handleRemoteApply = (event: Event) => {
      if (!isRemoteSettingsAppliedEvent(event) || event.detail.domain !== 'watchlists') return;
      skipNextPersistRef.current = true;
      const next = loadWatchlistStorage();
      prevWatchlistsJsonRef.current = JSON.stringify(next.watchlists);
      setStorage(next);
    };

    window.addEventListener(REMOTE_SETTINGS_APPLIED_EVENT, handleRemoteApply);
    return () => window.removeEventListener(REMOTE_SETTINGS_APPLIED_EVENT, handleRemoteApply);
  }, []);

  const activeWatchlist = useMemo(
    () => storage.watchlists.find((w) => w.id === storage.activeId) ?? storage.watchlists[0],
    [storage],
  );

  const setActiveId = useCallback(
    (id: string) => {
      const next = { ...storage, activeId: id };
      persistWatchlistStorage(next);
      setStorage(next);
    },
    [storage],
  );

  const createNewWatchlist = useCallback(
    (name: string) => {
      const watchlist = createWatchlist(name);
      const next = {
        watchlists: [...storage.watchlists, watchlist],
        activeId: watchlist.id,
      };
      persistWatchlistStorage(next);
      setStorage(next);
      return watchlist.id;
    },
    [storage.watchlists],
  );

  const deleteWatchlist = useCallback((id: string) => {
    setStorage((prev) => {
      if (prev.watchlists.length <= 1) return prev;
      const watchlists = prev.watchlists.filter((w) => w.id !== id);
      const activeId = prev.activeId === id ? watchlists[0].id : prev.activeId;
      return { watchlists, activeId };
    });
  }, []);

  const reorderWatchlists = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setStorage((prev) => {
      const fromIndex = prev.watchlists.findIndex((w) => w.id === fromId);
      const toIndex = prev.watchlists.findIndex((w) => w.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;

      const watchlists = [...prev.watchlists];
      const [moved] = watchlists.splice(fromIndex, 1);
      watchlists.splice(toIndex, 0, moved);
      return { ...prev, watchlists };
    });
  }, []);

  const renameWatchlist = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStorage((prev) => ({
      ...prev,
      watchlists: prev.watchlists.map((w) => (w.id === id ? { ...w, name: trimmed } : w)),
    }));
  }, []);

  const setWatchlistComment = useCallback((id: string, comment: string) => {
    setStorage((prev) => ({
      ...prev,
      watchlists: prev.watchlists.map((watchlist) =>
        watchlist.id === id ? { ...watchlist, comment } : watchlist,
      ),
    }));
  }, []);

  const addItem = useCallback((symInput: string, tags: string[], comment = '') => {
    const sym = normalizeSymbol(symInput);
    if (!sym) return false;

    setStorage((prev) => {
      const active = prev.watchlists.find((w) => w.id === prev.activeId);
      if (!active) return prev;

      if (active.items.some((item) => item.sym === sym)) return prev;

      const items = [...active.items, { sym, tags, comment: comment.trim() }];
      return {
        ...prev,
        watchlists: prev.watchlists.map((w) =>
          w.id === prev.activeId ? { ...w, items } : w,
        ),
      };
    });
    return true;
  }, []);

  const removeItem = useCallback((sym: string) => {
    setStorage((prev) => ({
      ...prev,
      watchlists: prev.watchlists.map((w) =>
        w.id === prev.activeId
          ? { ...w, items: w.items.filter((item) => item.sym !== sym) }
          : w,
      ),
    }));
  }, []);

  const moveItem = useCallback((sym: string, targetWatchlistId: string) => {
    setStorage((prev) =>
      moveWatchlistItem(prev, prev.activeId, targetWatchlistId, sym),
    );
  }, []);

  const setItemTags = useCallback((sym: string, tags: string[]) => {
    setStorage((prev) => ({
      ...prev,
      watchlists: prev.watchlists.map((w) =>
        w.id === prev.activeId
          ? {
              ...w,
              items: w.items.map((item) => (item.sym === sym ? { ...item, tags } : item)),
            }
          : w,
      ),
    }));
  }, []);

  const setItemComment = useCallback((sym: string, comment: string) => {
    setStorage((prev) => ({
      ...prev,
      watchlists: prev.watchlists.map((w) =>
        w.id === prev.activeId
          ? {
              ...w,
              items: w.items.map((item) =>
                item.sym === sym ? { ...item, comment: comment.trim() } : item,
              ),
            }
          : w,
      ),
    }));
  }, []);

  const allTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of activeWatchlist?.items ?? []) {
      for (const tag of item.tags) {
        const key = tag.toLowerCase();
        if (!seen.has(key)) seen.set(key, tag);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [activeWatchlist]);

  return {
    watchlists: storage.watchlists,
    activeWatchlist,
    activeId: storage.activeId,
    setActiveId,
    createNewWatchlist,
    deleteWatchlist,
    reorderWatchlists,
    renameWatchlist,
    setWatchlistComment,
    addItem,
    removeItem,
    moveItem,
    setItemTags,
    setItemComment,
    allTags,
  };
}

export type { Watchlist, WatchlistItem };
