// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScrollLock } from './useScrollLock';

describe('useScrollLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.documentElement.classList.remove('scroll-locked');
  });

  it('allows trackpad wheel scrolling inside the expanded watchlist comment', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);

    const textarea = document.createElement('textarea');
    textarea.className = 'watchlist-comment-dialog-textarea';
    document.body.append(textarea);

    renderHook(() => useScrollLock(true));

    const textareaWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    textarea.dispatchEvent(textareaWheel);

    expect(textareaWheel.defaultPrevented).toBe(false);

    const pageWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    root.dispatchEvent(pageWheel);

    expect(pageWheel.defaultPrevented).toBe(true);
  });
});
