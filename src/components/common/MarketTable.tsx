import React, { useMemo, useState } from 'react';
import { getDisplayName, getSymbolMeta } from '../../data/symbolMaps';
import { colors, formatPrice, formatHoverTimestamp } from '../../utils/formatting';
import type { Holding, MarketData, MarketTableOptions } from '../../types';
import { usePenCompatibleClick } from '../../utils/penClick';
import { Sparkline } from './Sparkline';
import { Sparkbar } from './Sparkbar';
import { Sparkdots } from './Sparkdots';
import { useSettings } from '../../context/SettingsContext';
import { BpsCell, PctCell } from './PctCell';
import { Icon } from './Icon';
import { SymbolLink } from './TradingViewModal';
import { HoldingsFlyover } from './HoldingsFlyover';
import { CardSearchContext } from './CardSearchContext';

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
  const sortPenClick = usePenCompatibleClick(() => onSort(sortKey));

  return (
    <th style={{ ...thStyle, textAlign: align, padding: 0 }}>
      <button
        type="button"
        className={`th-sort${active ? ' active' : ''}`}
        {...sortPenClick}
        aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
        style={{ justifyContent: justify }}
      >
        <span>{label}</span>
        <span className="th-sort-icon" aria-hidden>
          <Icon
            name={active ? (order === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
            size="xs"
          />
        </span>
      </button>
    </th>
  );
}

function TrendCell({ value }: { value?: boolean }) {
  if (value === true) {
    return (
      <span className="ema-up" title="10-EMA > 20-EMA · Short-term uptrend" style={{ color: colors.green, fontSize: '13px', fontWeight: 600 }}>
        <Icon name="check" size="sm" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="ema-dn" title="10-EMA ≤ 20-EMA" style={{ color: colors.text3, fontSize: '12px', opacity: 0.5 }}>
        <Icon name="close" size="sm" />
      </span>
    );
  }
  return <span style={{ color: colors.text3, fontSize: '11px' }}>—</span>;
}

function HoldingsButton({ onOpen }: { onOpen: () => void }) {
  const openPenClick = usePenCompatibleClick(onOpen);

  return (
    <button
      type="button"
      className="table-expand-btn"
      {...openPenClick}
      aria-label="View top 10 holdings"
      title="View top 10 holdings"
    >
      <Icon name="open_in_full" size="xs" />
      TOP 10
    </button>
  );
}

export const MarketTable: React.FC<MarketTableProps> = ({
  data,
  holdings = {},
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
  maxRows,
}) => {
  const { sparklineMode } = useSettings();
  const shouldShowSpark = showSpark && sparklineMode !== 'none';

  const [holdingsFlyout, setHoldingsFlyout] = useState<{
    sym: string;
    displayName: string;
    holdings: Holding[];
  } | null>(null);
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

  const searchCtx = React.useContext(CardSearchContext);
  const searchQuery = searchCtx?.searchQuery || '';

  const filteredData = useMemo(() => {
    if (!searchQuery) return data;
    const query = searchQuery.toLowerCase().trim();
    return data.filter((item) => {
      const symMatch = item.sym.toLowerCase().includes(query);
      const nameMatch = resolveDisplayName(item).toLowerCase().includes(query);
      return symMatch || nameMatch;
    });
  }, [data, searchQuery]);

  const sorted = useMemo(() => {
    return [...filteredData].sort((a, b) => compareRows(a, b, sort.key, sort.order));
  }, [filteredData, sort]);

  const visible = useMemo(() => {
    if (maxRows == null) return sorted;
    return sorted.slice(0, maxRows);
  }, [sorted, maxRows]);

  const siblings = useMemo(() => {
    return visible.map((x) => ({
      sym: x.sym,
      name: resolveDisplayName(x),
    }));
  }, [visible]);

  return (
    <>
    <div className="table-scroll">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'IBM Plex Mono, monospace' }}>
      <thead>
        <tr>
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
            label={isYield ? '1W (bps)' : '1W%'}
            sortKey="w1"
            activeKey={sort.key}
            order={sort.order}
            onSort={handleSort}
          />
          <SortableHeader
            label={isYield ? '52W Hi (bps)' : '52W Hi%'}
            sortKey="hi52"
            activeKey={sort.key}
            order={sort.order}
            onSort={handleSort}
          />
          <SortableHeader
            label={isYield ? 'YTD (bps)' : 'YTD%'}
            sortKey="ytd"
            activeKey={sort.key}
            order={sort.order}
            onSort={handleSort}
          />
          {shouldShowSpark && <th style={{ ...thStyle, textAlign: 'center' }}>5D</th>}
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
        {visible.map((item) => {
          const meta = getSymbolMeta(item.sym);
          const displayName = resolveDisplayName(item);
          const flag = item.flag || meta.flag;
          const isBenchmark = benchmarkSym && item.sym === benchmarkSym;
          const symHoldings = holdings[item.sym];

          return (
            <tr
              key={item.sym}
              data-symbol={item.sym}
              className={isBenchmark ? 'bench-row' : undefined}
              style={{
                borderBottom: `1px solid ${colors.rowBorder}`,
                background: isBenchmark ? colors.benchRowBg : undefined,
              }}
            >
                <td style={{ ...tdStyle, textAlign: 'left' }}>
                  <SymbolLink sym={item.sym} name={displayName} flag={flag} siblings={siblings} />
                  <span style={{ color: colors.text3, fontSize: '10px', display: 'block', letterSpacing: '0.5px' }}>
                    {meta.sym || item.sym}
                  </span>
                </td>
                {hasPrice && item.price !== undefined && (
                  <td
                    style={{ ...tdStyle, textAlign: 'right', color: colors.text }}
                    className="price-cell-tooltip-container"
                  >
                    {formatPrice(item.price)}
                    {item.updatedAt && (
                      <span className="price-cell-tooltip">
                        {formatHoverTimestamp(item.updatedAt)}
                      </span>
                    )}
                  </td>
                )}
                {hasPrice && item.price === undefined && (
                  <td style={{ ...tdStyle, textAlign: 'right', color: colors.text3 }}>—</td>
                )}
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {isYield ? <BpsCell value={item.d1} maxBps={25} /> : <PctCell value={item.d1} />}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {isYield ? <BpsCell value={item.w1} maxBps={50} /> : <PctCell value={item.w1} />}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {isYield ? <BpsCell value={item.hi52} maxBps={150} /> : <PctCell value={item.hi52} maxPct={30} />}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {isYield ? <BpsCell value={item.ytd} maxBps={100} /> : <PctCell value={item.ytd} maxPct={20} />}
                </td>
                 {shouldShowSpark && (
                  <td style={{ ...tdStyle, textAlign: 'center', padding: '4px 8px' }}>
                    {sparklineMode === 'bar' ? (
                      <Sparkbar data={item.spark ?? []} />
                    ) : sparklineMode === 'dot' ? (
                      <Sparkdots data={item.spark ?? []} />
                    ) : (
                      <Sparkline data={item.spark ?? []} />
                    )}
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
                        onOpen={() =>
                          setHoldingsFlyout({
                            sym: item.sym,
                            displayName,
                            holdings: symHoldings,
                          })
                        }
                      />
                    ) : (
                      <span style={{ color: colors.text3, fontSize: '9px' }}>—</span>
                    )}
                  </td>
                )}
              </tr>
          );
        })}
      </tbody>
    </table>
    </div>

    {holdingsFlyout && (
      <HoldingsFlyover
        etfSym={holdingsFlyout.sym}
        displayName={holdingsFlyout.displayName}
        holdings={holdingsFlyout.holdings}
        onClose={() => setHoldingsFlyout(null)}
      />
    )}
    </>
  );
};
