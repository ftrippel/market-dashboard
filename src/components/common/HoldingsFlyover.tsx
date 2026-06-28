import React, { useEffect, useId, useState } from 'react';
import { copySnapshotText } from '../../services/share';
import { colors } from '../../utils/formatting';
import type { Holding } from '../../types';
import { Icon } from './Icon';
import { useChartModal } from '../../context/ChartModalContext';
import { SymbolLink } from './TradingViewModal';

interface HoldingsFlyoverProps {
  etfSym: string;
  displayName: string;
  holdings: Holding[];
  onClose: () => void;
}

const thStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '9.5px',
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: colors.text3,
  background: colors.bg3,
  borderBottom: `1px solid ${colors.border}`,
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '12px',
};

export const HoldingsFlyover: React.FC<HoldingsFlyoverProps> = ({
  etfSym,
  displayName,
  holdings,
  onClose,
}) => {
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const { chart } = useChartModal();

  const handleCopySymbols = async () => {
    const text = holdings.map((holding) => holding.s).join(', ');
    try {
      await copySnapshotText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (chart.open) return;
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, chart.open]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const totalWeight = holdings.reduce((sum, holding) => sum + holding.w, 0);

  return (
    <div
      className="table-flyover open"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="table-flyover-box table-flyover-box--holdings"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="table-flyover-hdr">
          <div id={titleId} className="table-flyover-title">
            Top 10 Holdings — {displayName} · {etfSym}
          </div>
          <button type="button" onClick={handleCopySymbols} aria-label="Copy holding symbols">
            <Icon name="content_copy" size="xs" />
            {copied ? 'COPIED' : 'COPY SYMBOLS'}
          </button>
          <button type="button" onClick={onClose}>
            <Icon name="close" size="xs" />
            CLOSE
          </button>
        </div>
        <div className="table-flyover-body">
          <div className="table-scroll">
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Symbol</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Name</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding) => (
                  <tr
                    key={holding.s}
                    style={{
                      borderBottom: `1px solid ${colors.rowBorder}`,
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      <SymbolLink sym={holding.s} name={holding.n} label={holding.s} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left', color: colors.text2 }}>{holding.n}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: colors.accent, fontWeight: 500 }}>
                      {holding.w.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                  <td
                    colSpan={2}
                    style={{ ...tdStyle, textAlign: 'right', color: colors.text2, fontWeight: 500 }}
                  >
                    Total
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: colors.accent, fontWeight: 600 }}>
                    {totalWeight.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
