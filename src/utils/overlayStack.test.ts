// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initBackNavigation, pushOverlayDismiss } from './overlayStack';

describe('overlay back navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('arms history from user input and closes nested overlays one at a time with Back', () => {
    const pushState = vi.spyOn(history, 'pushState');
    initBackNavigation();

    // Safari skips entries pushed during startup without user activation.
    expect(pushState).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pointerdown'));
    expect(pushState).toHaveBeenCalledOnce();

    let unregisterFirst: () => void = () => undefined;
    const dismissFirst = vi.fn(() => unregisterFirst());
    unregisterFirst = pushOverlayDismiss(dismissFirst);

    let unregisterSecond: () => void = () => undefined;
    const dismissSecond = vi.fn(() => unregisterSecond());
    unregisterSecond = pushOverlayDismiss(dismissSecond);

    expect(pushState).toHaveBeenCalledTimes(2);
    const rootGuardState = pushState.mock.calls[0][0];

    window.dispatchEvent(
      new PopStateEvent('popstate', { state: rootGuardState }),
    );
    expect(dismissSecond).toHaveBeenCalledOnce();
    expect(dismissFirst).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(dismissFirst).toHaveBeenCalledOnce();
  });
});
