export const SETTINGS_CHANGED_EVENT = 'dashboard-settings-changed';
export const LAST_MODIFIED_KEY = 'dashboard-settings-last-modified';

export function touchSettingsModified(): void {
  localStorage.setItem(LAST_MODIFIED_KEY, new Date().toISOString());
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}

export function getSettingsLastModified(): string {
  return localStorage.getItem(LAST_MODIFIED_KEY) ?? '1970-01-01T00:00:00.000Z';
}
