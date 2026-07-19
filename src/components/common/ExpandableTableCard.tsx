import React, { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Holding, MarketData, MarketTableOptions } from '../../types';
import { Card, CardCopyButton } from './Card';
import { CardSearchContext } from './CardSearchContext';
import { Icon } from './Icon';
import { MarketTable } from './MarketTable';
import { useChartModal } from '../../context/ChartModalContext';
import { useSymbolPreview } from '../../context/SymbolPreviewContext';
import { useScrollLock } from '../../hooks/useScrollLock';
import { colors } from '../../utils/formatting';
import { dismissOverlay } from '../../utils/focus';

interface ExpandableTableCardProps {
  label: React.ReactNode;
  expandTitle: string;
  data: MarketData[];
  holdings?: Record<string, Holding[]>;
  previewCount?: number;
  style?: React.CSSProperties;
  tableProps: MarketTableOptions;
}

export const ExpandableTableCard: React.FC<ExpandableTableCardProps> = ({
  label,
  expandTitle,
  data,
  holdings = {},
  previewCount = 10,
  style,
  tableProps,
}) => {
  const [open, setOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const titleId = useId();
  const canExpand = data.length > previewCount;
  const { chart } = useChartModal();
  const { hidePreview } = useSymbolPreview();

  const close = useCallback(() => {
    hidePreview();
    dismissOverlay(() => setOpen(false));
  }, [hidePreview]);

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (chart.open) return;
        close();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, chart.open, close]);

  useEffect(() => {
    if (!open) {
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <>
      <Card
        label={label}
        style={style}
        symbols={data.map((x) => x.sym)}
        headerAction={
          canExpand ? (
            <button
              type="button"
              className="table-expand-btn"
              aria-label={`Expand table — ${expandTitle}`}
              title={`View all ${data.length} rows`}
              onClick={() => setOpen(true)}
            >
              <Icon name="open_in_full" size="sm" />
            </button>
          ) : undefined
        }
      >
        <MarketTable data={data} holdings={holdings} maxRows={previewCount} {...tableProps} />
      </Card>

      {open &&
        createPortal(
          <CardSearchContext.Provider value={{ searchQuery, setSearchQuery }}>
            <div
              className="table-flyover open"
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <div
                className="table-flyover-box"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="table-flyover-hdr">
                  <div id={titleId} className="table-flyover-title">
                    {isSearchOpen ? (
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          color: colors.text,
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '2px',
                          width: '180px',
                          outline: 'none',
                          fontFamily: 'IBM Plex Mono, monospace',
                          textTransform: 'none',
                          letterSpacing: 'normal',
                        }}
                        autoFocus
                      />
                    ) : (
                      expandTitle
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      className="table-expand-btn"
                      title="Search table"
                      aria-label="Search table"
                      onClick={() => {
                        setIsSearchOpen(!isSearchOpen);
                        if (isSearchOpen) setSearchQuery('');
                      }}
                      style={{
                        color: isSearchOpen ? colors.accent : undefined,
                        borderColor: isSearchOpen ? colors.accent : undefined,
                        background: isSearchOpen ? 'var(--accent-subtle-bg)' : undefined,
                      }}
                    >
                      <Icon name="search" size="sm" />
                    </button>
                    <CardCopyButton symbols={data.map((x) => x.sym)} />
                    <button type="button" onClick={close}>
                      <Icon name="close" size="xs" />
                      CLOSE
                    </button>
                  </div>
                </div>
                <div className="table-flyover-body">
                  <MarketTable data={data} holdings={holdings} {...tableProps} />
                </div>
              </div>
            </div>
          </CardSearchContext.Provider>,
          document.body,
        )}
    </>
  );
};
