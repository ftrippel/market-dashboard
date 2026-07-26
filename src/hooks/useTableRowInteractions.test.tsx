// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTableRowInteractions } from './useTableRowInteractions';

function TestTables({
  highlightRowOnHover = true,
  highlightSelectedRow = true,
}: {
  highlightRowOnHover?: boolean;
  highlightSelectedRow?: boolean;
}) {
  useTableRowInteractions({ highlightRowOnHover, highlightSelectedRow });

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
  type: 'pointerdown' | 'pointerover' | 'pointerout' | 'pointerup',
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
  afterEach(cleanup);

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

    secondRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(secondRow.hasAttribute('data-row-selected')).toBe(false);
  });

  it('deduplicates delayed Apple Pencil clicks and keeps later finger taps working', async () => {
    const { getByTestId } = render(<TestTables />);
    const row = getByTestId('first-row');

    act(() => {
      dispatchPointer(row, 'pointerdown', 'pen');
      dispatchPointer(row, 'pointerup', 'pen');
    });

    expect(row.getAttribute('data-row-selected')).toBe('true');

    // iPadOS can dispatch the synthetic click in a later task.
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 10)));
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(row.getAttribute('data-row-selected')).toBe('true');

    act(() => {
      dispatchPointer(row, 'pointerdown', 'pen');
      dispatchPointer(row, 'pointerup', 'pen');
    });

    expect(row.hasAttribute('data-row-selected')).toBe(false);

    // If Safari omits the pen click entirely, a subsequent finger tap must not
    // be mistaken for that missing synthetic click.
    act(() => {
      dispatchPointer(row, 'pointerdown', 'pen');
      dispatchPointer(row, 'pointerup', 'pen');
      dispatchPointer(row, 'pointerdown', 'touch');
    });
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(row.hasAttribute('data-row-selected')).toBe(false);
  });

  it('does not highlight or select rows when both display options are disabled', () => {
    const { getByTestId } = render(
      <TestTables highlightRowOnHover={false} highlightSelectedRow={false} />,
    );
    const row = getByTestId('first-row');

    dispatchPointer(row, 'pointerover', 'pen');
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

    expect(row.hasAttribute('data-row-hovered')).toBe(false);
    expect(row.hasAttribute('data-row-selected')).toBe(false);
  });
});
