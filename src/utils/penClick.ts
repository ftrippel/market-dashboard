import { useCallback, useRef, type MouseEvent, type PointerEvent, type SyntheticEvent } from 'react';
import { isPenPrimaryTap } from './device';

export function usePenPointerUp<E extends HTMLElement = HTMLElement>(
  handler: (event: PointerEvent<E>) => void,
) {
  return useCallback(
    (event: PointerEvent<E>) => {
      if (!isPenPrimaryTap(event)) return;
      handler(event);
    },
    [handler],
  );
}

/** iOS Safari often skips `click` for Apple Pencil; `pointerup` with `pointerType === 'pen'` still fires. */
export function usePenCompatibleClick<E extends HTMLElement = HTMLElement>(
  handler: (event: SyntheticEvent<E>) => void,
) {
  const penHandledRef = useRef(false);

  const onClick = useCallback(
    (event: MouseEvent<E>) => {
      if (penHandledRef.current) {
        penHandledRef.current = false;
        return;
      }
      handler(event);
    },
    [handler],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<E>) => {
      if (!isPenPrimaryTap(event)) return;
      penHandledRef.current = true;
      handler(event);
    },
    [handler],
  );

  return { onClick, onPointerUp };
}

/** Dismiss an overlay when the backdrop itself is tapped (Apple Pencil skips `click`). */
export function usePenBackdropDismiss(onDismiss: () => void) {
  return usePenCompatibleClick((event) => {
    if (event.target === event.currentTarget) onDismiss();
  });
}

/** Toggle a checkbox when Apple Pencil taps it (native `change` is often skipped). */
export function usePenCheckboxToggle(setValue: (value: boolean) => void) {
  return usePenPointerUp((event: PointerEvent<HTMLInputElement>) => {
    setValue(!event.currentTarget.checked);
  });
}

/** Focus and open a native `<select>` on Apple Pencil tap. */
export function usePenSelectActivate<E extends HTMLSelectElement>() {
  return usePenPointerUp((event: PointerEvent<E>) => {
    const select = event.currentTarget;
    select.focus();
    if (typeof select.showPicker === 'function') {
      try {
        select.showPicker();
        return;
      } catch {
        // showPicker can throw if not triggered by a user gesture
      }
    }
    select.click();
  });
}
