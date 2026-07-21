import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useSettings } from '../../context/SettingsContext';
import { useSettingsSync } from '../../context/SettingsSyncContext';
import { useScrollLock } from '../../hooks/useScrollLock';
import {
  downloadDashboardSettings,
  importDashboardSettingsFromFile,
  resetAllSettingsToDefaults,
  resetWatchlistsToDefault,
} from '../../services/settingsBackup';
import { loadWatchlistStorage } from '../../features/watchlist/watchlistStorage';
import {
  MAX_CHART_MAS,
  clampMaPeriod,
  type MaType,
} from '../../types/chartMaSettings';
import { dismissOverlay } from '../../utils/focus';
import { formatAuthError } from '../../utils/authErrors';
import { useOverlayDismiss } from '../../utils/overlayStack';
import { usePenCheckboxToggle, usePenCompatibleClick, usePenSelectActivate } from '../../utils/penClick';
import { Icon } from './Icon';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'display' | 'charts' | 'watchlist' | 'sync' | 'backup';

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'display', label: 'Display' },
  { id: 'charts', label: 'Charts' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'sync', label: 'Sync' },
  { id: 'backup', label: 'Backup' },
];

const inputStyle: CSSProperties = {
  background: 'var(--bg2)',
  color: 'var(--text)',
  border: '1px solid var(--border2)',
  borderRadius: '4px',
  padding: '4px 8px',
  fontSize: '12px',
  fontWeight: 500,
  outline: 'none',
};

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const {
    enableHoverPreview,
    setEnableHoverPreview,
    sparklineMode,
    setSparklineMode,
    chartMaSettings,
    updateChartMa,
    addChartMa,
    removeChartMa,
  } = useSettings();
  const { configured, user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const confirm = useConfirm();
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('display');
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
      !(await confirm({
        title: 'Import settings',
        message:
          'Import settings? This will replace your current dashboard settings and watchlists.',
        confirmLabel: 'Import',
      }))
    ) {
      return;
    }

    try {
      await importDashboardSettingsFromFile(file);
      window.location.reload();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.');
    }
  }, [confirm]);

  const exportPenClick = usePenCompatibleClick(handleExport);
  const importPenClick = usePenCompatibleClick(handleImportClick);

  const handleGoogleSignIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(formatAuthError(err));
    }
  }, [signInWithGoogle]);

  const handleSignOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOut();
    } catch (err) {
      setAuthError(formatAuthError(err));
    }
  }, [signOut]);

  const handleSyncNow = useCallback(async () => {
    setAuthError(null);
    await syncNow();
  }, [syncNow]);

  const handleClearWatchlists = useCallback(async () => {
    const storage = loadWatchlistStorage();
    const symbolCount = storage.watchlists.reduce((sum, list) => sum + list.items.length, 0);

    if (
      !(await confirm({
        title: 'Clear watchlists',
        message:
          symbolCount === 0 && storage.watchlists.length <= 1
            ? 'Watchlists are already empty. Reset to a single default watchlist anyway?'
            : `Delete all watchlists and ${symbolCount} symbol${symbolCount === 1 ? '' : 's'}? This cannot be undone locally.`,
        confirmLabel: 'Clear all',
        destructive: true,
      }))
    ) {
      return;
    }

    resetWatchlistsToDefault();
  }, [confirm]);

  const handleResetAllSettings = useCallback(async () => {
    if (
      !(await confirm({
        title: 'Reset all settings',
        message:
          'Reset all dashboard settings to defaults? This clears watchlists, chart preferences, calculator values, and display options.',
        confirmLabel: 'Reset all',
        destructive: true,
      }))
    ) {
      return;
    }

    resetAllSettingsToDefaults();
    setActiveTab('display');
  }, [confirm]);

  const googleSignInPenClick = usePenCompatibleClick(handleGoogleSignIn);
  const signOutPenClick = usePenCompatibleClick(handleSignOut);
  const syncNowPenClick = usePenCompatibleClick(handleSyncNow);
  const clearWatchlistsPenClick = usePenCompatibleClick(handleClearWatchlists);
  const resetAllSettingsPenClick = usePenCompatibleClick(handleResetAllSettings);

  const watchlistStorage = loadWatchlistStorage();
  const watchlistSymbolCount = watchlistStorage.watchlists.reduce(
    (sum, list) => sum + list.items.length,
    0,
  );

  const handleMaPeriodChange = useCallback((id: string, rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return;
    updateChartMa(id, { period: clampMaPeriod(parsed) });
  }, [updateChartMa]);

  const handleRemoveChartMa = useCallback(async (id: string) => {
    if (
      !(await confirm({
        title: 'Remove moving average',
        message: 'Remove this moving average?',
        confirmLabel: 'Remove',
        destructive: true,
      }))
    ) {
      return;
    }
    removeChartMa(id);
  }, [confirm, removeChartMa]);

  const addChartMaPenClick = usePenCompatibleClick(addChartMa);

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
          width: 'min(460px, 95vw)',
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

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            padding: '10px 14px 0',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`s-tab${activeTab === tab.id ? ' on' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '280px' }}>
          {activeTab === 'display' && (
            <>
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
                      ...inputStyle,
                      cursor: 'pointer',
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
            </>
          )}

          {activeTab === 'charts' && (
            <>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
                Add, remove, and configure moving averages shown on chart modals.
              </p>

              {chartMaSettings.length === 0 && (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)' }}>
                  No moving averages configured.
                </p>
              )}

              {chartMaSettings.map((ma) => (
                <div
                  key={ma.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'nowrap',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    background: 'var(--bg2)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ma.enabled}
                    onChange={(e) => updateChartMa(ma.id, { enabled: e.target.checked })}
                    aria-label="Enable moving average"
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: 'var(--accent)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text2)' }}>
                    Type
                    <select
                      value={ma.type}
                      onChange={(e) => updateChartMa(ma.id, { type: e.target.value as MaType })}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="sma">SMA</option>
                      <option value="ema">EMA</option>
                    </select>
                  </label>

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text2)' }}>
                    Length
                    <input
                      type="number"
                      min={2}
                      max={500}
                      value={ma.period}
                      onChange={(e) => handleMaPeriodChange(ma.id, e.target.value)}
                      style={{ ...inputStyle, width: '72px' }}
                    />
                  </label>

                  <input
                    type="color"
                    value={ma.color}
                    onChange={(e) => updateChartMa(ma.id, { color: e.target.value })}
                    aria-label="Color"
                    style={{
                      width: '32px',
                      height: '24px',
                      padding: 0,
                      border: '1px solid var(--border2)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: 'transparent',
                      flexShrink: 0,
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => handleRemoveChartMa(ma.id)}
                    aria-label="Remove moving average"
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '22px',
                      height: '22px',
                      padding: 0,
                      border: 'none',
                      borderRadius: '4px',
                      background: 'transparent',
                      color: 'var(--text3)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="close" size="xs" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn"
                {...addChartMaPenClick}
                disabled={chartMaSettings.length >= MAX_CHART_MAS}
                style={{ alignSelf: 'flex-start' }}
              >
                Add MA
              </button>
              {chartMaSettings.length >= MAX_CHART_MAS && (
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text3)' }}>
                  Maximum of {MAX_CHART_MAS} moving averages.
                </p>
              )}
            </>
          )}

          {activeTab === 'watchlist' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
                Watchlists
              </span>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
                {watchlistStorage.watchlists.length} watchlist
                {watchlistStorage.watchlists.length === 1 ? '' : 's'} with {watchlistSymbolCount} symbol
                {watchlistSymbolCount === 1 ? '' : 's'} stored on this device.
              </p>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
                Clear everything and restore a single empty default watchlist. If cloud sync is enabled,
                the change uploads automatically.
              </p>
              <button
                type="button"
                className="btn"
                {...clearWatchlistsPenClick}
                style={{ alignSelf: 'flex-start', color: 'var(--red)', borderColor: 'var(--red)' }}
              >
                Clear all watchlists
              </button>
            </div>
          )}

          {activeTab === 'sync' && (
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
          )}

          {activeTab === 'backup' && (
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

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

              <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>
                Reset
              </span>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
                Restore all dashboard settings to factory defaults — display, charts, calculator, and watchlists.
              </p>
              <button
                type="button"
                className="btn"
                {...resetAllSettingsPenClick}
                style={{ alignSelf: 'flex-start', color: 'var(--red)', borderColor: 'var(--red)' }}
              >
                Reset all settings
              </button>
            </div>
          )}
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
