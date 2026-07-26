import { useEffect } from 'react';
import { isHoverPointer, isPenPrimaryTap } from '../utils/device';

const HOVERED_ATTRIBUTE = 'data-row-hovered';
const SELECTED_ATTRIBUTE = 'data-row-selected';
const HOVER_ENABLED_ATTRIBUTE = 'data-highlight-row-on-hover';
const SELECTION_ENABLED_ATTRIBUTE = 'data-highlight-selected-row';

interface TableRowInteractionOptions {
  highlightRowOnHover: boolean;
  highlightSelectedRow: boolean;
}

function findBodyRow(target: EventTarget | null): HTMLTableRowElement | null {
  return target instanceof Element
    ? target.closest<HTMLTableRowElement>('tbody > tr')
    : null;
}

function toggleRowSelection(row: HTMLTableRowElement) {
  const table = row.closest('table');
  if (!table) return;

  const wasSelected = row.getAttribute(SELECTED_ATTRIBUTE) === 'true';

  table
    .querySelectorAll<HTMLTableRowElement>(`tbody > tr[${SELECTED_ATTRIBUTE}="true"]`)
    .forEach((selectedRow) => selectedRow.removeAttribute(SELECTED_ATTRIBUTE));

  if (!wasSelected) row.setAttribute(SELECTED_ATTRIBUTE, 'true');
}

/**
 * Adds delegated hover and selection behavior to every table, including tables
 * rendered into document-level portals. Pointer hover explicitly includes a pen
 * so Apple Pencil hover works on supported iPads.
 */
export function useTableRowInteractions({
  highlightRowOnHover,
  highlightSelectedRow,
}: TableRowInteractionOptions) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(HOVER_ENABLED_ATTRIBUTE, String(highlightRowOnHover));
    root.setAttribute(SELECTION_ENABLED_ATTRIBUTE, String(highlightSelectedRow));

    if (!highlightRowOnHover) {
      document
        .querySelectorAll(`[${HOVERED_ATTRIBUTE}]`)
        .forEach((row) => row.removeAttribute(HOVERED_ATTRIBUTE));
    }
    if (!highlightSelectedRow) {
      document
        .querySelectorAll(`[${SELECTED_ATTRIBUTE}]`)
        .forEach((row) => row.removeAttribute(SELECTED_ATTRIBUTE));
    }

    let pendingPenClickRow: HTMLTableRowElement | null = null;

    const handlePointerDown = () => {
      // Start every physical pointer interaction cleanly. This prevents a pen
      // tap that did not emit `click` from suppressing a later finger/mouse tap.
      pendingPenClickRow = null;
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (!highlightRowOnHover || !isHoverPointer(event.pointerType)) return;
      findBodyRow(event.target)?.setAttribute(HOVERED_ATTRIBUTE, 'true');
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (!highlightRowOnHover || !isHoverPointer(event.pointerType)) return;

      const row = findBodyRow(event.target);
      if (!row) return;
      if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return;

      row.removeAttribute(HOVERED_ATTRIBUTE);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!highlightSelectedRow || !isPenPrimaryTap(event)) return;

      const row = findBodyRow(event.target);
      if (!row) return;

      toggleRowSelection(row);
      pendingPenClickRow = row;
    };

    const handleClick = (event: MouseEvent) => {
      if (!highlightSelectedRow || event.button !== 0) return;

      const row = findBodyRow(event.target);
      if (!row) return;

      // A pen pointerup may be followed by a synthetic click. Do not toggle or
      // repeat the selection work in that case.
      if (row === pendingPenClickRow) {
        pendingPenClickRow = null;
        return;
      }

      toggleRowSelection(row);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('pointerout', handlePointerOut);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('click', handleClick);

    return () => {
      root.removeAttribute(HOVER_ENABLED_ATTRIBUTE);
      root.removeAttribute(SELECTION_ENABLED_ATTRIBUTE);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('pointerout', handlePointerOut);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('click', handleClick);
    };
  }, [highlightRowOnHover, highlightSelectedRow]);
}
