// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  getDocFromServer: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDocFromServer: firestoreMocks.getDocFromServer,
  onSnapshot: vi.fn(() => () => undefined),
  runTransaction: vi.fn(() => {
    throw new Error('Unexpected transaction in settings sync test.');
  }),
  serverTimestamp: vi.fn(),
}));

vi.mock('./firebase', () => ({
  getFirebaseDb: vi.fn(() => ({})),
}));

import { persistWatchlistStorage } from '../features/watchlist/watchlistStorage';
import {
  exportCalculatorSettings,
  exportPreferencesSettings,
  exportWatchlistsForSync,
} from './settingsBackup';
import {
  getServerRevision,
  REMOTE_SETTINGS_APPLIED_EVENT,
  setServerRevision,
  setServerWriteId,
  setSyncBase,
  SETTINGS_DOMAINS,
  type SettingsDomain,
} from './settingsEvents';
import { reconcileSettings } from './settingsSync';

describe('settings reconciliation', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('updates the cloud baseline without reapplying identical local content', async () => {
    persistWatchlistStorage({
      activeId: 'main',
      watchlists: [
        {
          id: 'main',
          name: 'MAIN',
          comment: 'Keep this editor stable',
          items: [{ sym: 'AAPL', tags: ['Core'], comment: 'Holding note' }],
        },
      ],
    });

    const remoteData: Record<SettingsDomain, unknown> = {
      preferences: exportPreferencesSettings(),
      calculator: exportCalculatorSettings(),
      watchlists: exportWatchlistsForSync(),
    };
    const remoteUpdatedAt = '2026-07-25T10:00:00.000Z';

    for (const domain of SETTINGS_DOMAINS) {
      setServerRevision(domain, '2026-07-25T09:00:00.000Z');
      setServerWriteId(domain, `old-${domain}`);
      setSyncBase(domain, remoteData[domain]);
    }

    firestoreMocks.getDocFromServer.mockImplementation(
      async (ref: { path: string }) => {
        const domain = ref.path.split('/').at(-1);
        if (domain === 'dashboard') {
          return { exists: () => false };
        }

        return {
          exists: () => true,
          data: () => ({
            data: remoteData[domain as SettingsDomain],
            updatedAt: remoteUpdatedAt,
            schemaVersion: 1,
            buildNumber: '1',
            writeId: `new-${domain}`,
          }),
        };
      },
    );

    const remoteApplied = vi.fn();
    window.addEventListener(REMOTE_SETTINGS_APPLIED_EVENT, remoteApplied);

    const result = await reconcileSettings('user-a');

    window.removeEventListener(REMOTE_SETTINGS_APPLIED_EVENT, remoteApplied);
    expect(result).toEqual({
      preferences: 'unchanged',
      calculator: 'unchanged',
      watchlists: 'unchanged',
    });
    expect(remoteApplied).not.toHaveBeenCalled();
    for (const domain of SETTINGS_DOMAINS) {
      expect(getServerRevision(domain)).toBe(remoteUpdatedAt);
    }
  });
});
