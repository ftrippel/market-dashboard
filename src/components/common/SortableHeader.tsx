import type React from 'react';
import { usePenCompatibleClick } from '../../utils/penClick';
import { Icon } from './Icon';

export type SortOrder = 'asc' | 'desc';

interface SortableHeaderProps<T extends string> {
  label: string;
  sortKey: T;
  activeKey: T;
  order: SortOrder;
  align?: 'left' | 'right' | 'center';
  onSort: (key: T) => void;
  thClassName?: string;
  thStyle?: React.CSSProperties;
}

export function SortableHeader<T extends string>({
  label,
  sortKey,
  activeKey,
  order,
  align = 'right',
  onSort,
  thClassName,
  thStyle,
}: SortableHeaderProps<T>) {
  const active = sortKey === activeKey;
  const justify =
    align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end';
  const sortPenClick = usePenCompatibleClick(() => onSort(sortKey));

  return (
    <th className={thClassName} style={{ ...thStyle, textAlign: align, padding: 0 }}>
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
