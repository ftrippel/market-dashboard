import React, { useEffect, useId, useState } from 'react';
import type { Holding, MarketData, MarketTableOptions } from '../../types';
import { Card } from './Card';
import { Icon } from './Icon';
import { MarketTable } from './MarketTable';
import { useChartModal } from '../../context/ChartModalContext';

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
  const titleId = useId();
  const canExpand = data.length > previewCount;
  const { chart } = useChartModal();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (chart.open) return;
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, chart.open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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

      {open && (
        <div
          className="table-flyover open"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
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
                {expandTitle}
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                <Icon name="close" size="xs" />
                CLOSE
              </button>
            </div>
            <div className="table-flyover-body">
              <MarketTable data={data} holdings={holdings} {...tableProps} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
