import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getDisplayName, getSymbolMeta } from '../../data/symbolMaps';
import { colors, formatPrice, formatHoverTimestamp } from '../../utils/formatting';
import type { Holding, MarketData, MarketTableOptions } from '../../types';
import { usePenCompatibleClick } from '../../utils/penClick';
import { Sparkline } from './Sparkline';
import { Sparkbar } from './Sparkbar';
import { Sparkdots } from './Sparkdots';
import { useSettings } from '../../context/SettingsContext';
import { BpsCell, PctCell } from './PctCell';
import { SortableHeader, type SortOrder } from './SortableHeader';
import { Icon } from './Icon';
import { SymbolLink } from './TradingViewModal';
import { HoldingsFlyover } from './HoldingsFlyover';
import { CardSearchContext } from './CardSearchContext';
import {
  resolveDefaultSortColumn,
  resolveMarketColumns,
  type MarketColumnKey,
  type SortableMarketColumnKey,
} from '../../types/tableColumnSettings';

type SortKey = 'name' | SortableMarketColumnKey;

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
  } else if (key === 'trend') {
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

export function TrendCell({ value }: { value?: boolean }) {
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

export function HoldingsButton({ onOpen }: { onOpen: () => void }) {
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
  showHoldings = false,
  benchmarkSym,
  sortBy,
  sortOrder = 'desc',
  nameLabel = 'Name',
  priceLabel = 'Price',
  maxRows,
}) => {
  const { sparklineMode, marketColumns, defaultMarketSortColumn } = useSettings();
  const sectionColumns = useMemo<MarketColumnKey[]>(() => {
    const columns: MarketColumnKey[] = [];
    if (hasPrice) columns.push('price');
    return columns;
  }, [hasPrice]);
  const visibleColumns = useMemo(
    () =>
      resolveMarketColumns(marketColumns, sectionColumns).filter(
        (column) => column !== 'spark' || sparklineMode !== 'none',
      ),
    [marketColumns, sectionColumns, sparklineMode],
  );
  const preferredSort = (
    sortBy === 'ema_uptrend' ? 'trend' : sortBy ?? defaultMarketSortColumn
  ) as SortableMarketColumnKey;
  const initialSortKey = resolveDefaultSortColumn(preferredSort, visibleColumns);

  const [holdingsFlyout, setHoldingsFlyout] = useState<{
    sym: string;
    displayName: string;
    holdings: Holding[];
  } | null>(null);
  const closeHoldingsFlyout = useCallback(() => setHoldingsFlyout(null), []);
  const [sort, setSort] = useState<{ key: SortKey; order: SortOrder }>({
    key: initialSortKey,
    order: sortOrder,
  });

  useEffect(() => {
    setSort({ key: resolveDefaultSortColumn(preferredSort, visibleColumns), order: sortOrder });
  }, [preferredSort, sortOrder, visibleColumns]);

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
            thStyle={thStyle}
          />
          {visibleColumns.map((column) => {
            if (column === 'spark') {
              return (
                <th key={column} style={{ ...thStyle, textAlign: 'center' }}>
                  5D
                </th>
              );
            }

            const labels: Record<SortableMarketColumnKey, string> = {
              price: isYield ? 'Yield%' : priceLabel,
              d1: isYield ? '1D (bps)' : '1D%',
              w1: isYield ? '1W (bps)' : '1W%',
              m1: isYield ? '1M (bps)' : '1M%',
              m3: isYield ? '3M (bps)' : '3M%',
              m6: isYield ? '6M (bps)' : '6M%',
              ytd: isYield ? 'YTD (bps)' : 'YTD%',
              hi52: isYield ? '52W Hi (bps)' : '52W Hi%',
              trend: 'Trend',
            };
            return (
              <SortableHeader
                key={column}
                label={labels[column]}
                sortKey={column}
                activeKey={sort.key}
                order={sort.order}
                align={column === 'trend' ? 'center' : undefined}
                onSort={handleSort}
                thStyle={thStyle}
              />
            );
          })}
          {showHoldings && <th style={{ ...thStyle, textAlign: 'left' }}>Holdings</th>}
        </tr>
      </thead>
      <tbody>
        {visible.map((item) => {
          const meta = getSymbolMeta(item.sym);
          const displayName = resolveDisplayName(item);
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
                  <SymbolLink sym={item.sym} name={displayName} siblings={siblings} />
                  <span style={{ color: colors.text3, fontSize: '10px', display: 'block', letterSpacing: '0.5px' }}>
                    {meta.sym || item.sym}
                  </span>
                </td>
                {visibleColumns.map((column) => {
                  if (column === 'price') {
                    return item.price !== undefined ? (
                      <td
                        key={column}
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
                    ) : (
                      <td
                        key={column}
                        style={{ ...tdStyle, textAlign: 'right', color: colors.text3 }}
                      >
                        —
                      </td>
                    );
                  }
                  if (column === 'spark') {
                    return (
                      <td
                        key={column}
                        style={{ ...tdStyle, textAlign: 'center', padding: '4px 8px' }}
                      >
                        {sparklineMode === 'bar' ? (
                          <Sparkbar data={item.spark ?? []} />
                        ) : sparklineMode === 'dot' ? (
                          <Sparkdots data={item.spark ?? []} />
                        ) : (
                          <Sparkline data={item.spark ?? []} />
                        )}
                      </td>
                    );
                  }
                  if (column === 'trend') {
                    return (
                      <td
                        key={column}
                        style={{ ...tdStyle, textAlign: 'center', padding: '3px 8px' }}
                      >
                        <TrendCell value={item.ema_uptrend} />
                      </td>
                    );
                  }

                  const value = item[column];
                  const maxPct =
                    column === 'hi52' ? 30 : column === 'ytd' ? 20 : undefined;
                  const maxBps =
                    column === 'd1'
                      ? 25
                      : column === 'w1'
                        ? 50
                        : column === 'hi52'
                          ? 150
                          : column === 'ytd'
                            ? 100
                            : undefined;
                  return (
                    <td key={column} style={{ ...tdStyle, textAlign: 'right' }}>
                      {isYield ? (
                        <BpsCell value={value} maxBps={maxBps} />
                      ) : (
                        <PctCell value={value} maxPct={maxPct} />
                      )}
                    </td>
                  );
                })}
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
        onClose={closeHoldingsFlyout}
      />
    )}
    </>
  );
};
