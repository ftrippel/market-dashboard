import {
  doc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import {
  applyCalculatorSettings,
  applyPreferencesSettings,
  applyWatchlistsFromSync,
  exportCalculatorSettings,
  exportPreferencesSettings,
  exportWatchlistsForSync,
  getDefaultCalculatorSettings,
  getDefaultPreferencesSettings,
  parseCalculatorSettings,
  parsePreferencesSettings,
  parseWatchlistsSyncPayload,
  watchlistsContentEqual,
  type CalculatorSettings,
  type DashboardSettingsExport,
  type PreferencesSettings,
} from './settingsBackup';
import { createDefaultWatchlistStorage } from '../features/watchlist/watchlistStorage';
import {
  EPOCH_ISO,
  getServerRevision,
  hasCloudBaseline,
  hasPendingUpload,
  markPendingUpload,
  setServerRevision,
  SETTINGS_DOMAINS,
  type SettingsDomain,
} from './settingsEvents';
import { getFirebaseDb } from './firebase';

export { SETTINGS_CHANGED_EVENT } from './settingsEvents';
export type { SettingsDomain } from './settingsEvents';

export type DomainSyncResult = 'uploaded' | 'downloaded' | 'unchanged';

export interface ReconcileResult {
  preferences: DomainSyncResult;
  calculator: DomainSyncResult;
  watchlists: DomainSyncResult;
}

export type SettingsSyncResult = 'uploaded' | 'downloaded' | 'unchanged' | 'mixed';

interface RemoteDocPayload {
  data: unknown;
  updatedAt?: Timestamp | string;
}

const REMOTE_APPLY_PAUSE_MS = 2500;
const pausedRemoteApply = new Set<SettingsDomain>();

function settingsDocRef(userId: string, domain: SettingsDomain) {
  return doc(getFirebaseDb(), 'users', userId, 'settings', domain);
}

function legacySettingsDocRef(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'settings', 'dashboard');
}

function timestampToIso(value: Timestamp | string | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.toDate().toISOString();
}

function isRemoteNewer(domain: SettingsDomain, remoteUpdatedAt: string): boolean {
  return Date.parse(remoteUpdatedAt) > Date.parse(getServerRevision(domain));
}

export function pauseRemoteApply(domain: SettingsDomain, ms = REMOTE_APPLY_PAUSE_MS): void {
  pausedRemoteApply.add(domain);
  window.setTimeout(() => pausedRemoteApply.delete(domain), ms);
}

export function isRemoteApplyPaused(domain: SettingsDomain): boolean {
  return pausedRemoteApply.has(domain);
}

function summarizeResults(result: ReconcileResult): SettingsSyncResult {
  const values = SETTINGS_DOMAINS.map((domain) => result[domain]);
  if (values.every((value) => value === 'unchanged')) return 'unchanged';
  if (values.some((value) => value === 'downloaded') && values.some((value) => value === 'uploaded')) {
    return 'mixed';
  }
  if (values.some((value) => value === 'downloaded')) return 'downloaded';
  if (values.some((value) => value === 'uploaded')) return 'uploaded';
  return 'mixed';
}

function remoteContentDiffers(domain: SettingsDomain, data: unknown): boolean {
  if (domain === 'watchlists') {
    const remote = parseWatchlistsSyncPayload(data);
    if (!remote) return true;
    return !watchlistsContentEqual(exportWatchlistsForSync().watchlists, remote.watchlists);
  }

  if (domain === 'preferences') {
    const remote = parsePreferencesSettings(data);
    if (!remote) return true;
    return JSON.stringify(exportPreferencesSettings()) !== JSON.stringify(remote);
  }

  const remote = parseCalculatorSettings(data);
  if (!remote) return true;
  return JSON.stringify(exportCalculatorSettings()) !== JSON.stringify(remote);
}

async function fetchRemoteDomain(
  userId: string,
  domain: SettingsDomain,
): Promise<{ data: unknown; updatedAt: string } | null> {
  const snapshot = await getDocFromServer(settingsDocRef(userId, domain));
  if (!snapshot.exists()) return null;

  const payload = snapshot.data() as RemoteDocPayload;
  const updatedAt = timestampToIso(payload.updatedAt);
  if (!updatedAt || payload.data === undefined) return null;

  return { data: payload.data, updatedAt };
}

function applyRemoteDomain(
  domain: SettingsDomain,
  data: unknown,
  updatedAt: string,
): boolean {
  if (domain === 'preferences') {
    const parsed = parsePreferencesSettings(data);
    if (!parsed) return false;
    applyPreferencesSettings(parsed, { source: 'remote', updatedAt });
    return true;
  }

  if (domain === 'calculator') {
    const parsed = parseCalculatorSettings(data);
    if (!parsed) return false;
    applyCalculatorSettings(parsed, { source: 'remote', updatedAt });
    return true;
  }

  const parsed = parseWatchlistsSyncPayload(data);
  if (!parsed) return false;
  applyWatchlistsFromSync(parsed, { source: 'remote', updatedAt });
  return true;
}

function applyCloudEmptyDomain(domain: SettingsDomain, updatedAt: string): void {
  pauseRemoteApply(domain);

  if (domain === 'preferences') {
    applyPreferencesSettings(getDefaultPreferencesSettings(), { source: 'remote', updatedAt });
    return;
  }

  if (domain === 'calculator') {
    applyCalculatorSettings(getDefaultCalculatorSettings(), { source: 'remote', updatedAt });
    return;
  }

  applyWatchlistsFromSync(
    { watchlists: createDefaultWatchlistStorage().watchlists },
    { source: 'remote', updatedAt },
  );
}

function exportDomain(domain: SettingsDomain): unknown {
  if (domain === 'preferences') return exportPreferencesSettings();
  if (domain === 'calculator') return exportCalculatorSettings();
  return exportWatchlistsForSync();
}

export async function uploadDomain(userId: string, domain: SettingsDomain): Promise<void> {
  if (!hasCloudBaseline(domain)) return;

  pauseRemoteApply(domain);

  const docRef = settingsDocRef(userId, domain);
  await setDoc(
    docRef,
    {
      data: exportDomain(domain),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const snapshot = await getDocFromServer(docRef);
  const payload = snapshot.data() as RemoteDocPayload | undefined;
  const updatedAt = timestampToIso(payload?.updatedAt);
  if (updatedAt) {
    setServerRevision(domain, updatedAt);
    markPendingUpload(domain, false);
  }
}

export async function uploadDomains(userId: string, domains: SettingsDomain[]): Promise<void> {
  await Promise.all(domains.map((domain) => uploadDomain(userId, domain)));
}

function pullRemoteDomain(
  domain: SettingsDomain,
  data: unknown,
  updatedAt: string,
): DomainSyncResult {
  if (applyRemoteDomain(domain, data, updatedAt)) {
    return 'downloaded';
  }

  if (!remoteContentDiffers(domain, data)) {
    setServerRevision(domain, updatedAt);
    markPendingUpload(domain, false);
    return 'unchanged';
  }

  applyCloudEmptyDomain(domain, updatedAt);
  return 'downloaded';
}

/** First session pull: always replace local with cloud (or defaults). Never upload. */
async function adoptDomainFromCloud(
  userId: string,
  domain: SettingsDomain,
): Promise<DomainSyncResult> {
  const remote = await fetchRemoteDomain(userId, domain);

  if (!remote) {
    applyCloudEmptyDomain(domain, EPOCH_ISO);
    return 'downloaded';
  }

  return pullRemoteDomain(domain, remote.data, remote.updatedAt);
}

async function reconcileDomain(userId: string, domain: SettingsDomain): Promise<DomainSyncResult> {
  if (!hasCloudBaseline(domain)) {
    return adoptDomainFromCloud(userId, domain);
  }

  const remote = await fetchRemoteDomain(userId, domain);

  if (!remote) {
    if (hasPendingUpload(domain)) {
      await uploadDomain(userId, domain);
      return 'uploaded';
    }
    return 'unchanged';
  }

  if (isRemoteNewer(domain, remote.updatedAt)) {
    return pullRemoteDomain(domain, remote.data, remote.updatedAt);
  }

  if (hasPendingUpload(domain) || remoteContentDiffers(domain, remote.data)) {
    await uploadDomain(userId, domain);
    return 'uploaded';
  }

  return 'unchanged';
}

async function migrateLegacyDashboardDoc(userId: string): Promise<boolean> {
  const snapshot = await getDocFromServer(legacySettingsDocRef(userId));
  if (!snapshot.exists()) return false;

  const legacy = snapshot.data();
  const settings = legacy.settings as DashboardSettingsExport | undefined;
  if (!settings) return false;

  const preferences: PreferencesSettings = {
    theme: settings.theme,
    enableHoverPreview: settings.enableHoverPreview,
    sparklineMode: settings.sparklineMode,
    chartMaSettings: settings.chartMaSettings ?? getDefaultPreferencesSettings().chartMaSettings,
  };

  pauseRemoteApply('preferences');
  pauseRemoteApply('calculator');
  pauseRemoteApply('watchlists');

  await Promise.all([
    setDoc(settingsDocRef(userId, 'preferences'), {
      data: preferences,
      updatedAt: legacy.updatedAt ?? serverTimestamp(),
    }),
    setDoc(settingsDocRef(userId, 'calculator'), {
      data: settings.calculator,
      updatedAt: legacy.updatedAt ?? serverTimestamp(),
    }),
    setDoc(settingsDocRef(userId, 'watchlists'), {
      data: { watchlists: settings.watchlists.watchlists },
      updatedAt: legacy.updatedAt ?? serverTimestamp(),
    }),
  ]);

  return true;
}

export async function reconcileSettings(userId: string): Promise<ReconcileResult> {
  await migrateLegacyDashboardDoc(userId);

  return {
    preferences: await reconcileDomain(userId, 'preferences'),
    calculator: await reconcileDomain(userId, 'calculator'),
    watchlists: await reconcileDomain(userId, 'watchlists'),
  };
}

export function summarizeReconcileResult(result: ReconcileResult): SettingsSyncResult {
  return summarizeResults(result);
}

export function applyRemoteSnapshot(
  domain: SettingsDomain,
  data: unknown,
  updatedAt: string,
): boolean {
  if (isRemoteApplyPaused(domain)) return false;

  if (!hasCloudBaseline(domain)) {
    if (!remoteContentDiffers(domain, data)) {
      setServerRevision(domain, updatedAt);
      markPendingUpload(domain, false);
      return false;
    }
    return applyRemoteDomain(domain, data, updatedAt);
  }

  if (!isRemoteNewer(domain, updatedAt)) return false;
  if (!remoteContentDiffers(domain, data)) {
    setServerRevision(domain, updatedAt);
    markPendingUpload(domain, false);
    return false;
  }

  return applyRemoteDomain(domain, data, updatedAt);
}

export function subscribeToRemoteSettings(
  userId: string,
  onDomainUpdate: (domain: SettingsDomain, data: unknown, updatedAt: string) => void,
): () => void {
  const unsubs = SETTINGS_DOMAINS.map((domain) =>
    onSnapshot(settingsDocRef(userId, domain), (snapshot) => {
      if (!snapshot.exists()) return;
      if (isRemoteApplyPaused(domain)) return;

      const payload = snapshot.data() as RemoteDocPayload;
      const updatedAt = timestampToIso(payload.updatedAt);
      if (!updatedAt || payload.data === undefined) return;

      onDomainUpdate(domain, payload.data, updatedAt);
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export async function uploadSettings(userId: string): Promise<void> {
  await uploadDomains(userId, [...SETTINGS_DOMAINS]);
}
