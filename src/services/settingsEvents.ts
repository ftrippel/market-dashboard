export type SettingsDomain = 'preferences' | 'calculator' | 'watchlists';

export const SETTINGS_DOMAINS: SettingsDomain[] = ['preferences', 'calculator', 'watchlists'];

export const SETTINGS_CHANGED_EVENT = 'dashboard-settings-changed';
export const REMOTE_SETTINGS_APPLIED_EVENT = 'dashboard-settings-remote-applied';

const REVISION_PREFIX = 'dashboard-settings-revision-';
const PENDING_PREFIX = 'dashboard-settings-pending-';
const SYNC_USER_KEY = 'dashboard-settings-sync-user';
const LEGACY_LAST_MODIFIED_PREFIX = 'dashboard-settings-last-modified-';

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

function pendingKey(domain: SettingsDomain): string {
  return `${PENDING_PREFIX}${domain}`;
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

export function resetSyncState(): void {
  for (const domain of SETTINGS_DOMAINS) {
    localStorage.setItem(revisionKey(domain), EPOCH_ISO);
    localStorage.removeItem(pendingKey(domain));
    localStorage.removeItem(`${LEGACY_LAST_MODIFIED_PREFIX}${domain}`);
  }
}

/** Start a fresh cloud session (sign-in / page load while signed in). */
export function beginCloudSession(userId: string): void {
  resetSyncState();
  localStorage.setItem(SYNC_USER_KEY, userId);
}

export function endCloudSession(): void {
  localStorage.removeItem(SYNC_USER_KEY);
  resetSyncState();
}

/** Local user edit — queue upload; never bump revision with client clock. */
export function touchSettingsModified(domain: SettingsDomain): void {
  if (hasCloudBaseline(domain)) {
    markPendingUpload(domain, true);
  }
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
