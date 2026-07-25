// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initBackNavigation, pushOverlayDismiss } from './overlayStack';

describe('overlay back navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes on desktop and re-arms the history guard after repeatedly closing an overlay', () => {
    const pushState = vi.spyOn(history, 'pushState');
    initBackNavigation();

    expect(pushState).toHaveBeenCalledOnce();

    const closeWithBack = () => {
      let unregister: () => void = () => undefined;
      const dismiss = vi.fn(() => unregister());
      unregister = pushOverlayDismiss(dismiss);

      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(dismiss).toHaveBeenCalledOnce();
    };

    closeWithBack();
    expect(pushState).toHaveBeenCalledTimes(2);

    closeWithBack();
    expect(pushState).toHaveBeenCalledTimes(3);
  });
});
