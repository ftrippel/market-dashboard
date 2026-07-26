// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTableRowInteractions } from './useTableRowInteractions';

function TestTables() {
  useTableRowInteractions();

  return (
    <>
      <table data-testid="first-table">
        <tbody>
          <tr data-testid="first-row"><td>One</td></tr>
          <tr data-testid="second-row"><td>Two</td></tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr data-testid="other-table-row"><td>Other</td></tr>
        </tbody>
      </table>
    </>
  );
}

function dispatchPointer(
  target: Element,
  type: 'pointerover' | 'pointerout' | 'pointerup',
  pointerType: 'mouse' | 'pen' | 'touch',
  relatedTarget: EventTarget | null = null,
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    button: { value: 0 },
    relatedTarget: { value: relatedTarget },
  });
  target.dispatchEvent(event);
}

describe('table row interactions', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('highlights mouse and pen proximity, but not touch movement', () => {
    const { getByTestId } = render(<TestTables />);
    const row = getByTestId('first-row');
    const cell = row.firstElementChild!;

    dispatchPointer(cell, 'pointerover', 'pen');
    expect(row.getAttribute('data-row-hovered')).toBe('true');

    dispatchPointer(cell, 'pointerout', 'pen');
    expect(row.hasAttribute('data-row-hovered')).toBe(false);

    dispatchPointer(cell, 'pointerover', 'touch');
    expect(row.hasAttribute('data-row-hovered')).toBe(false);
  });

  it('selects clicked rows and keeps selection scoped to each table', () => {
    const { getByTestId } = render(<TestTables />);
    const firstRow = getByTestId('first-row');
    const secondRow = getByTestId('second-row');
    const otherTableRow = getByTestId('other-table-row');

    firstRow.firstElementChild!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, button: 0 }),
    );
    expect(firstRow.getAttribute('data-row-selected')).toBe('true');

    secondRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(firstRow.hasAttribute('data-row-selected')).toBe(false);
    expect(secondRow.getAttribute('data-row-selected')).toBe('true');

    otherTableRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(secondRow.getAttribute('data-row-selected')).toBe('true');
    expect(otherTableRow.getAttribute('data-row-selected')).toBe('true');
  });

  it('selects on Apple Pencil pointerup without requiring a click', () => {
    const { getByTestId } = render(<TestTables />);
    const row = getByTestId('first-row');

    act(() => {
      dispatchPointer(row, 'pointerup', 'pen');
    });

    expect(row.getAttribute('data-row-selected')).toBe('true');
  });
});
