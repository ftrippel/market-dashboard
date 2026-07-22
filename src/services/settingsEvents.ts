export type SettingsDomain = 'preferences' | 'calculator' | 'watchlists';

export const SETTINGS_DOMAINS: SettingsDomain[] = ['preferences', 'calculator', 'watchlists'];

export const SETTINGS_CHANGED_EVENT = 'dashboard-settings-changed';
export const REMOTE_SETTINGS_APPLIED_EVENT = 'dashboard-settings-remote-applied';

const REVISION_PREFIX = 'dashboard-settings-revision-';
const REVISION_MS_PREFIX = 'dashboard-settings-revision-ms-';
const REVISION_WRITE_ID_PREFIX = 'dashboard-settings-revision-write-id-';
const PENDING_PREFIX = 'dashboard-settings-pending-';
const LOCAL_SCHEMA_PREFIX = 'dashboard-settings-local-schema-';
const LOCAL_BUILD_PREFIX = 'dashboard-settings-local-build-';
const LOCAL_EDIT_SEQ_PREFIX = 'dashboard-settings-local-edit-seq-';
const SYNC_BASE_PREFIX = 'dashboard-settings-sync-base-';
const SYNC_USER_KEY = 'dashboard-settings-sync-user';
const LEGACY_LAST_MODIFIED_PREFIX = 'dashboard-settings-last-modified-';
export const CURRENT_SYNC_SCHEMA_VERSION_BY_DOMAIN: Record<SettingsDomain, number> = {
  preferences: 2,
  calculator: 2,
  watchlists: 3,
};
// Expected to be numeric for cross-build ordering; non-numeric values are treated as unordered.
export const CURRENT_SYNC_BUILD_NUMBER = import.meta.env.VITE_BUILD_NUMBER ?? 'dev';

/** Never synced with cloud yet for this domain. */
export const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

export interface SettingsChangedDetail {
  domain: SettingsDomain;
}

export interface RemoteSettingsAppliedDetail {
  domain: SettingsDomain;
}

function revisionKey(domain: SettingsDomain): string {
  return `${REVISION_PREFIX}${domain}`;
}

function revisionMsKey(domain: SettingsDomain): string {
  return `${REVISION_MS_PREFIX}${domain}`;
}

function revisionWriteIdKey(domain: SettingsDomain): string {
  return `${REVISION_WRITE_ID_PREFIX}${domain}`;
}

function pendingKey(domain: SettingsDomain): string {
  return `${PENDING_PREFIX}${domain}`;
}

function localSchemaKey(domain: SettingsDomain): string {
  return `${LOCAL_SCHEMA_PREFIX}${domain}`;
}

function localBuildKey(domain: SettingsDomain): string {
  return `${LOCAL_BUILD_PREFIX}${domain}`;
}

function localEditSeqKey(domain: SettingsDomain): string {
  return `${LOCAL_EDIT_SEQ_PREFIX}${domain}`;
}

function syncBaseKey(domain: SettingsDomain): string {
  return `${SYNC_BASE_PREFIX}${domain}`;
}

/** True once cloud data has been applied at least once for this domain. */
export function hasCloudBaseline(domain: SettingsDomain): boolean {
  return getServerRevision(domain) !== EPOCH_ISO;
}

export function getServerRevision(domain: SettingsDomain): string {
  return localStorage.getItem(revisionKey(domain)) ?? EPOCH_ISO;
}

export function setServerRevision(domain: SettingsDomain, iso: string): void {
  localStorage.setItem(revisionKey(domain), iso);
  const parsed = Date.parse(iso);
  if (Number.isFinite(parsed)) {
    localStorage.setItem(revisionMsKey(domain), String(parsed));
  }
}

export function getServerRevisionMs(domain: SettingsDomain): number {
  const parsed = Number(localStorage.getItem(revisionMsKey(domain)));
  if (Number.isFinite(parsed)) return parsed;
  const fallback = Date.parse(getServerRevision(domain));
  return Number.isFinite(fallback) ? fallback : 0;
}

export function setServerRevisionMs(domain: SettingsDomain, ms: number): void {
  if (!Number.isFinite(ms)) return;
  localStorage.setItem(revisionMsKey(domain), String(Math.max(0, Math.floor(ms))));
}

export function getServerWriteId(domain: SettingsDomain): string | null {
  return localStorage.getItem(revisionWriteIdKey(domain));
}

export function setServerWriteId(domain: SettingsDomain, writeId: string): void {
  localStorage.setItem(revisionWriteIdKey(domain), writeId);
}

export function hasPendingUpload(domain: SettingsDomain): boolean {
  return localStorage.getItem(pendingKey(domain)) === '1';
}

export function markPendingUpload(domain: SettingsDomain, pending: boolean): void {
  if (pending) {
    localStorage.setItem(pendingKey(domain), '1');
  } else {
    localStorage.removeItem(pendingKey(domain));
  }
}

export function getLocalSchemaVersion(domain: SettingsDomain): number {
  const parsed = Number(localStorage.getItem(localSchemaKey(domain)));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function setLocalSchemaVersion(domain: SettingsDomain, schemaVersion: number): void {
  localStorage.setItem(localSchemaKey(domain), String(Math.max(0, Math.floor(schemaVersion))));
}

export function getLocalBuildNumber(domain: SettingsDomain): string | null {
  return localStorage.getItem(localBuildKey(domain));
}

export function setLocalBuildNumber(domain: SettingsDomain, buildNumber: string): void {
  localStorage.setItem(localBuildKey(domain), buildNumber);
}

export function getSyncBase(domain: SettingsDomain): unknown | null {
  const stored = localStorage.getItem(syncBaseKey(domain));
  if (!stored) return null;
  try {
    return JSON.parse(stored) as unknown;
  } catch {
    return null;
  }
}

export function setSyncBase(domain: SettingsDomain, data: unknown): void {
  localStorage.setItem(syncBaseKey(domain), JSON.stringify(data));
}

export function getLocalEditSequence(domain: SettingsDomain): number {
  const parsed = Number(localStorage.getItem(localEditSeqKey(domain)));
  return Number.isFinite(parsed) ? parsed : 0;
}

function bumpLocalEditSequence(domain: SettingsDomain): void {
  const next = getLocalEditSequence(domain) + 1;
  localStorage.setItem(localEditSeqKey(domain), String(next));
}

export function resetSyncState(): void {
  for (const domain of SETTINGS_DOMAINS) {
    localStorage.setItem(revisionKey(domain), EPOCH_ISO);
    localStorage.setItem(revisionMsKey(domain), '0');
    localStorage.removeItem(revisionWriteIdKey(domain));
    localStorage.removeItem(pendingKey(domain));
    localStorage.removeItem(syncBaseKey(domain));
    localStorage.removeItem(`${LEGACY_LAST_MODIFIED_PREFIX}${domain}`);
  }
}

/** Preserve offline edits for the same user; reset only when the account changes. */
export function beginCloudSession(userId: string): void {
  const previousUserId = localStorage.getItem(SYNC_USER_KEY);
  if (previousUserId && previousUserId !== userId) {
    resetSyncState();
  }
  localStorage.setItem(SYNC_USER_KEY, userId);
}

export function endCloudSession(): void {
  return;
}

/** Local user edit — queue upload; never bump revision with client clock. */
export function touchSettingsModified(domain: SettingsDomain): void {
  // Intentionally mark pending even before baseline: first sync must be able to upload local edits.
  markPendingUpload(domain, true);
  setLocalSchemaVersion(domain, CURRENT_SYNC_SCHEMA_VERSION_BY_DOMAIN[domain]);
  setLocalBuildNumber(domain, CURRENT_SYNC_BUILD_NUMBER);
  bumpLocalEditSequence(domain);
  window.dispatchEvent(
    new CustomEvent<SettingsChangedDetail>(SETTINGS_CHANGED_EVENT, { detail: { domain } }),
  );
}

/** @deprecated use getServerRevision */
export function getSettingsLastModified(domain: SettingsDomain): string {
  return getServerRevision(domain);
}

/** @deprecated use setServerRevision */
export function setSettingsLastModified(domain: SettingsDomain, iso: string): void {
  setServerRevision(domain, iso);
  markPendingUpload(domain, false);
}

export function touchAllSettingsModified(): void {
  for (const domain of SETTINGS_DOMAINS) {
    touchSettingsModified(domain);
  }
}

export function isSettingsChangedEvent(event: Event): event is CustomEvent<SettingsChangedDetail> {
  return event.type === SETTINGS_CHANGED_EVENT;
}

export function isRemoteSettingsAppliedEvent(
  event: Event,
): event is CustomEvent<RemoteSettingsAppliedDetail> {
  return event.type === REMOTE_SETTINGS_APPLIED_EVENT;
}
