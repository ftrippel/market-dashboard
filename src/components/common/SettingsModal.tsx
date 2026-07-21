import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useSettingsSync } from '../../context/SettingsSyncContext';
import { useScrollLock } from '../../hooks/useScrollLock';
import {
  downloadDashboardSettings,
  importDashboardSettingsFromFile,
} from '../../services/settingsBackup';
import { dismissOverlay } from '../../utils/focus';
import { useOverlayDismiss } from '../../utils/overlayStack';
import { usePenCheckboxToggle, usePenCompatibleClick, usePenSelectActivate } from '../../utils/penClick';
import { Icon } from './Icon';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const {
    enableHoverPreview,
    setEnableHoverPreview,
    sparklineMode,
    setSparklineMode,
  } = useSettings();
  const { configured, user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const { status, statusMessage, lastSyncedAt, syncNow } = useSettingsSync();

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    dismissOverlay(() => onCloseRef.current());
  }, []);

  useOverlayDismiss(open, close);
  useScrollLock(open);

  const closePenClick = usePenCompatibleClick(close);
  const hoverPreviewPenToggle = usePenCheckboxToggle(setEnableHoverPreview);
  const sparklineModePenActivate = usePenSelectActivate();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleExport = useCallback(() => {
    setImportError(null);
    downloadDashboardSettings();
  }, []);

  const handleImportClick = useCallback(() => {
    setImportError(null);
    importInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (
      !window.confirm(
        'Import settings? This will replace your current dashboard settings and watchlists.',
      )
    ) {
      return;
    }

    try {
      await importDashboardSettingsFromFile(file);
      window.location.reload();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    }
  }, []);

  const exportPenClick = usePenCompatibleClick(handleExport);
  const importPenClick = usePenCompatibleClick(handleImportClick);

  const handleGoogleSignIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in failed.');
    }
  }, [signInWithGoogle]);

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  }, [signOut]);

  const handleSyncNow = useCallback(async () => {
    setAuthError(null);
    await syncNow();
  }, [syncNow]);

  const googleSignInPenClick = usePenCompatibleClick(handleGoogleSignIn);
  const signOutPenClick = usePenCompatibleClick(handleSignOut);
  const syncNowPenClick = usePenCompatibleClick(handleSyncNow);

  if (!open) return null;

  return createPortal(
    <div
      className="tv-modal open"
      data-scroll-lock-overlay
      style={{ zIndex: 10100 }}
    >
      <div
        id="settings-modal-box"
        style={{
          width: 'min(420px, 95vw)',
          background: 'var(--bg)',
          border: '1px solid var(--border2)',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div id="tv-modal-hdr" style={{ padding: '10px 14px' }}>
          <div
            id="tv-modal-title"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '1px',
            }}
          >
            Dashboard Settings
          </div>
          <button
            type="button"
            {...closePenClick}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text3)',
              display: 'inline-flex',
              alignItems: 'center',
              padding: 0,
            }}
          >
            <Icon name="close" size="xs" />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
              Enable Hover Preview Charts
            </span>
            <input
              type="checkbox"
              checked={enableHoverPreview}
              onChange={(e) => setEnableHoverPreview(e.target.checked)}
              onPointerUp={hoverPreviewPenToggle}
              style={{
                width: '18px',
                height: '18px',
                accentColor: 'var(--accent)',
                cursor: 'pointer',
              }}
            />
          </label>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
            When enabled, hovering over any financial ticker symbol displays a 1-year daily historical line chart to the left or right of the symbol.
          </p>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
                Sparkline Display
              </span>
              <select
                value={sparklineMode}
                onChange={(e) => setSparklineMode(e.target.value as any)}
                onPointerUp={sparklineModePenActivate}
                style={{
                  background: 'var(--bg2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border2)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="line">Line Chart</option>
                <option value="bar">Bar Chart</option>
                <option value="dot">Dot Chart</option>
                <option value="none">Disabled</option>
              </select>
            </label>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
              Choose the visualization style for 5-day price changes in the market tables, or disable it completely.
            </p>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
              Cloud Sync
            </span>
            {!configured ? (
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
                Add Firebase environment variables to enable Google sign-in and automatic settings sync.
              </p>
            ) : authLoading ? (
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
                Checking sign-in status…
              </p>
            ) : user ? (
              <>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
                  Signed in as <span style={{ color: 'var(--text)' }}>{user.email ?? user.displayName ?? 'Google account'}</span>.
                  Changes sync in real time across devices.
                </p>
                {lastSyncedAt && status !== 'syncing' && !statusMessage && !authError && (
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
                    Last synced {lastSyncedAt.toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}.
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <button type="button" className="btn" {...syncNowPenClick} disabled={status === 'syncing'}>
                    {status === 'syncing' ? 'Syncing…' : 'Sync now'}
                  </button>
                  <button type="button" className="btn" {...signOutPenClick}>
                    Sign out
                  </button>
                </div>
                {(statusMessage || authError) && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '11px',
                      color: status === 'error' || authError ? 'var(--red)' : 'var(--text2)',
                      lineHeight: '1.4',
                    }}
                  >
                    {authError ?? statusMessage}
                  </p>
                )}
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
                  Sign in with Google to back up and sync your dashboard settings and watchlists.
                </p>
                <button type="button" className="btn" {...googleSignInPenClick}>
                  Sign in with Google
                </button>
                {authError && (
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--red)', lineHeight: '1.4' }}>
                    {authError}
                  </p>
                )}
              </>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
              Backup &amp; Restore
            </span>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
              Export or import all dashboard settings and watchlists as a JSON file.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="btn" {...exportPenClick}>
                Export JSON
              </button>
              <button type="button" className="btn" {...importPenClick}>
                Import JSON
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                style={{ display: 'none' }}
              />
            </div>
            {importError && (
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--red)', lineHeight: '1.4' }}>
                {importError}
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '10px 14px',
            background: 'var(--bg2)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            {...closePenClick}
            className="btn"
            style={{
              background: 'var(--accent)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
