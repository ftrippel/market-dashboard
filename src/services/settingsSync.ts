import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore';
import {
  exportDashboardSettings,
  importDashboardSettings,
  type DashboardSettingsExport,
} from './settingsBackup';
import { getSettingsLastModified, LAST_MODIFIED_KEY } from './settingsEvents';
import { getFirebaseDb } from './firebase';

export { SETTINGS_CHANGED_EVENT } from './settingsEvents';

export type SettingsSyncResult = 'uploaded' | 'downloaded' | 'unchanged';

export interface RemoteDashboardSettings extends DashboardSettingsExport {
  updatedAt?: string;
}

function settingsDocRef(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'settings', 'dashboard');
}

function timestampToIso(value: Timestamp | string | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.toDate().toISOString();
}

export async function fetchRemoteSettings(userId: string): Promise<RemoteDashboardSettings | null> {
  const snapshot = await getDoc(settingsDocRef(userId));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  const settings = data.settings as DashboardSettingsExport | undefined;
  if (!settings) return null;

  return {
    ...settings,
    updatedAt: timestampToIso(data.updatedAt as Timestamp | string | undefined) ?? settings.exportedAt,
  };
}

export async function uploadSettings(userId: string): Promise<void> {
  const settings = exportDashboardSettings();
  const now = new Date().toISOString();
  settings.exportedAt = now;
  localStorage.setItem(LAST_MODIFIED_KEY, now);

  await setDoc(
    settingsDocRef(userId),
    {
      settings,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function reconcileSettings(userId: string): Promise<SettingsSyncResult> {
  const localModified = getSettingsLastModified();
  const remote = await fetchRemoteSettings(userId);

  if (!remote) {
    await uploadSettings(userId);
    return 'uploaded';
  }

  const remoteModified = remote.updatedAt ?? remote.exportedAt;
  const localTime = Date.parse(localModified);
  const remoteTime = Date.parse(remoteModified);

  if (remoteTime > localTime) {
    importDashboardSettings(remote);
    localStorage.setItem(LAST_MODIFIED_KEY, remoteModified);
    return 'downloaded';
  }

  if (localTime > remoteTime) {
    await uploadSettings(userId);
    return 'uploaded';
  }

  return 'unchanged';
}
