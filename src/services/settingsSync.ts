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
  type DashboardSettingsExport,
  type PreferencesSettings,
} from './settingsBackup';
import { createDefaultWatchlistStorage } from '../features/watchlist/watchlistStorage';
import {
  getLocalBuildNumber,
  getLocalEditSequence,
  getLocalSchemaVersion,
  getServerRevisionMs,
  hasCloudBaseline,
  hasPendingUpload,
  markPendingUpload,
  setLocalBuildNumber,
  setLocalSchemaVersion,
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
  schemaVersion?: number;
  buildNumber?: string;
}

const REMOTE_APPLY_PAUSE_MS = 2500;
const pausedRemoteApply = new Set<SettingsDomain>();
const DOMAIN_SCHEMA_VERSION: Record<SettingsDomain, number> = {
  preferences: 2,
  calculator: 2,
  watchlists: 2,
};
const SYNC_BUILD_NUMBER = import.meta.env.VITE_BUILD_NUMBER ?? 'dev';

interface DomainSyncMetadata {
  schemaVersion: number;
  buildNumber: string;
}

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

function parseBuildNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLocalMetadata(domain: SettingsDomain): DomainSyncMetadata {
  return {
    schemaVersion: getLocalSchemaVersion(domain),
    buildNumber: getLocalBuildNumber(domain) ?? 'legacy',
  };
}

function getCurrentMetadata(domain: SettingsDomain): DomainSyncMetadata {
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION[domain],
    buildNumber: SYNC_BUILD_NUMBER,
  };
}

function normalizeRemoteMetadata(
  domain: SettingsDomain,
  payload: Pick<RemoteDocPayload, 'schemaVersion' | 'buildNumber'>,
): DomainSyncMetadata {
  const fallback = getCurrentMetadata(domain);
  return {
    schemaVersion:
      typeof payload.schemaVersion === 'number' && Number.isFinite(payload.schemaVersion)
        ? Math.max(0, Math.floor(payload.schemaVersion))
        : 0,
    buildNumber: typeof payload.buildNumber === 'string' ? payload.buildNumber : fallback.buildNumber,
  };
}

function stampLocalMetadata(domain: SettingsDomain, metadata: DomainSyncMetadata): void {
  setLocalSchemaVersion(domain, metadata.schemaVersion);
  setLocalBuildNumber(domain, metadata.buildNumber);
}

function shouldForcePullDueToVersion(
  domain: SettingsDomain,
  remoteMetadata: DomainSyncMetadata,
): boolean {
  const local = getLocalMetadata(domain);
  if (local.schemaVersion < remoteMetadata.schemaVersion) return true;
  if (local.schemaVersion > remoteMetadata.schemaVersion) return false;

  const localBuild = parseBuildNumber(local.buildNumber);
  const remoteBuild = parseBuildNumber(remoteMetadata.buildNumber);
  if (localBuild === null || remoteBuild === null) return false;
  return localBuild < remoteBuild;
}

function isRemoteNewer(domain: SettingsDomain, remoteUpdatedAt: string): boolean {
  const remoteMs = Date.parse(remoteUpdatedAt);
  if (!Number.isFinite(remoteMs)) return false;
  return remoteMs > getServerRevisionMs(domain);
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
): Promise<{ data: unknown; updatedAt: string; metadata: DomainSyncMetadata } | null> {
  const snapshot = await getDocFromServer(settingsDocRef(userId, domain));
  if (!snapshot.exists()) return null;

  const payload = snapshot.data() as RemoteDocPayload;
  const updatedAt = timestampToIso(payload.updatedAt);
  if (!updatedAt || payload.data === undefined) return null;

  return {
    data: payload.data,
    updatedAt,
    metadata: normalizeRemoteMetadata(domain, payload),
  };
}

function applyRemoteDomain(
  domain: SettingsDomain,
  data: unknown,
  updatedAt: string,
  metadata: DomainSyncMetadata,
): boolean {
  if (domain === 'preferences') {
    const parsed = parsePreferencesSettings(data);
    if (!parsed) return false;
    applyPreferencesSettings(parsed, { source: 'remote', updatedAt });
    stampLocalMetadata(domain, metadata);
    return true;
  }

  if (domain === 'calculator') {
    const parsed = parseCalculatorSettings(data);
    if (!parsed) return false;
    applyCalculatorSettings(parsed, { source: 'remote', updatedAt });
    stampLocalMetadata(domain, metadata);
    return true;
  }

  const parsed = parseWatchlistsSyncPayload(data);
  if (!parsed) return false;
  applyWatchlistsFromSync(parsed, { source: 'remote', updatedAt });
  stampLocalMetadata(domain, metadata);
  return true;
}

function applyCloudEmptyDomain(domain: SettingsDomain, updatedAt: string): void {
  pauseRemoteApply(domain);
  stampLocalMetadata(domain, getCurrentMetadata(domain));

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
  pauseRemoteApply(domain);
  const editSeqAtStart = getLocalEditSequence(domain);
  const metadata = getCurrentMetadata(domain);

  const docRef = settingsDocRef(userId, domain);
  await setDoc(
    docRef,
    {
      data: exportDomain(domain),
      updatedAt: serverTimestamp(),
      schemaVersion: metadata.schemaVersion,
      buildNumber: metadata.buildNumber,
    },
    { merge: true },
  );

  const snapshot = await getDocFromServer(docRef);
  const payload = snapshot.data() as RemoteDocPayload | undefined;
  const updatedAt = timestampToIso(payload?.updatedAt);
  if (updatedAt) {
    setServerRevision(domain, updatedAt);
    stampLocalMetadata(domain, metadata);
    if (getLocalEditSequence(domain) === editSeqAtStart) {
      markPendingUpload(domain, false);
    }
  }
}

export async function uploadDomains(userId: string, domains: SettingsDomain[]): Promise<void> {
  await Promise.all(domains.map((domain) => uploadDomain(userId, domain)));
}

function pullRemoteDomain(
  domain: SettingsDomain,
  data: unknown,
  updatedAt: string,
  metadata: DomainSyncMetadata,
): DomainSyncResult {
  if (applyRemoteDomain(domain, data, updatedAt, metadata)) {
    return 'downloaded';
  }

  if (!remoteContentDiffers(domain, data)) {
    setServerRevision(domain, updatedAt);
    stampLocalMetadata(domain, metadata);
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
    await uploadDomain(userId, domain);
    return 'uploaded';
  }

  return pullRemoteDomain(domain, remote.data, remote.updatedAt, remote.metadata);
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

  if (shouldForcePullDueToVersion(domain, remote.metadata)) {
    return pullRemoteDomain(domain, remote.data, remote.updatedAt, remote.metadata);
  }

  if (isRemoteNewer(domain, remote.updatedAt)) {
    return pullRemoteDomain(domain, remote.data, remote.updatedAt, remote.metadata);
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
      schemaVersion: DOMAIN_SCHEMA_VERSION.preferences,
      buildNumber: SYNC_BUILD_NUMBER,
    }),
    setDoc(settingsDocRef(userId, 'calculator'), {
      data: settings.calculator,
      updatedAt: legacy.updatedAt ?? serverTimestamp(),
      schemaVersion: DOMAIN_SCHEMA_VERSION.calculator,
      buildNumber: SYNC_BUILD_NUMBER,
    }),
    setDoc(settingsDocRef(userId, 'watchlists'), {
      data: { watchlists: settings.watchlists.watchlists },
      updatedAt: legacy.updatedAt ?? serverTimestamp(),
      schemaVersion: DOMAIN_SCHEMA_VERSION.watchlists,
      buildNumber: SYNC_BUILD_NUMBER,
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
  metadata?: DomainSyncMetadata,
): boolean {
  const remoteMetadata = metadata ?? getCurrentMetadata(domain);

  if (shouldForcePullDueToVersion(domain, remoteMetadata)) {
    return applyRemoteDomain(domain, data, updatedAt, remoteMetadata);
  }

  if (!hasCloudBaseline(domain)) {
    if (!remoteContentDiffers(domain, data)) {
      setServerRevision(domain, updatedAt);
      stampLocalMetadata(domain, remoteMetadata);
      markPendingUpload(domain, false);
      return false;
    }
    return applyRemoteDomain(domain, data, updatedAt, remoteMetadata);
  }

  if (!isRemoteNewer(domain, updatedAt)) return false;
  if (!remoteContentDiffers(domain, data)) {
    setServerRevision(domain, updatedAt);
    stampLocalMetadata(domain, remoteMetadata);
    markPendingUpload(domain, false);
    return false;
  }

  return applyRemoteDomain(domain, data, updatedAt, remoteMetadata);
}

export function subscribeToRemoteSettings(
  userId: string,
  onDomainUpdate: (
    domain: SettingsDomain,
    data: unknown,
    updatedAt: string,
    metadata: DomainSyncMetadata,
  ) => void,
): () => void {
  const unsubs = SETTINGS_DOMAINS.map((domain) =>
    onSnapshot(settingsDocRef(userId, domain), (snapshot) => {
      if (!snapshot.exists()) return;

      const payload = snapshot.data() as RemoteDocPayload;
      const updatedAt = timestampToIso(payload.updatedAt);
      if (!updatedAt || payload.data === undefined) return;

      onDomainUpdate(domain, payload.data, updatedAt, normalizeRemoteMetadata(domain, payload));
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export async function uploadSettings(userId: string): Promise<void> {
  await uploadDomains(userId, [...SETTINGS_DOMAINS]);
}
