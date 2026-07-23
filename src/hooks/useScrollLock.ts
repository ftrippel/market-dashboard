import { useEffect } from 'react';

/** Freeze #root (not body) so portaled overlays stay viewport-relative on iOS Safari — see device.ts. */
const SCROLL_LOCK_TARGET_ID = 'root';

/** Full-screen overlays portaled to `document.body` must set this attribute. */
const OVERLAY_SELECTOR = '[data-scroll-lock-overlay]';

const SCROLLABLE_SELECTOR =
  '.table-flyover-body, .table-scroll, .tv-chart-toolbar, #tv-modal-hdr, .table-flyover-hdr, .watchlist-move-dialog-list';

const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
  'Spacebar',
]);

let lockCount = 0;
let lastLockedScrollY = 0;
let savedStyles: {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPaddingRight: string;
  targetPosition: string;
  targetTop: string;
  targetLeft: string;
  targetRight: string;
  targetWidth: string;
  scrollY: number;
} | null = null;

function getScrollLockTarget(): HTMLElement {
  return document.getElementById(SCROLL_LOCK_TARGET_ID) ?? document.body;
}

function isInsideScrollable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SCROLLABLE_SELECTOR) !== null;
}

function hasOpenOverlay(): boolean {
  return document.querySelector(OVERLAY_SELECTOR) !== null;
}

function preventWheel(event: WheelEvent): void {
  if (isInsideScrollable(event.target)) return;
  event.preventDefault();
}

function preventTouchMove(event: TouchEvent): void {
  if (isInsideScrollable(event.target)) return;
  event.preventDefault();
}

function preventKeyScroll(event: KeyboardEvent): void {
  if (!SCROLL_KEYS.has(event.key)) return;

  const target = event.target;
  if (target instanceof Element) {
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (isInsideScrollable(target)) return;
  }

  if (
    (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
    hasOpenOverlay()
  ) {
    return;
  }

  event.preventDefault();
}

let listenersAttached = false;

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  document.addEventListener('wheel', preventWheel, { passive: false, capture: true });
  document.addEventListener('touchmove', preventTouchMove, { passive: false, capture: true });
  document.addEventListener('keydown', preventKeyScroll, { capture: true });
}

function detachListeners(): void {
  if (!listenersAttached) return;
  listenersAttached = false;
  document.removeEventListener('wheel', preventWheel, { capture: true });
  document.removeEventListener('touchmove', preventTouchMove, { capture: true });
  document.removeEventListener('keydown', preventKeyScroll, { capture: true });
}

function restoreScrollPosition(scrollY: number): void {
  const html = document.documentElement;
  const previousScrollBehavior = html.style.scrollBehavior;

  html.style.scrollBehavior = 'auto';
  html.scrollTop = scrollY;
  document.body.scrollTop = scrollY;
  window.scrollTo(0, scrollY);
  html.style.scrollBehavior = previousScrollBehavior;
}

/** Saved page scroll while lock is active; falls back to the last lock or current scroll position. */
export function getSavedScrollPosition(): number {
  if (savedStyles) return savedStyles.scrollY;
  return lastLockedScrollY || window.scrollY || document.documentElement.scrollTop;
}

/** Re-apply scroll after history/focus side effects (notably iOS Safari after history.back()). */
export function stabilizeScrollPosition(scrollY: number): void {
  lastLockedScrollY = scrollY;
  restoreScrollPosition(scrollY);
  requestAnimationFrame(() => {
    restoreScrollPosition(scrollY);
    requestAnimationFrame(() => restoreScrollPosition(scrollY));
  });
  window.setTimeout(() => restoreScrollPosition(scrollY), 0);
  // iOS Safari can restore history scroll position slightly after popstate.
  window.setTimeout(() => restoreScrollPosition(scrollY), 50);
}

function lockPageScroll(): void {
  if (lockCount === 0) {
    const html = document.documentElement;
    const { body } = document;
    const target = getScrollLockTarget();
    const scrollY = window.scrollY;
    lastLockedScrollY = scrollY;

    savedStyles = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      targetPosition: target.style.position,
      targetTop: target.style.top,
      targetLeft: target.style.left,
      targetRight: target.style.right,
      targetWidth: target.style.width,
      scrollY,
    };

    const scrollbarWidth = window.innerWidth - html.clientWidth;

    html.classList.add('scroll-locked');
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    target.style.position = 'fixed';
    target.style.top = `-${scrollY}px`;
    target.style.left = '0';
    target.style.right = '0';
    target.style.width = '100%';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    attachListeners();
  }
  lockCount += 1;
}

function unlockPageScroll(): void {
  if (lockCount <= 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  const html = document.documentElement;
  const { body } = document;
  const target = getScrollLockTarget();
  const scrollY = savedStyles?.scrollY ?? 0;

  if (savedStyles) {
    html.style.overflow = savedStyles.htmlOverflow;
    body.style.overflow = savedStyles.bodyOverflow;
    body.style.paddingRight = savedStyles.bodyPaddingRight;
    target.style.position = savedStyles.targetPosition;
    target.style.top = savedStyles.targetTop;
    target.style.left = savedStyles.targetLeft;
    target.style.right = savedStyles.targetRight;
    target.style.width = savedStyles.targetWidth;
    savedStyles = null;
  }

  html.classList.remove('scroll-locked');
  detachListeners();
  stabilizeScrollPosition(scrollY);
}

/**
 * Lock page scroll while overlays are open (ref-counted for nested overlays).
 * Overlays must be portaled to `document.body` and marked with `data-scroll-lock-overlay`.
 */
export function useScrollLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    lockPageScroll();
    return () => unlockPageScroll();
  }, [enabled]);
}
