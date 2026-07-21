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
  reconcileSettings,
  SETTINGS_CHANGED_EVENT,
  uploadSettings,
  type SettingsSyncResult,
} from '../services/settingsSync';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface SettingsSyncContextValue {
  enabled: boolean;
  status: SyncStatus;
  statusMessage: string | null;
  lastSyncResult: SettingsSyncResult | null;
  syncNow: () => Promise<void>;
}

const SettingsSyncContext = createContext<SettingsSyncContextValue | null>(null);

const UPLOAD_DEBOUNCE_MS = 1500;

export function SettingsSyncProvider({ children }: { children: ReactNode }) {
  const { configured, user } = useAuth();
  const enabled = configured && user !== null;
  const userId = user?.uid ?? null;

  const [status, setStatus] = useState<SyncStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SettingsSyncResult | null>(null);

  const uploadTimerRef = useRef<number | null>(null);
  const syncingRef = useRef(false);

  const runSync = useCallback(
    async (mode: 'reconcile' | 'upload') => {
      if (!userId || syncingRef.current) return;

      syncingRef.current = true;
      setStatus('syncing');
      setStatusMessage(null);

      try {
        const result =
          mode === 'reconcile' ? await reconcileSettings(userId) : await (async () => {
            await uploadSettings(userId);
            return 'uploaded' as const;
          })();

        setLastSyncResult(result);
        setStatus('synced');

        if (result === 'downloaded') {
          setStatusMessage('Cloud settings applied. Reloading…');
          window.setTimeout(() => window.location.reload(), 400);
          return;
        }

        if (result === 'uploaded') {
          setStatusMessage('Settings saved to cloud.');
        } else {
          setStatusMessage('Settings are up to date.');
        }
      } catch (err) {
        setStatus('error');
        setStatusMessage(err instanceof Error ? err.message : 'Cloud sync failed.');
      } finally {
        syncingRef.current = false;
      }
    },
    [userId],
  );

  const syncNow = useCallback(async () => {
    await runSync('reconcile');
  }, [runSync]);

  useEffect(() => {
    if (!userId) {
      setStatus('idle');
      setStatusMessage(null);
      setLastSyncResult(null);
      return;
    }

    void runSync('reconcile');
  }, [userId, runSync]);

  useEffect(() => {
    if (!enabled) return;

    const scheduleUpload = () => {
      if (uploadTimerRef.current !== null) {
        window.clearTimeout(uploadTimerRef.current);
      }
      uploadTimerRef.current = window.setTimeout(() => {
        void runSync('upload');
      }, UPLOAD_DEBOUNCE_MS);
    };

    window.addEventListener(SETTINGS_CHANGED_EVENT, scheduleUpload);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, scheduleUpload);
      if (uploadTimerRef.current !== null) {
        window.clearTimeout(uploadTimerRef.current);
      }
    };
  }, [enabled, runSync]);

  const value = useMemo(
    () => ({
      enabled,
      status,
      statusMessage,
      lastSyncResult,
      syncNow,
    }),
    [enabled, status, statusMessage, lastSyncResult, syncNow],
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
