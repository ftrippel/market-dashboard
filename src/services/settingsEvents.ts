export type SettingsDomain = 'preferences' | 'calculator' | 'watchlists';

export const SETTINGS_DOMAINS: SettingsDomain[] = ['preferences', 'calculator', 'watchlists'];

export const SETTINGS_CHANGED_EVENT = 'dashboard-settings-changed';
export const REMOTE_SETTINGS_APPLIED_EVENT = 'dashboard-settings-remote-applied';

const LAST_MODIFIED_PREFIX = 'dashboard-settings-last-modified-';
const SYNC_USER_KEY = 'dashboard-settings-sync-user';

/** No cloud baseline yet — local edits must not win over cloud. */
export const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

export interface SettingsChangedDetail {
  domain: SettingsDomain;
}

export interface RemoteSettingsAppliedDetail {
  domain: SettingsDomain;
}

function lastModifiedKey(domain: SettingsDomain): string {
  return `${LAST_MODIFIED_PREFIX}${domain}`;
}

export function hasCloudBaseline(domain: SettingsDomain): boolean {
  return getSettingsLastModified(domain) !== EPOCH_ISO;
}

export function resetCloudBaseline(): void {
  for (const domain of SETTINGS_DOMAINS) {
    localStorage.setItem(lastModifiedKey(domain), EPOCH_ISO);
  }
}

/** Call once when sign-in starts — cloud wins until baseline is established. */
export function prepareSyncForUser(userId: string): void {
  resetCloudBaseline();
  localStorage.setItem(SYNC_USER_KEY, userId);
}

export function clearSyncUser(): void {
  localStorage.removeItem(SYNC_USER_KEY);
  resetCloudBaseline();
}

export function touchSettingsModified(domain: SettingsDomain): void {
  if (hasCloudBaseline(domain)) {
    localStorage.setItem(lastModifiedKey(domain), new Date().toISOString());
  }
  window.dispatchEvent(
    new CustomEvent<SettingsChangedDetail>(SETTINGS_CHANGED_EVENT, { detail: { domain } }),
  );
}

export function setSettingsLastModified(domain: SettingsDomain, iso: string): void {
  localStorage.setItem(lastModifiedKey(domain), iso);
}

export function getSettingsLastModified(domain: SettingsDomain): string {
  return localStorage.getItem(lastModifiedKey(domain)) ?? EPOCH_ISO;
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
