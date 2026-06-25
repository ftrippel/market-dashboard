import React, { useMemo, useState } from 'react';
import { getDisplayName, getSymbolMeta } from '../../data/symbolMeta';
import { colors, formatPrice } from '../../utils/formatting';
import type { Holding, MarketData, MarketTableOptions } from '../../types';
import { Sparkline } from './Sparkline';
import { BpsCell, PctCell } from './PctCell';
import { SymbolLink } from './TradingViewModal';

type SortKey = 'name' | 'price' | 'd1' | 'w1' | 'hi52' | 'ytd' | 'ema_uptrend';
type SortOrder = 'asc' | 'desc';

interface MarketTableProps extends MarketTableOptions {
  data: MarketData[];
  holdings?: Record<string, Holding[]>;
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

function resolveDisplayName(item: MarketData): string {
  return getDisplayName(item.sym, item.name);
}

function compareRows(a: MarketData, b: MarketData, key: SortKey, order: SortOrder): number {
  let cmp = 0;

  if (key === 'name') {
    cmp = resolveDisplayName(a).localeCompare(resolveDisplayName(b));
  } else if (key === 'ema_uptrend') {
    const score = (v?: boolean) => (v === true ? 1 : v === false ? 0 : -1);
    cmp = score(a.ema_uptrend) - score(b.ema_uptrend);
  } else {
    const aVal = Number((a as unknown as Record<string, unknown>)[key] ?? NaN);
    const bVal = Number((b as unknown as Record<string, unknown>)[key] ?? NaN);
    const aMissing = Number.isNaN(aVal);
    const bMissing = Number.isNaN(bVal);
    if (aMissing && bMissing) cmp = 0;
    else if (aMissing) cmp = 1;
    else if (bMissing) cmp = -1;
    else cmp = aVal - bVal;
  }

  return order === 'asc' ? cmp : -cmp;
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  order,
  align = 'right',
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  order: SortOrder;
  align?: 'left' | 'right' | 'center';
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  const justify =
    align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end';

  return (
    <th style={{ ...thStyle, textAlign: align, padding: 0 }}>
      <button
        type="button"
        className={`th-sort${active ? ' active' : ''}`}
        onClick={() => onSort(sortKey)}
        aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
        style={{ justifyContent: justify }}
      >
        <span>{label}</span>
        <span className="th-sort-icon" aria-hidden>
          {active ? (order === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const top = rank <= 3;
  return (
    <span
      className={top ? 'rank g' : 'rank'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '18px',
        height: '18px',
        borderRadius: '2px',
        fontSize: '9.5px',
        fontWeight: 600,
        background: top ? 'rgba(255,143,0,.1)' : colors.bg4,
        color: top ? colors.amber : colors.text3,
      }}
    >
      {rank}
    </span>
  );
}

function TrendCell({ value }: { value?: boolean }) {
  if (value === true) {
    return (
      <span className="ema-up" title="10-EMA > 20-EMA · Short-term uptrend" style={{ color: colors.green, fontSize: '13px', fontWeight: 600 }}>
        ✓
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="ema-dn" title="10-EMA ≤ 20-EMA" style={{ color: colors.text3, fontSize: '12px', opacity: 0.5 }}>
        ✗
      </span>
    );
  }
  return <span style={{ color: colors.text3, fontSize: '11px' }}>—</span>;
}

function HoldingsButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`expand-btn${expanded ? ' open' : ''}`}
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: 'none',
        border: 'none',
        color: colors.text3,
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: '10px',
        cursor: 'pointer',
        padding: 0,
        letterSpacing: '0.5px',
      }}
    >
      <span
        style={{
          transition: 'transform .2s',
          display: 'inline-block',
          transform: expanded ? 'rotate(90deg)' : undefined,
        }}
      >
        ▸
      </span>{' '}
      TOP 10
    </button>
  );
}

function HoldingsPanel({
  sym,
  displayName,
  holdings,
}: {
  sym: string;
  displayName: string;
  holdings: Holding[];
}) {
  return (
    <div className="holdings-inner" style={{ padding: '8px 11px 10px 28px', background: colors.bg4 }}>
      <div
        className="h-title"
        style={{
          fontSize: '10px',
          color: colors.text3,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          marginBottom: '6px',
        }}
      >
        TOP 10 HOLDINGS BY WEIGHT — {displayName}
      </div>
      <div className="h-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {holdings.map((h) => (
          <div
            key={h.s}
            className="h-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: colors.bg3,
              border: `1px solid ${colors.border}`,
              borderRadius: '2px',
              padding: '3px 7px',
              fontSize: '11px',
            }}
          >
            <span className="h-w" style={{ color: colors.accent, fontSize: '10px', minWidth: '30px', textAlign: 'right' }}>
              {h.w.toFixed(1)}%
            </span>
            <span className="h-sym" style={{ color: colors.text, fontWeight: 500 }}>
              {h.s}
            </span>
            <span className="h-nm" style={{ color: colors.text3, fontSize: '10px' }}>
              {h.n}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const MarketTable: React.FC<MarketTableProps> = ({
  data,
  holdings = {},
  rank = false,
  hasPrice = true,
  isYield = false,
  showSpark = true,
  showTrend = false,
  showHoldings = false,
  benchmarkSym,
  sortBy = 'w1',
  sortOrder = 'desc',
  nameLabel = 'Name',
  priceLabel = 'Price',
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<{ key: SortKey; order: SortOrder }>({
    key: (sortBy as SortKey) || 'w1',
    order: sortOrder,
  });

  const handleSort = (key: SortKey) => {
    setSort((prev) => ({
      key,
      order: prev.key === key && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  };

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => compareRows(a, b, sort.key, sort.order));
  }, [data, sort]);

  const colCount =
    (rank ? 1 : 0) +
    1 +
    (hasPrice ? 1 : 0) +
    4 +
    (showSpark ? 1 : 0) +
    (showTrend ? 1 : 0) +
    (showHoldings ? 1 : 0);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'IBM Plex Mono, monospace' }}>
      <thead>
        <tr>
          {rank && <th style={{ ...thStyle, textAlign: 'left' }}>#</th>}
          <SortableHeader
            label={nameLabel}
            sortKey="name"
            activeKey={sort.key}
            order={sort.order}
            align="left"
            onSort={handleSort}
          />
          {hasPrice && (
            <SortableHeader
              label={isYield ? 'Yield%' : priceLabel}
              sortKey="price"
              activeKey={sort.key}
              order={sort.order}
              onSort={handleSort}
            />
          )}
          <SortableHeader
            label={isYield ? '1D (bps)' : '1D%'}
            sortKey="d1"
            activeKey={sort.key}
            order={sort.order}
            onSort={handleSort}
          />
          <SortableHeader
            label="1W%"
            sortKey="w1"
            activeKey={sort.key}
            order={sort.order}
            onSort={handleSort}
          />
          <SortableHeader
            label="52W Hi%"
            sortKey="hi52"
            activeKey={sort.key}
            order={sort.order}
            onSort={handleSort}
          />
          <SortableHeader
            label="YTD%"
            sortKey="ytd"
            activeKey={sort.key}
            order={sort.order}
            onSort={handleSort}
          />
          {showSpark && <th style={{ ...thStyle, textAlign: 'center' }}>5D</th>}
          {showTrend && (
            <SortableHeader
              label="Trend"
              sortKey="ema_uptrend"
              activeKey={sort.key}
              order={sort.order}
              align="center"
              onSort={handleSort}
            />
          )}
          {showHoldings && <th style={{ ...thStyle, textAlign: 'left' }}>Holdings</th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map((item, idx) => {
          const meta = getSymbolMeta(item.sym);
          const displayName = resolveDisplayName(item);
          const flag = item.flag || meta.flag;
          const isBenchmark = benchmarkSym && item.sym === benchmarkSym;
          const symHoldings = holdings[item.sym];
          const isExpanded = expanded[item.sym] ?? false;

          return (
            <React.Fragment key={item.sym}>
              <tr
                className={isBenchmark ? 'bench-row' : undefined}
                style={{
                  borderBottom: `1px solid rgba(31,90,255,.1)`,
                  background: isBenchmark ? 'rgba(31,90,255,.04)' : undefined,
                }}
              >
                {rank && (
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    <RankBadge rank={idx + 1} />
                  </td>
                )}
                <td style={{ ...tdStyle, textAlign: 'left' }}>
                  <SymbolLink sym={item.sym} name={displayName} flag={flag} />
                  <span style={{ color: colors.text3, fontSize: '10px', display: 'block', letterSpacing: '0.5px' }}>
                    {meta.sym || item.sym}
                  </span>
                </td>
                {hasPrice && item.price !== undefined && (
                  <td style={{ ...tdStyle, textAlign: 'right', color: colors.text }}>
                    {formatPrice(item.price)}
                  </td>
                )}
                {hasPrice && item.price === undefined && (
                  <td style={{ ...tdStyle, textAlign: 'right', color: colors.text3 }}>—</td>
                )}
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {isYield ? <BpsCell value={item.d1} /> : <PctCell value={item.d1} />}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <PctCell value={item.w1} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <PctCell value={item.hi52} maxPct={30} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <PctCell value={item.ytd} maxPct={20} />
                </td>
                {showSpark && (
                  <td style={{ ...tdStyle, textAlign: 'center', padding: '4px 8px' }}>
                    <Sparkline data={item.spark ?? []} />
                  </td>
                )}
                {showTrend && (
                  <td style={{ ...tdStyle, textAlign: 'center', padding: '3px 8px' }}>
                    <TrendCell value={item.ema_uptrend} />
                  </td>
                )}
                {showHoldings && (
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    {symHoldings?.length ? (
                      <HoldingsButton
                        expanded={isExpanded}
                        onToggle={() =>
                          setExpanded((prev) => ({ ...prev, [item.sym]: !prev[item.sym] }))
                        }
                      />
                    ) : (
                      <span style={{ color: colors.text3, fontSize: '9px' }}>—</span>
                    )}
                  </td>
                )}
              </tr>
              {showHoldings && isExpanded && symHoldings?.length ? (
                <tr className="holdings-row show">
                  <td colSpan={colCount} style={{ padding: 0 }}>
                    <HoldingsPanel sym={item.sym} displayName={displayName} holdings={symHoldings} />
                  </td>
                </tr>
              ) : null}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
};
