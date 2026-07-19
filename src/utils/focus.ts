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
