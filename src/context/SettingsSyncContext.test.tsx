// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markPendingUpload,
  REMOTE_SETTINGS_APPLIED_EVENT,
  touchSettingsModified,
} from '../services/settingsEvents';
import { SettingsSyncProvider } from './SettingsSyncContext';

const syncMocks = vi.hoisted(() => ({
  applyRemoteSnapshot: vi.fn(),
  reconcileSettings: vi.fn(),
  subscribeToRemoteSettings: vi.fn(),
  uploadDomain: vi.fn(),
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    configured: true,
    user: { uid: 'user-a' },
    loading: false,
  }),
}));

vi.mock('../services/settingsSync', () => ({
  applyRemoteSnapshot: syncMocks.applyRemoteSnapshot,
  reconcileSettings: syncMocks.reconcileSettings,
  subscribeToRemoteSettings: syncMocks.subscribeToRemoteSettings,
  summarizeReconcileResult: vi.fn(() => 'unchanged'),
  uploadDomain: syncMocks.uploadDomain,
}));

function TestEditor() {
  return (
    <textarea
      aria-label="Synced notes"
      onChange={() => touchSettingsModified('watchlists')}
    />
  );
}

describe('SettingsSyncProvider text editing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    syncMocks.reconcileSettings.mockResolvedValue({
      preferences: 'unchanged',
      calculator: 'unchanged',
      watchlists: 'unchanged',
    });
    syncMocks.subscribeToRemoteSettings.mockReturnValue(() => undefined);
    syncMocks.applyRemoteSnapshot.mockReturnValue(false);
    syncMocks.uploadDomain.mockImplementation(async (_userId: string, domain: 'watchlists') => {
      markPendingUpload(domain, false);
    });
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('waits to upload text changes until the editor loses focus', async () => {
    render(
      <SettingsSyncProvider>
        <TestEditor />
      </SettingsSyncProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(syncMocks.reconcileSettings).toHaveBeenCalledOnce();

    const editor = screen.getByRole('textbox', { name: 'Synced notes' });
    editor.focus();
    fireEvent.change(editor, { target: { value: 'Still typing' } });

    await vi.advanceTimersByTimeAsync(3_000);
    expect(syncMocks.uploadDomain).not.toHaveBeenCalled();

    editor.blur();
    await vi.advanceTimersByTimeAsync(1_500);

    expect(syncMocks.uploadDomain).toHaveBeenCalledOnce();
    expect(syncMocks.uploadDomain).toHaveBeenCalledWith('user-a', 'watchlists');
  });

  it('does not rebroadcast an event already emitted by the remote apply', async () => {
    render(
      <SettingsSyncProvider>
        <TestEditor />
      </SettingsSyncProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const remoteApplied = vi.fn();
    window.addEventListener(REMOTE_SETTINGS_APPLIED_EVENT, remoteApplied);
    syncMocks.applyRemoteSnapshot.mockImplementationOnce(() => {
      window.dispatchEvent(
        new CustomEvent(REMOTE_SETTINGS_APPLIED_EVENT, {
          detail: { domain: 'watchlists' },
        }),
      );
      return true;
    });

    const onDomainUpdate = syncMocks.subscribeToRemoteSettings.mock.calls[0][1];
    act(() => {
      onDomainUpdate(
        'watchlists',
        { watchlists: [] },
        '2026-07-25T10:00:00.000Z',
        { schemaVersion: 1, buildNumber: '1', writeId: 'write-a' },
      );
    });

    window.removeEventListener(REMOTE_SETTINGS_APPLIED_EVENT, remoteApplied);
    expect(remoteApplied).toHaveBeenCalledOnce();
  });
});
