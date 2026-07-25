// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initMobileBackNavigation, pushOverlayDismiss } from './overlayStack';

vi.mock('./device', () => ({
  isCoarsePointerDevice: () => true,
}));

describe('mobile overlay back navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('re-arms the history guard after repeatedly closing a lone overlay with Back', () => {
    const pushState = vi.spyOn(history, 'pushState');
    initMobileBackNavigation();

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
