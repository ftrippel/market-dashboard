import { useEffect } from 'react';
import { isTypingTarget } from './focus';

type DismissHandler = () => void;

interface StackEntry {
  id: symbol;
  dismiss: DismissHandler;
  ignoreWhenTyping?: boolean;
}

const stack: StackEntry[] = [];
let listening = false;

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (event.defaultPrevented) return;

  const top = stack[stack.length - 1];
  if (!top) return;
  if (top.ignoreWhenTyping && isTypingTarget()) return;

  event.preventDefault();
  top.dismiss();
}

function ensureListening() {
  if (listening) return;
  window.addEventListener('keydown', onKeyDown);
  listening = true;
}

function stopListeningIfEmpty() {
  if (stack.length === 0 && listening) {
    window.removeEventListener('keydown', onKeyDown);
    listening = false;
  }
}

/** Push a dismiss handler onto the overlay stack. Returns an unregister function. */
export function pushOverlayDismiss(
  dismiss: DismissHandler,
  options?: { ignoreWhenTyping?: boolean },
): () => void {
  const id = Symbol();
  stack.push({ id, dismiss, ignoreWhenTyping: options?.ignoreWhenTyping });
  ensureListening();

  return () => {
    const index = stack.findIndex((entry) => entry.id === id);
    if (index !== -1) {
      stack.splice(index, 1);
    }
    stopListeningIfEmpty();
  };
}

/** Register a dismiss handler while `active` is true (last registered = top of stack). */
export function useOverlayDismiss(
  active: boolean,
  dismiss: DismissHandler,
  options?: { ignoreWhenTyping?: boolean },
) {
  const ignoreWhenTyping = options?.ignoreWhenTyping;

  useEffect(() => {
    if (!active) return;
    return pushOverlayDismiss(dismiss, { ignoreWhenTyping });
  }, [active, dismiss, ignoreWhenTyping]);
}
