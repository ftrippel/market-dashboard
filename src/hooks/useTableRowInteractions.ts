import { useEffect } from 'react';
import { isHoverPointer, isPenPrimaryTap } from '../utils/device';

const HOVERED_ATTRIBUTE = 'data-row-hovered';
const SELECTED_ATTRIBUTE = 'data-row-selected';

function findBodyRow(target: EventTarget | null): HTMLTableRowElement | null {
  return target instanceof Element
    ? target.closest<HTMLTableRowElement>('tbody > tr')
    : null;
}

function selectRow(row: HTMLTableRowElement) {
  const table = row.closest('table');
  if (!table) return;

  table
    .querySelectorAll<HTMLTableRowElement>(`tbody > tr[${SELECTED_ATTRIBUTE}="true"]`)
    .forEach((selectedRow) => {
      if (selectedRow !== row) selectedRow.removeAttribute(SELECTED_ATTRIBUTE);
    });

  row.setAttribute(SELECTED_ATTRIBUTE, 'true');
}

/**
 * Adds delegated hover and selection behavior to every table, including tables
 * rendered into document-level portals. Pointer hover explicitly includes a pen
 * so Apple Pencil hover works on supported iPads.
 */
export function useTableRowInteractions() {
  useEffect(() => {
    let pendingPenClickRow: HTMLTableRowElement | null = null;
    let penClickResetId: number | undefined;

    const handlePointerOver = (event: PointerEvent) => {
      if (!isHoverPointer(event.pointerType)) return;
      findBodyRow(event.target)?.setAttribute(HOVERED_ATTRIBUTE, 'true');
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!isHoverPointer(event.pointerType)) return;

      const row = findBodyRow(event.target);
      if (!row) return;
      if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return;

      row.removeAttribute(HOVERED_ATTRIBUTE);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!isPenPrimaryTap(event)) return;

      const row = findBodyRow(event.target);
      if (!row) return;

      selectRow(row);
      pendingPenClickRow = row;
      window.clearTimeout(penClickResetId);
      penClickResetId = window.setTimeout(() => {
        pendingPenClickRow = null;
      }, 0);
    };

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0) return;

      const row = findBodyRow(event.target);
      if (!row) return;

      // A pen pointerup may be followed by a synthetic click. Do not toggle or
      // repeat the selection work in that case.
      if (row === pendingPenClickRow) {
        pendingPenClickRow = null;
        window.clearTimeout(penClickResetId);
        return;
      }

      selectRow(row);
    };

    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('click', handleClick);

    return () => {
      window.clearTimeout(penClickResetId);
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('click', handleClick);
    };
  }, []);
}
