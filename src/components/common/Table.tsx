import React, { useMemo } from 'react';
import { colors } from '../../utils/formatting';
import type { TableColumn } from '../../types';

interface TableProps {
  columns: TableColumn[];
  data: any[];
  rowActions?: (row: any) => React.ReactNode;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const formatValue = (value: any, format?: string): string => {
  if (format === 'percent') {
    const num = typeof value === 'number' ? value : 0;
    return `${num.toFixed(2)}%`;
  }
  if (format === 'number') {
    const num = typeof value === 'number' ? value : 0;
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (format === 'bps') {
    const num = typeof value === 'number' ? value : 0;
    return `${(num * 100).toFixed(1)} bps`;
  }
  if (format === 'pnl') {
    const num = typeof value === 'number' ? value : 0;
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
  }
  return String(value ?? '—');
};

const getValueColor = (value: any, format?: string): string => {
  if (format === 'percent' || format === 'pnl' || format === 'bps') {
    const num = typeof value === 'number' ? value : 0;
    if (num > 0) return colors.green;
    if (num < 0) return colors.red;
  }
  return colors.text;
};

export const Table: React.FC<TableProps> = ({
  columns,
  data,
  rowActions,
  sortBy,
  sortOrder = 'desc',
}) => {
  const sorted = useMemo(() => {
    if (!sortBy) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const cmp = (aVal ?? 0) - (bVal ?? 0);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [data, sortBy, sortOrder]);

  return (
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
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                padding: '6px 10px',
                textAlign: col.align === 'left' ? 'left' : 'right',
                fontSize: '9.5px',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: colors.text3,
                background: colors.bg3,
                borderBottom: `1px solid ${colors.border}`,
                fontWeight: 500,
              }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, idx) => (
          <tr
            key={idx}
            style={{
              borderBottom: `1px solid ${colors.rowBorder}`,
            }}
          >
            {columns.map((col) => {
              const value = row[col.key];
              const formatted = col.onRender
                ? col.onRender(value, row)
                : formatValue(value, col.format);
              const color = getValueColor(value, col.format);

              return (
                <td
                  key={`${idx}-${col.key}`}
                  style={{
                    padding: '6px 10px',
                    textAlign: col.align === 'left' ? 'left' : 'right',
                    fontSize: '12px',
                    color,
                    width: col.width,
                  }}
                >
                  {formatted}
                </td>
              );
            })}
            {rowActions && <td style={{ padding: '6px 10px' }}>{rowActions(row)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
};
