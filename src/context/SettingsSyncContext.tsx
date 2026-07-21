import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  applyRemoteIfNewer,
  reconcileSettings,
  subscribeToRemoteSettings,
  uploadDomain,
  type SettingsDomain,
  type SettingsSyncResult,
} from '../services/settingsSync';
import { isSettingsChangedEvent, SETTINGS_CHANGED_EVENT } from '../services/settingsEvents';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface SettingsSyncContextValue {
  enabled: boolean;
  status: SyncStatus;
  statusMessage: string | null;
  lastSyncedAt: Date | null;
  lastSyncResult: SettingsSyncResult | null;
  syncNow: () => Promise<void>;
}

const SettingsSyncContext = createContext<SettingsSyncContextValue | null>(null);

const UPLOAD_DEBOUNCE_MS = 1500;

function formatLastSyncedAt(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildStatusMessage(result: SettingsSyncResult, lastSyncedAt: Date | null): string {
  const stamp = formatLastSyncedAt(lastSyncedAt);
  const suffix = stamp ? ` Last synced ${stamp}.` : '';

  switch (result) {
    case 'uploaded':
      return `Settings saved to cloud.${suffix}`;
    case 'downloaded':
      return `Cloud settings applied.${suffix}`;
    case 'mixed':
      return `Settings synced.${suffix}`;
    case 'unchanged':
    default:
      return `Settings are up to date.${suffix}`;
  }
}

export function SettingsSyncProvider({ children }: { children: ReactNode }) {
  const { configured, user } = useAuth();
  const enabled = configured && user !== null;
  const userId = user?.uid ?? null;

  const [status, setStatus] = useState<SyncStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SettingsSyncResult | null>(null);

  const uploadTimersRef = useRef<Partial<Record<SettingsDomain, number>>>({});
  const pendingUploadsRef = useRef<Set<SettingsDomain>>(new Set());
  const syncingRef = useRef(false);
  const initialReconcileDoneRef = useRef(false);

  const markSynced = useCallback((result: SettingsSyncResult) => {
    const now = new Date();
    setLastSyncedAt(now);
    setLastSyncResult(result);
    setStatus('synced');
    setStatusMessage(buildStatusMessage(result, now));
  }, []);

  const runUpload = useCallback(
    async (domains: SettingsDomain[]) => {
      if (!userId || domains.length === 0) return;

      const uniqueDomains = [...new Set(domains)];

      if (syncingRef.current) {
        for (const domain of uniqueDomains) {
          pendingUploadsRef.current.add(domain);
        }
        return;
      }

      syncingRef.current = true;
      setStatus('syncing');
      setStatusMessage('Saving to cloud…');

      try {
        await Promise.all(uniqueDomains.map((domain) => uploadDomain(userId, domain)));
        markSynced('uploaded');
      } catch (err) {
        setStatus('error');
        setStatusMessage(err instanceof Error ? err.message : 'Cloud sync failed.');
      } finally {
        syncingRef.current = false;
        const pending = [...pendingUploadsRef.current];
        pendingUploadsRef.current.clear();
        if (pending.length > 0) {
          void runUpload(pending);
        }
      }
    },
    [markSynced, userId],
  );

  const flushPendingUploads = useCallback(() => {
    const pending = [...pendingUploadsRef.current];
    if (pending.length === 0) return;
    pendingUploadsRef.current.clear();
    void runUpload(pending);
  }, [runUpload]);

  const runReconcile = useCallback(async () => {
    if (!userId || syncingRef.current) return;

    syncingRef.current = true;
    setStatus('syncing');
    setStatusMessage('Syncing with cloud…');

    try {
      const result = await reconcileSettings(userId);
      markSynced(result);
    } catch (err) {
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Cloud sync failed.');
    } finally {
      syncingRef.current = false;
      flushPendingUploads();
    }
  }, [flushPendingUploads, markSynced, userId]);

  const syncNow = useCallback(async () => {
    await runReconcile();
  }, [runReconcile]);

  useEffect(() => {
    if (!userId) {
      initialReconcileDoneRef.current = false;
      setStatus('idle');
      setStatusMessage(null);
      setLastSyncedAt(null);
      setLastSyncResult(null);
      return;
    }

    if (initialReconcileDoneRef.current) return;

    initialReconcileDoneRef.current = true;
    void runReconcile();
  }, [runReconcile, userId]);

  useEffect(() => {
    if (!userId) return;

    return subscribeToRemoteSettings(userId, (domain, data, updatedAt) => {
      const applied = applyRemoteIfNewer(domain, data, updatedAt);
      if (!applied) return;

      const now = new Date();
      setLastSyncedAt(now);
      setLastSyncResult('downloaded');
      setStatus('synced');
      setStatusMessage(buildStatusMessage('downloaded', now));
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let hiddenAt: number | null = null;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();

        const domainsFromTimers = Object.keys(uploadTimersRef.current) as SettingsDomain[];
        for (const timer of Object.values(uploadTimersRef.current)) {
          if (timer !== undefined) window.clearTimeout(timer);
        }
        uploadTimersRef.current = {};
        if (domainsFromTimers.length > 0) {
          void runUpload(domainsFromTimers);
        }
        return;
      }

      if (document.visibilityState !== 'visible') return;

      const awayMs = hiddenAt !== null ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      if (awayMs >= 2000) {
        void runReconcile();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void runReconcile();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [runReconcile, userId]);

  useEffect(() => {
    const scheduleUpload = (event: Event) => {
      if (!isSettingsChangedEvent(event)) return;

      const domain = event.detail.domain;

      if (!userId) {
        pendingUploadsRef.current.add(domain);
        return;
      }

      const existing = uploadTimersRef.current[domain];
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }

      uploadTimersRef.current[domain] = window.setTimeout(() => {
        delete uploadTimersRef.current[domain];
        void runUpload([domain]);
      }, UPLOAD_DEBOUNCE_MS);
    };

    window.addEventListener(SETTINGS_CHANGED_EVENT, scheduleUpload);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, scheduleUpload);
      for (const timer of Object.values(uploadTimersRef.current)) {
        if (timer !== undefined) window.clearTimeout(timer);
      }
      uploadTimersRef.current = {};
    };
  }, [runUpload, userId]);

  useEffect(() => {
    if (!enabled) return;
    flushPendingUploads();
  }, [enabled, flushPendingUploads]);

  const value = useMemo(
    () => ({
      enabled,
      status,
      statusMessage,
      lastSyncedAt,
      lastSyncResult,
      syncNow,
    }),
    [enabled, status, statusMessage, lastSyncedAt, lastSyncResult, syncNow],
  );

  return <SettingsSyncContext.Provider value={value}>{children}</SettingsSyncContext.Provider>;
}

export function useSettingsSync(): SettingsSyncContextValue {
  const ctx = useContext(SettingsSyncContext);
  if (!ctx) {
    throw new Error('useSettingsSync must be used within SettingsSyncProvider');
  }
  return ctx;
}
