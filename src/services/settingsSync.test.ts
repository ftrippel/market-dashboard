// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  getDocFromServer: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDocFromServer: firestoreMocks.getDocFromServer,
  onSnapshot: vi.fn(() => () => undefined),
  runTransaction: firestoreMocks.runTransaction,
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
  markPendingUpload,
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
    firestoreMocks.runTransaction.mockImplementation(() => {
      throw new Error('Unexpected transaction in settings sync test.');
    });
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

  it('pulls cloud preferences when local defaults differ without a pending edit', async () => {
    const localPreferences = exportPreferencesSettings();
    const remotePreferences = {
      ...localPreferences,
      marketColumns: ['d1', 'w1', 'm3', 'm6'],
      defaultMarketSortColumn: 'm3',
    };
    const remoteData: Record<SettingsDomain, unknown> = {
      preferences: remotePreferences,
      calculator: exportCalculatorSettings(),
      watchlists: exportWatchlistsForSync(),
    };
    const remoteUpdatedAt = '2026-07-25T10:00:00.000Z';

    for (const domain of SETTINGS_DOMAINS) {
      setServerRevision(domain, remoteUpdatedAt);
      setServerWriteId(domain, `write-${domain}`);
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
            schemaVersion: 3,
            buildNumber: '1',
            writeId: `write-${domain}`,
          }),
        };
      },
    );

    const result = await reconcileSettings('user-a');

    expect(result.preferences).toBe('downloaded');
    expect(JSON.parse(localStorage.getItem('marketColumns') ?? 'null')).toEqual([
      'd1',
      'w1',
      'm3',
      'm6',
    ]);
    expect(localStorage.getItem('defaultMarketSortColumn')).toBe('m3');
  });

  it('merges a pending preference edit without restoring stale columns', async () => {
    const basePreferences = exportPreferencesSettings();
    const remotePreferences = {
      ...basePreferences,
      marketColumns: ['d1', 'w1', 'm3', 'm6'],
      defaultMarketSortColumn: 'm3',
    };
    const remoteUpdatedAt = '2026-07-25T10:00:00.000Z';
    const uploadUpdatedAt = '2026-07-25T10:05:00.000Z';
    let remotePayload = {
      data: remotePreferences,
      updatedAt: remoteUpdatedAt,
      schemaVersion: 3,
      buildNumber: '1',
      writeId: 'remote-preferences',
    };

    localStorage.setItem('market-dashboard-theme', 'light');
    setServerRevision('preferences', '2026-07-25T09:00:00.000Z');
    setServerWriteId('preferences', 'base-preferences');
    setSyncBase('preferences', basePreferences);
    markPendingUpload('preferences', true);

    const calculator = exportCalculatorSettings();
    const watchlists = exportWatchlistsForSync();
    for (const domain of ['calculator', 'watchlists'] as const) {
      setServerRevision(domain, remoteUpdatedAt);
      setServerWriteId(domain, `write-${domain}`);
      setSyncBase(domain, domain === 'calculator' ? calculator : watchlists);
    }

    firestoreMocks.getDocFromServer.mockImplementation(
      async (ref: { path: string }) => {
        const domain = ref.path.split('/').at(-1);
        if (domain === 'dashboard') {
          return { exists: () => false };
        }
        if (domain === 'preferences') {
          return { exists: () => true, data: () => remotePayload };
        }

        const data = domain === 'calculator' ? calculator : watchlists;
        return {
          exists: () => true,
          data: () => ({
            data,
            updatedAt: remoteUpdatedAt,
            schemaVersion: 1,
            buildNumber: '1',
            writeId: `write-${domain}`,
          }),
        };
      },
    );
    firestoreMocks.runTransaction.mockImplementation(
      async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) => {
        const transaction = {
          get: async () => ({ exists: () => true, data: () => remotePayload }),
          set: (_ref: unknown, value: typeof remotePayload) => {
            remotePayload = {
              ...remotePayload,
              ...value,
              updatedAt: uploadUpdatedAt,
            };
          },
        };
        return callback(transaction);
      },
    );

    const result = await reconcileSettings('user-a');

    expect(result.preferences).toBe('uploaded');
    expect(remotePayload.data).toMatchObject({
      theme: 'light',
      marketColumns: ['d1', 'w1', 'm3', 'm6'],
      defaultMarketSortColumn: 'm3',
    });
    expect(exportPreferencesSettings()).toMatchObject(remotePayload.data);
  });
});
