import { useEffect } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { Icon } from './Icon';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { enableHoverPreview, setEnableHoverPreview, sparklineMode, setSparklineMode } = useSettings();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="tv-modal open"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
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
        <div
          id="tv-modal-hdr"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 14px',
            background: 'var(--bg2)',
            borderBottom: '1px solid var(--border)',
            gap: '10px',
          }}
        >
          <div
            id="tv-modal-title"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--accent)',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              flex: 1,
            }}
          >
            Dashboard Settings
          </div>
          <button
            type="button"
            onClick={onClose}
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
              style={{
                width: '18px',
                height: '18px',
                accentColor: 'var(--accent)',
                cursor: 'pointer',
              }}
            />
          </label>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: '1.4' }}>
            When enabled, hovering over any financial ticker symbol displays a 1-year daily historical line chart.
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
            onClick={onClose}
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
    </div>
  );
}
