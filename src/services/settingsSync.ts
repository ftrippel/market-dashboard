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
  parseCalculatorSettings,
  parsePreferencesSettings,
  mergeWatchlists,
  mergeWatchlistsFromServerSnapshot,
  parseWatchlistsSyncPayload,
  watchlistsContentEqual,
  type CalculatorSettings,
  type DashboardSettingsExport,
  type PreferencesSettings,
} from './settingsBackup';
import {
  getSettingsLastModified,
  setSettingsLastModified,
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
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';
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

function hasNeverSynced(domain: SettingsDomain): boolean {
  return getSettingsLastModified(domain) === EPOCH_ISO;
}

function remoteContentDiffers(domain: SettingsDomain, data: unknown): boolean {
  if (domain === 'watchlists') {
    const remote = parseWatchlistsSyncPayload(data);
    if (!remote) return false;
    return !watchlistsContentEqual(exportWatchlistsForSync().watchlists, remote.watchlists);
  }

  if (domain === 'preferences') {
    const remote = parsePreferencesSettings(data);
    if (!remote) return false;
    const local = exportPreferencesSettings();
    return JSON.stringify(local) !== JSON.stringify(remote);
  }

  const remote = parseCalculatorSettings(data);
  if (!remote) return false;
  const local = exportCalculatorSettings();
  return JSON.stringify(local) !== JSON.stringify(remote);
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

function exportDomain(domain: SettingsDomain): unknown {
  if (domain === 'preferences') return exportPreferencesSettings();
  if (domain === 'calculator') return exportCalculatorSettings();
  return exportWatchlistsForSync();
}

export async function uploadDomain(userId: string, domain: SettingsDomain): Promise<void> {
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
  setSettingsLastModified(domain, updatedAt ?? new Date().toISOString());
}

export async function uploadDomains(userId: string, domains: SettingsDomain[]): Promise<void> {
  await Promise.all(domains.map((domain) => uploadDomain(userId, domain)));
}

async function reconcileWatchlistsDomain(userId: string): Promise<DomainSyncResult> {
  const localWatchlists = exportWatchlistsForSync().watchlists;
  const remote = await fetchRemoteDomain(userId, 'watchlists');

  if (!remote) {
    await uploadDomain(userId, 'watchlists');
    return 'uploaded';
  }

  const remoteParsed = parseWatchlistsSyncPayload(remote.data);
  if (!remoteParsed) {
    await uploadDomain(userId, 'watchlists');
    return 'uploaded';
  }

  const remoteWatchlists = remoteParsed.watchlists;
  if (watchlistsContentEqual(localWatchlists, remoteWatchlists)) {
    return 'unchanged';
  }

  const mergeContext = {
    localUpdatedAt: getSettingsLastModified('watchlists'),
    remoteUpdatedAt: remote.updatedAt,
  };
  const merged = mergeWatchlists(localWatchlists, remoteWatchlists, mergeContext);
  const localChanged = !watchlistsContentEqual(localWatchlists, merged);
  const remoteChanged = !watchlistsContentEqual(remoteWatchlists, merged);

  if (localChanged) {
    applyWatchlistsFromSync({ watchlists: merged }, { source: 'remote', updatedAt: remote.updatedAt });
  }

  if (remoteChanged) {
    await uploadDomain(userId, 'watchlists');
    return localChanged ? 'downloaded' : 'uploaded';
  }

  return localChanged ? 'downloaded' : 'unchanged';
}

async function reconcileDomain(userId: string, domain: SettingsDomain): Promise<DomainSyncResult> {
  if (domain === 'watchlists') {
    return reconcileWatchlistsDomain(userId);
  }

  const localModified = getSettingsLastModified(domain);
  const remote = await fetchRemoteDomain(userId, domain);

  if (!remote) {
    await uploadDomain(userId, domain);
    return 'uploaded';
  }

  const localTime = Date.parse(localModified);
  const remoteTime = Date.parse(remote.updatedAt);
  const contentDiffers = remoteContentDiffers(domain, remote.data);

  if (remoteTime > localTime || (contentDiffers && hasNeverSynced(domain))) {
    applyRemoteDomain(domain, remote.data, remote.updatedAt);
    return 'downloaded';
  }

  if (localTime > remoteTime || contentDiffers) {
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

  const updatedAt =
    timestampToIso(legacy.updatedAt as Timestamp | string | undefined) ??
    settings.exportedAt ??
    new Date().toISOString();

  const preferences: PreferencesSettings = {
    theme: settings.theme,
    enableHoverPreview: settings.enableHoverPreview,
    sparklineMode: settings.sparklineMode,
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

  setSettingsLastModified('preferences', updatedAt);
  setSettingsLastModified('calculator', updatedAt);
  setSettingsLastModified('watchlists', updatedAt);

  return true;
}

export async function reconcileSettings(userId: string): Promise<ReconcileResult> {
  await migrateLegacyDashboardDoc(userId);

  return {
    preferences: await reconcileDomain(userId, 'preferences'),
    calculator: await reconcileDomain(userId, 'calculator'),
    watchlists: await reconcileWatchlistsDomain(userId),
  };
}

export function summarizeReconcileResult(result: ReconcileResult): SettingsSyncResult {
  return summarizeResults(result);
}

export function applyRemoteIfNewer(
  domain: SettingsDomain,
  data: unknown,
  updatedAt: string,
): boolean {
  if (isRemoteApplyPaused(domain)) return false;

  if (domain === 'watchlists') {
    const remote = parseWatchlistsSyncPayload(data);
    if (!remote) return false;

    const local = exportWatchlistsForSync().watchlists;
    if (watchlistsContentEqual(local, remote.watchlists)) return false;

    const merged = mergeWatchlistsFromServerSnapshot(local, remote.watchlists);
    if (watchlistsContentEqual(local, merged)) return false;

    applyWatchlistsFromSync({ watchlists: merged }, { source: 'remote', updatedAt });
    return true;
  }

  if (!remoteContentDiffers(domain, data)) return false;

  return applyRemoteDomain(domain, data, updatedAt);
}

export function subscribeToRemoteSettings(
  userId: string,
  onDomainUpdate: (domain: SettingsDomain, data: unknown, updatedAt: string) => void,
): () => void {
  const unsubs = SETTINGS_DOMAINS.map((domain) =>
    onSnapshot(settingsDocRef(userId, domain), (snapshot) => {
      if (!snapshot.exists()) return;
      if (snapshot.metadata.fromCache) return;
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
