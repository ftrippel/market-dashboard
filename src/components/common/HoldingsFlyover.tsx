import React, { useCallback, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { colors } from '../../utils/formatting';
import type { Holding } from '../../types';
import { Icon } from './Icon';
import { CardCopyButton } from './Card';
import { useSymbolPreviewActions } from '../../context/SymbolPreviewContext';
import { useScrollLock } from '../../hooks/useScrollLock';
import { dismissOverlay } from '../../utils/focus';
import { useOverlayDismiss } from '../../utils/overlayStack';
import { usePenCompatibleClick } from '../../utils/penClick';
import { stripExchangeSuffix } from '../../utils/symbols';
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
  const { hidePreview } = useSymbolPreviewActions();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const siblings = holdings.map((h) => ({ sym: h.s, name: h.n }));

  const close = useCallback(() => {
    hidePreview();
    dismissOverlay(() => onCloseRef.current());
  }, [hidePreview]);

  useOverlayDismiss(true, close);
  useScrollLock(true);

  const totalWeight = holdings.reduce((sum, holding) => sum + holding.w, 0);
  const closePenClick = usePenCompatibleClick(close);

  return createPortal(
    <div
      className="table-flyover open"
      data-scroll-lock-overlay
      role="presentation"
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
          <CardCopyButton symbols={holdings.map((holding) => stripExchangeSuffix(holding.s))} />
          <button type="button" {...closePenClick}>
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
                      <SymbolLink sym={holding.s} name={holding.n} label={holding.s} siblings={siblings} />
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
    </div>,
    document.body,
  );
};
