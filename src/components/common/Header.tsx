import React, { useCallback } from 'react';
import { colors, formatDataTimestamp } from '../../utils/formatting';
import { useTheme } from '../../context/ThemeContext';
import { useChartModal } from '../../context/ChartModalContext';
import { usePenCompatibleClick } from '../../utils/penClick';
import { Icon, XIcon } from './Icon';

interface HeaderProps {
  loading: boolean;
  generatedAt?: string | null;
  badgeLabel?: string;
  badgeOk?: boolean;
  liveEnabled: boolean;
  onToggleLive: () => void;
  onSnap?: () => void;
  onShareX?: () => void;
  onCopy?: () => void;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  loading,
  generatedAt,
  badgeLabel,
  badgeOk,
  liveEnabled,
  onToggleLive,
  onSnap,
  onShareX,
  onCopy,
  onOpenSettings,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { openFreeChart } = useChartModal();
  const themePenClick = usePenCompatibleClick(() => toggleTheme());
  const livePenClick = usePenCompatibleClick(() => onToggleLive());
  const chartPenClick = usePenCompatibleClick(() => openFreeChart());
  const snapPenClick = usePenCompatibleClick(() => onSnap?.());
  const settingsPenClick = usePenCompatibleClick(() => onOpenSettings?.());
  const [time, setTime] = React.useState<string>('—');
  const [date, setDate] = React.useState<string>('—');

  React.useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setDate(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      );
      
      const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
      const tzStr = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' })
        .formatToParts(now)
        .find((part) => part.type === 'timeZoneName')?.value ?? '';
      
      setTime(tzStr ? `${timeStr} ${tzStr}` : timeStr);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedInfo = formatDataTimestamp(generatedAt ?? null);
  const badgeText = badgeLabel ?? formattedInfo?.badge ?? (loading ? 'LOADING DATA...' : 'DATA READY');
  const badgeColor = loading ? colors.text3 : badgeOk ? colors.green : colors.amber;

  return (
    <div className="hdr">
      <div className="hdr-l">
        <div className="logo">Market Dashboard</div>
        <div className="hdr-meta">
          <div style={{ letterSpacing: '1px' }}>{date}</div>
          <strong>{time}</strong>
        </div>
        {/*<div className="live">
          <span className="dot" />
          HKT LIVE
        </div>*/}
      </div>

      <div className="hdr-r">
        <span
          id="lastUpdatedBadge"
          style={{
            fontSize: '9px',
            color: badgeColor,
            letterSpacing: '1px',
            padding: '4px 8px',
            background: colors.bg3,
            border: `1px solid ${colors.border}`,
            borderRadius: '2px',
            maxWidth: '360px',
            textAlign: 'right',
          }}
        >
          {badgeText}
        </span>
        <button
          type="button"
          className="btn btn-theme"
          {...themePenClick}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          <Icon name={theme === 'light' ? 'dark_mode' : 'light_mode'} size="sm" />
        </button>
        <button
          type="button"
          className={`btn btn-x${liveEnabled ? ' is-live-on' : ''}`}
          {...livePenClick}
          title={liveEnabled ? 'Disable live data refresh' : 'Enable live data refresh'}
        >
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: liveEnabled ? colors.green : colors.text3,
              boxShadow: liveEnabled ? `0 0 6px ${colors.green}` : 'none',
              animation: liveEnabled ? 'blink 2s infinite' : 'none',
              marginRight: '2px',
            }}
          />
          <span>{liveEnabled ? 'LIVE ON' : 'LIVE'}</span>
        </button>
        <button
          type="button"
          className="btn btn-x"
          {...chartPenClick}
          title="Open chart for any symbol (C)"
        >
          <Icon name="show_chart" size="sm" />
          CHART
        </button>
        <button type="button" className="btn btn-x" {...snapPenClick}>
          <Icon name="photo_camera" size="sm" />
          SNAP
        </button>
        <button
          type="button"
          className="btn btn-theme"
          {...settingsPenClick}
          title="Open settings"
          aria-label="Open settings"
        >
          <Icon name="settings" size="sm" />
        </button>
        {/*
        <button type="button" className="btn btn-x" {...sharePenClick}>
          <XIcon size={13} />
          SHARE
        </button>
        <button type="button" className="btn btn-x" {...copyPenClick}>
          <Icon name="content_copy" size="sm" />
          COPY
        </button>
        */}
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};
