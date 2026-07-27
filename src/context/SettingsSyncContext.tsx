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
  applyRemoteSnapshot,
  reconcileSettings,
  subscribeToRemoteSettings,
  summarizeReconcileResult,
  uploadDomain,
  type SettingsDomain,
  type SettingsSyncResult,
} from '../services/settingsSync';
import {
  beginCloudSession,
  endCloudSession,
  hasPendingUpload,
  isSettingsChangedEvent,
  SETTINGS_CHANGED_EVENT,
  SETTINGS_DOMAINS,
} from '../services/settingsEvents';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface SettingsSyncContextValue {
  enabled: boolean;
  sessionReady: boolean;
  status: SyncStatus;
  statusMessage: string | null;
  lastSyncedAt: Date | null;
  lastSyncResult: SettingsSyncResult | null;
  syncNow: () => Promise<void>;
}

const SettingsSyncContext = createContext<SettingsSyncContextValue | null>(null);

const UPLOAD_DEBOUNCE_MS = 1500;
const INITIAL_SYNC_ATTEMPTS = 3;
const TEXT_INPUT_TYPES = new Set([
  'email',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'url',
]);

function isTextEditingElement(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

async function withInitialSyncRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < INITIAL_SYNC_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < INITIAL_SYNC_ATTEMPTS - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

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
  const { configured, user, loading: authLoading } = useAuth();
  const enabled = configured && user !== null;
  const userId = user?.uid ?? null;

  const [status, setStatus] = useState<SyncStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SettingsSyncResult | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const uploadTimersRef = useRef<Partial<Record<SettingsDomain, number>>>({});
  const syncingRef = useRef(false);
  const sessionUserIdRef = useRef<string | null>(null);

  const markSynced = useCallback((result: SettingsSyncResult) => {
    const now = new Date();
    setLastSyncedAt(now);
    setLastSyncResult(result);
    setStatus('synced');
    setStatusMessage(buildStatusMessage(result, now));
  }, []);

  const clearUploadTimers = useCallback(() => {
    for (const timer of Object.values(uploadTimersRef.current)) {
      if (timer !== undefined) window.clearTimeout(timer);
    }
    uploadTimersRef.current = {};
  }, []);

  const runUpload = useCallback(
    async (domains: SettingsDomain[]) => {
      if (!userId || !sessionReady || domains.length === 0) return;

      const uniqueDomains = [...new Set(domains)].filter(
        (domain) => hasPendingUpload(domain),
      );
      if (uniqueDomains.length === 0) return;

      if (syncingRef.current) return;

      syncingRef.current = true;
      setStatus('syncing');
      setStatusMessage('Saving to cloud…');

      try {
        let pendingDomains = uniqueDomains;
        while (pendingDomains.length > 0) {
          await Promise.all(pendingDomains.map((domain) => uploadDomain(userId, domain)));
          pendingDomains = uniqueDomains.filter((domain) => hasPendingUpload(domain));
        }
        markSynced('uploaded');
      } catch (err) {
        setStatus('error');
        setStatusMessage(err instanceof Error ? err.message : 'Cloud sync failed.');
      } finally {
        syncingRef.current = false;
      }
    },
    [markSynced, sessionReady, userId],
  );

  const runInitialSession = useCallback(async () => {
    if (!userId || syncingRef.current) return;

    syncingRef.current = true;
    setSessionReady(false);
    setStatus('syncing');
    setStatusMessage('Loading cloud settings…');
    clearUploadTimers();

    try {
      const result = await withInitialSyncRetry(() => reconcileSettings(userId));
      markSynced(summarizeReconcileResult(result));
      setSessionReady(true);
    } catch (err) {
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Cloud sync failed.');
    } finally {
      syncingRef.current = false;
    }
  }, [clearUploadTimers, markSynced, userId]);

  const runReconcile = useCallback(async () => {
    if (!userId || !sessionReady || syncingRef.current) return;

    syncingRef.current = true;
    setStatus('syncing');
    setStatusMessage('Syncing with cloud…');
    clearUploadTimers();

    try {
      const result = await reconcileSettings(userId);
      markSynced(summarizeReconcileResult(result));
    } catch (err) {
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Cloud sync failed.');
    } finally {
      syncingRef.current = false;
    }
  }, [clearUploadTimers, markSynced, sessionReady, userId]);

  const syncNow = useCallback(async () => {
    await runReconcile();
  }, [runReconcile]);

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      sessionUserIdRef.current = null;
      setSessionReady(false);
      endCloudSession();
      setStatus('idle');
      setStatusMessage(null);
      setLastSyncedAt(null);
      setLastSyncResult(null);
      return;
    }

    if (sessionUserIdRef.current === userId) return;

    sessionUserIdRef.current = userId;
    beginCloudSession(userId);
    void runInitialSession();
  }, [authLoading, runInitialSession, userId]);

  useEffect(() => {
    if (!userId || !sessionReady) return;

    const pendingDomains = SETTINGS_DOMAINS.filter((domain) => hasPendingUpload(domain));
    if (pendingDomains.length > 0) {
      void runUpload(pendingDomains);
    }
  }, [runUpload, sessionReady, userId]);

  useEffect(() => {
    if (!userId || !sessionReady) return;

    return subscribeToRemoteSettings(userId, (domain, data, updatedAt, metadata) => {
      const applied = applyRemoteSnapshot(domain, data, updatedAt, metadata);
      if (!applied) return;

      const now = new Date();
      setLastSyncedAt(now);
      setLastSyncResult('downloaded');
      setStatus('synced');
      setStatusMessage(buildStatusMessage('downloaded', now));
    });
  }, [sessionReady, userId]);

  useEffect(() => {
    if (!userId || !sessionReady) return;

    let hiddenAt: number | null = null;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        clearUploadTimers();

        const domains = SETTINGS_DOMAINS.filter(
          (domain) => hasPendingUpload(domain),
        );
        if (domains.length > 0) {
          void runUpload(domains);
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
  }, [clearUploadTimers, runReconcile, runUpload, sessionReady, userId]);

  useEffect(() => {
    const scheduleDomainUpload = (domain: SettingsDomain) => {
      const existing = uploadTimersRef.current[domain];
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }

      uploadTimersRef.current[domain] = window.setTimeout(() => {
        delete uploadTimersRef.current[domain];

        // A user may pause longer than the debounce while typing. Keep the edit
        // pending until focus leaves the field instead of uploading partial text.
        if (isTextEditingElement(document.activeElement)) return;

        void runUpload([domain]);
      }, UPLOAD_DEBOUNCE_MS);
    };

    const scheduleUpload = (event: Event) => {
      if (!isSettingsChangedEvent(event)) return;

      const domain = event.detail.domain;
      if (!userId || !sessionReady || !hasPendingUpload(domain)) {
        return;
      }

      if (isTextEditingElement(document.activeElement)) {
        const existing = uploadTimersRef.current[domain];
        if (existing !== undefined) {
          window.clearTimeout(existing);
          delete uploadTimersRef.current[domain];
        }
        return;
      }

      scheduleDomainUpload(domain);
    };

    const schedulePendingUploadsAfterEdit = (event: FocusEvent) => {
      if (!isTextEditingElement(event.target as Element | null)) return;

      for (const domain of SETTINGS_DOMAINS) {
        if (hasPendingUpload(domain)) {
          scheduleDomainUpload(domain);
        }
      }
    };

    window.addEventListener(SETTINGS_CHANGED_EVENT, scheduleUpload);
    window.addEventListener('focusout', schedulePendingUploadsAfterEdit);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, scheduleUpload);
      window.removeEventListener('focusout', schedulePendingUploadsAfterEdit);
      clearUploadTimers();
    };
  }, [clearUploadTimers, runUpload, sessionReady, userId]);

  const value = useMemo(
    () => ({
      enabled,
      sessionReady,
      status,
      statusMessage,
      lastSyncedAt,
      lastSyncResult,
      syncNow,
    }),
    [enabled, sessionReady, status, statusMessage, lastSyncedAt, lastSyncResult, syncNow],
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
