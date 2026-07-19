const TYPING_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

/** True when focus is in a field where the user is typing text. */
export function isTypingTarget(element: Element | null = document.activeElement): boolean {
  return element instanceof Element && element.closest(TYPING_TARGET_SELECTOR) !== null;
}

export function blurActiveElement(): void {
  const { activeElement } = document;
  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
}

/** Blur the focused trigger/control before closing an overlay. */
export function dismissOverlay(onClose: () => void): void {
  blurActiveElement();
  onClose();
}
