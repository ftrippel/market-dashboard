import {
  doc,
  getDocFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
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
  CURRENT_SYNC_BUILD_NUMBER,
  CURRENT_SYNC_SCHEMA_VERSION_BY_DOMAIN,
  getLocalEditSequence,
  getServerRevisionMs,
  getSyncBase,
  hasCloudBaseline,
  hasPendingUpload,
  markPendingUpload,
  REMOTE_SETTINGS_APPLIED_EVENT,
  setLocalBuildNumber,
  setLocalSchemaVersion,
  setServerRevision,
  setSyncBase,
  SETTINGS_DOMAINS,
  type SettingsDomain,
} from './settingsEvents';
import { getFirebaseDb } from './firebase';
import { mergeWatchlistsForUpload } from './settingsMerge';

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
  minimumWriterBuild?: number;
  writerBuildNumber?: number;
  writeId?: string;
}

const REMOTE_APPLY_PAUSE_MS = 2500;
const pausedRemoteApply = new Set<SettingsDomain>();
const pendingRemoteSnapshots = new Map<
  SettingsDomain,
  { data: unknown; updatedAt: string; metadata: DomainSyncMetadata }
>();

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

function parseBuildNumberAsInt(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function getCurrentMetadata(domain: SettingsDomain): DomainSyncMetadata {
  return {
    schemaVersion: CURRENT_SYNC_SCHEMA_VERSION_BY_DOMAIN[domain],
    buildNumber: CURRENT_SYNC_BUILD_NUMBER,
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

function isRemoteNewer(domain: SettingsDomain, remoteUpdatedAt: string): boolean {
  const remoteMs = Date.parse(remoteUpdatedAt);
  if (!Number.isFinite(remoteMs)) return false;
  return remoteMs > getServerRevisionMs(domain);
}

export function pauseRemoteApply(domain: SettingsDomain, ms = REMOTE_APPLY_PAUSE_MS): void {
  pausedRemoteApply.add(domain);
  window.setTimeout(() => {
    pausedRemoteApply.delete(domain);
    const queued = pendingRemoteSnapshots.get(domain);
    if (!queued) return;
    pendingRemoteSnapshots.delete(domain);
    const applied = applyRemoteSnapshot(domain, queued.data, queued.updatedAt, queued.metadata);
    if (applied) {
      window.dispatchEvent(
        new CustomEvent(REMOTE_SETTINGS_APPLIED_EVENT, { detail: { domain } }),
      );
    }
  }, ms);
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
  const docRef = settingsDocRef(userId, domain);
  const currentBuild = parseBuildNumberAsInt(CURRENT_SYNC_BUILD_NUMBER);
  const snapshot =
    currentBuild === null
      ? await getDocFromServer(docRef)
      : await runTransaction(getFirebaseDb(), async (transaction) => {
          const currentSnapshot = await transaction.get(docRef);
          if (!currentSnapshot.exists()) return currentSnapshot;

          const currentPayload = currentSnapshot.data() as RemoteDocPayload;
          const remoteMinimumBuild =
            typeof currentPayload.minimumWriterBuild === 'number'
              ? currentPayload.minimumWriterBuild
              : 0;
          if (currentBuild < remoteMinimumBuild) {
            throw new Error('This app build is too old to sync. Reload the app before editing settings.');
          }

          if (
            remoteMinimumBuild < currentBuild ||
            currentPayload.writerBuildNumber !== currentBuild ||
            typeof currentPayload.writeId !== 'string'
          ) {
            transaction.update(docRef, {
              minimumWriterBuild: currentBuild,
              writerBuildNumber: currentBuild,
              writeId: crypto.randomUUID(),
            });
          }
          return currentSnapshot;
        });
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
    setSyncBase(domain, data);
    stampLocalMetadata(domain, metadata);
    return true;
  }

  if (domain === 'calculator') {
    const parsed = parseCalculatorSettings(data);
    if (!parsed) return false;
    applyCalculatorSettings(parsed, { source: 'remote', updatedAt });
    setSyncBase(domain, data);
    stampLocalMetadata(domain, metadata);
    return true;
  }

  const parsed = parseWatchlistsSyncPayload(data);
  if (!parsed) return false;
  applyWatchlistsFromSync(parsed, { source: 'remote', updatedAt });
  setSyncBase(domain, data);
  stampLocalMetadata(domain, metadata);
  return true;
}

function applyCloudEmptyDomain(
  domain: SettingsDomain,
  updatedAt: string,
  metadata: DomainSyncMetadata = getCurrentMetadata(domain),
): void {
  pauseRemoteApply(domain);
  setServerRevision(domain, updatedAt);
  stampLocalMetadata(domain, metadata);

  if (domain === 'preferences') {
    applyPreferencesSettings(getDefaultPreferencesSettings(), { source: 'remote', updatedAt });
    setSyncBase(domain, exportPreferencesSettings());
    return;
  }

  if (domain === 'calculator') {
    applyCalculatorSettings(getDefaultCalculatorSettings(), { source: 'remote', updatedAt });
    setSyncBase(domain, exportCalculatorSettings());
    return;
  }

  applyWatchlistsFromSync(
    { watchlists: createDefaultWatchlistStorage().watchlists },
    { source: 'remote', updatedAt },
  );
  setSyncBase(domain, exportWatchlistsForSync());
}

function exportDomain(domain: SettingsDomain): unknown {
  if (domain === 'preferences') return exportPreferencesSettings();
  if (domain === 'calculator') return exportCalculatorSettings();
  return exportWatchlistsForSync();
}

export async function uploadDomain(userId: string, domain: SettingsDomain): Promise<void> {
  const editSeqAtStart = getLocalEditSequence(domain);
  pauseRemoteApply(domain);
  const metadata = getCurrentMetadata(domain);
  const localData = exportDomain(domain);
  const baseData = getSyncBase(domain);
  const baseRevisionMs = getServerRevisionMs(domain);
  const currentBuild = parseBuildNumberAsInt(CURRENT_SYNC_BUILD_NUMBER);
  const docRef = settingsDocRef(userId, domain);
  const uploadedData = await runTransaction(getFirebaseDb(), async (transaction) => {
    const currentSnapshot = await transaction.get(docRef);
    const currentPayload = currentSnapshot.data() as RemoteDocPayload | undefined;
    const remoteUpdatedAt = timestampToIso(currentPayload?.updatedAt);
    const remoteMinimumBuild =
      typeof currentPayload?.minimumWriterBuild === 'number'
        ? currentPayload.minimumWriterBuild
        : null;

    if (remoteMinimumBuild !== null && (currentBuild === null || currentBuild < remoteMinimumBuild)) {
      throw new Error('This app build is too old to sync. Reload the app before editing settings.');
    }

    let data = localData;
    if (
      domain === 'watchlists' &&
      currentPayload?.data !== undefined &&
      ((remoteUpdatedAt && Date.parse(remoteUpdatedAt) > baseRevisionMs) ||
        JSON.stringify(currentPayload.data) !== JSON.stringify(baseData))
    ) {
      const localWatchlists = parseWatchlistsSyncPayload(localData);
      const remoteWatchlists = parseWatchlistsSyncPayload(currentPayload.data);
      const baseWatchlists = baseData ? parseWatchlistsSyncPayload(baseData) : null;
      if (localWatchlists && remoteWatchlists) {
        data = mergeWatchlistsForUpload(baseWatchlists, localWatchlists, remoteWatchlists);
      }
    }

    const writerProtection =
      currentBuild === null
        ? {}
        : {
            minimumWriterBuild: Math.max(remoteMinimumBuild ?? 0, currentBuild),
            writerBuildNumber: currentBuild,
            writeId: crypto.randomUUID(),
          };

    transaction.set(
      docRef,
      {
        data,
        updatedAt: serverTimestamp(),
        schemaVersion: metadata.schemaVersion,
        buildNumber: metadata.buildNumber,
        ...writerProtection,
      },
      { merge: true },
    );
    return data;
  });

  const snapshot = await getDocFromServer(docRef);
  const payload = snapshot.data() as RemoteDocPayload | undefined;
  const updatedAt = timestampToIso(payload?.updatedAt);
  if (updatedAt) {
    const confirmedData = payload?.data ?? uploadedData;
    const editSequenceUnchanged = getLocalEditSequence(domain) === editSeqAtStart;
    setServerRevision(domain, updatedAt);
    setSyncBase(domain, confirmedData);
    stampLocalMetadata(domain, metadata);
    if (editSequenceUnchanged) {
      if (JSON.stringify(exportDomain(domain)) !== JSON.stringify(confirmedData)) {
        applyRemoteDomain(domain, confirmedData, updatedAt, metadata);
      }
      markPendingUpload(domain, false);
    } else if (domain === 'watchlists') {
      const uploadStart = parseWatchlistsSyncPayload(localData);
      const currentLocal = parseWatchlistsSyncPayload(exportDomain(domain));
      const currentRemote = parseWatchlistsSyncPayload(confirmedData);
      if (uploadStart && currentLocal && currentRemote) {
        const mergedLocal = mergeWatchlistsForUpload(uploadStart, currentLocal, currentRemote);
        applyRemoteDomain(domain, mergedLocal, updatedAt, metadata);
        setSyncBase(domain, confirmedData);
        markPendingUpload(domain, true);
      }
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
    setSyncBase(domain, data);
    stampLocalMetadata(domain, metadata);
    markPendingUpload(domain, false);
    return 'unchanged';
  }

  applyCloudEmptyDomain(domain, updatedAt, metadata);
  return 'downloaded';
}

/** First sync pulls cloud unless this device has preserved offline edits to merge. */
async function adoptDomainFromCloud(
  userId: string,
  domain: SettingsDomain,
): Promise<DomainSyncResult> {
  const remote = await fetchRemoteDomain(userId, domain);
  const hasLocalWatchlistEntries =
    domain === 'watchlists' &&
    exportWatchlistsForSync().watchlists.some((watchlist) => watchlist.items.length > 0);

  if (
    hasPendingUpload(domain) ||
    (remote && hasLocalWatchlistEntries && remoteContentDiffers(domain, remote.data))
  ) {
    await uploadDomain(userId, domain);
    return 'uploaded';
  }

  if (!remote) {
    try {
      await uploadDomain(userId, domain);
      return 'uploaded';
    } catch (error) {
      console.warn(`Cloud sync bootstrap upload failed for "${domain}". Retrying by pulling remote.`, error);
      // Another client may have created the doc between fetch and upload; pull if it now exists.
      const latestRemote = await fetchRemoteDomain(userId, domain);
      if (latestRemote) {
        return pullRemoteDomain(domain, latestRemote.data, latestRemote.updatedAt, latestRemote.metadata);
      }
      throw new Error(
        `Unable to initialize cloud sync for "${domain}" after upload and re-fetch attempt.`,
      );
    }
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

  if (isRemoteNewer(domain, remote.updatedAt)) {
    if (hasPendingUpload(domain)) {
      await uploadDomain(userId, domain);
      return 'uploaded';
    }
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

  const legacyByDomain: Record<SettingsDomain, unknown> = {
    preferences,
    calculator: settings.calculator,
    watchlists: { watchlists: settings.watchlists.watchlists },
  };
  const currentBuild = parseBuildNumberAsInt(CURRENT_SYNC_BUILD_NUMBER);

  return runTransaction(getFirebaseDb(), async (transaction) => {
    const domainSnapshots = await Promise.all(
      SETTINGS_DOMAINS.map((domain) => transaction.get(settingsDocRef(userId, domain))),
    );
    let migrated = false;

    SETTINGS_DOMAINS.forEach((domain, index) => {
      if (domainSnapshots[index].exists()) return;
      const writerProtection =
        currentBuild === null
          ? {}
          : {
              minimumWriterBuild: currentBuild,
              writerBuildNumber: currentBuild,
              writeId: crypto.randomUUID(),
            };
      transaction.set(settingsDocRef(userId, domain), {
        data: legacyByDomain[domain],
        updatedAt: legacy.updatedAt ?? serverTimestamp(),
        schemaVersion: CURRENT_SYNC_SCHEMA_VERSION_BY_DOMAIN[domain],
        buildNumber: CURRENT_SYNC_BUILD_NUMBER,
        ...writerProtection,
      });
      migrated = true;
    });

    return migrated;
  });
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
  if (isRemoteApplyPaused(domain)) {
    // Returning false here means "queued for deferred apply", not "unchanged".
    pendingRemoteSnapshots.set(domain, { data, updatedAt, metadata: remoteMetadata });
    return false;
  }

  if (!hasCloudBaseline(domain)) {
    if (hasPendingUpload(domain)) return false;
    if (!remoteContentDiffers(domain, data)) {
      setServerRevision(domain, updatedAt);
      setSyncBase(domain, data);
      stampLocalMetadata(domain, remoteMetadata);
      markPendingUpload(domain, false);
      return false;
    }
    return applyRemoteDomain(domain, data, updatedAt, remoteMetadata);
  }

  if (!isRemoteNewer(domain, updatedAt)) return false;
  if (hasPendingUpload(domain)) return false;
  if (!remoteContentDiffers(domain, data)) {
    setServerRevision(domain, updatedAt);
    setSyncBase(domain, data);
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
      // Pause/queue behavior is handled inside applyRemoteSnapshot.

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
