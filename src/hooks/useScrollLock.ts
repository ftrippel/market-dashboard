import { useEffect } from 'react';

const SCROLLABLE_SELECTOR =
  '[data-scroll-lock-scrollable], .table-flyover-body, .table-scroll';

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
let savedStyles: {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPaddingRight: string;
} | null = null;

function isInsideScrollable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SCROLLABLE_SELECTOR) !== null;
}

function hasOpenOverlay(): boolean {
  return document.querySelector('.tv-modal.open, .table-flyover.open') !== null;
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

function lockBodyScroll(): void {
  if (lockCount === 0) {
    const html = document.documentElement;
    const { body } = document;

    savedStyles = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    };

    const scrollbarWidth = window.innerWidth - html.clientWidth;

    html.classList.add('scroll-locked');
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    attachListeners();
  }
  lockCount += 1;
}

function unlockBodyScroll(): void {
  if (lockCount <= 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  const html = document.documentElement;
  const { body } = document;

  if (savedStyles) {
    html.style.overflow = savedStyles.htmlOverflow;
    body.style.overflow = savedStyles.bodyOverflow;
    body.style.paddingRight = savedStyles.bodyPaddingRight;
    savedStyles = null;
  }

  html.classList.remove('scroll-locked');
  detachListeners();
}

/** Lock page scroll while overlays/modals are open (ref-counted for nested overlays). */
export function useScrollLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [enabled]);
}
