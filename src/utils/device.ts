/**
 * Device and pointer detection for touch-first Safari (especially iPad).
 *
 * Consumers:
 * - overlayStack: history guard + back-button overlay dismiss (isCoarsePointerDevice)
 * - penClick: Apple Pencil tap fallbacks when click/change is skipped (isPenPrimaryTap)
 * - chartInteractionController: crosshair vs pan by pointer type
 * - useScrollLock: scroll lock targets iOS fixed-position quirks (runs on all devices)
 */

const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';

/** Touch-first devices without hover, e.g. iPad and iPhone (not desktop Chrome). */
export function isCoarsePointerDevice(): boolean {
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

/** Primary Apple Pencil tap — iOS Safari often skips the follow-up click event. */
export function isPenPrimaryTap(event: Pick<PointerEvent, 'pointerType' | 'button'>): boolean {
  return event.pointerType === 'pen' && event.button === 0;
}

export function isPenPointer(pointerType: string): boolean {
  return pointerType === 'pen';
}

export function isTouchPointer(pointerType: string): boolean {
  return pointerType === 'touch';
}

/** Mouse or pen — supports hover-style chart crosshair. */
export function isHoverPointer(pointerType: string): boolean {
  return pointerType === 'mouse' || pointerType === 'pen';
}

/** Touch or pen — long-press / drag thresholds on charts. */
export function isTouchLikePointer(pointerType: string): boolean {
  return isTouchPointer(pointerType) || isPenPointer(pointerType);
}
