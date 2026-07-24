// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markPendingUpload, touchSettingsModified } from '../services/settingsEvents';
import { SettingsSyncProvider } from './SettingsSyncContext';

const syncMocks = vi.hoisted(() => ({
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
  applyRemoteSnapshot: vi.fn(),
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
});
