import { useEffect } from 'react';
import { isTypingTarget } from './focus';

type DismissHandler = () => void;

const OVERLAY_HISTORY_STATE = { __overlay: true } as const;
const ROOT_GUARD_STATE = { __rootGuard: true } as const;
const LEAVE_CONFIRM_MESSAGE = 'Go back to the previous page?';

interface StackEntry {
  id: symbol;
  dismiss: DismissHandler;
  ignoreWhenTyping?: boolean;
  historyPushed?: boolean;
  closedByBack?: boolean;
}

const stack: StackEntry[] = [];
let keydownListening = false;
let ignoringPopstate = false;
let mobileBackInitialized = false;

function isMobileBackNavigation(): boolean {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/** Install the root history guard so the first back press can be intercepted on mobile. */
export function initMobileBackNavigation() {
  if (!isMobileBackNavigation() || mobileBackInitialized) return;
  mobileBackInitialized = true;

  history.pushState(ROOT_GUARD_STATE, '');
  window.addEventListener('popstate', onPopState);
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (event.defaultPrevented) return;

  const top = stack[stack.length - 1];
  if (!top) return;
  if (top.ignoreWhenTyping && isTypingTarget()) return;

  event.preventDefault();
  top.dismiss();
}

function onPopState() {
  if (ignoringPopstate) {
    ignoringPopstate = false;
    return;
  }

  const top = stack[stack.length - 1];
  if (top) {
    top.closedByBack = true;
    top.dismiss();
    return;
  }

  if (window.confirm(LEAVE_CONFIRM_MESSAGE)) {
    ignoringPopstate = true;
    history.back();
    return;
  }

  history.pushState(ROOT_GUARD_STATE, '');
}

function ensureKeydownListening() {
  if (keydownListening) return;
  window.addEventListener('keydown', onKeyDown);
  keydownListening = true;
}

function stopKeydownListeningIfEmpty() {
  if (stack.length === 0 && keydownListening) {
    window.removeEventListener('keydown', onKeyDown);
    keydownListening = false;
  }
}

function unregisterEntry(id: symbol) {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index === -1) return;

  const removed = stack[index];
  stack.splice(index, 1);
  stopKeydownListeningIfEmpty();

  if (removed.historyPushed && !removed.closedByBack) {
    ignoringPopstate = true;
    history.back();
  }
}

/** Push a dismiss handler onto the overlay stack. Returns an unregister function. */
export function pushOverlayDismiss(
  dismiss: DismissHandler,
  options?: { ignoreWhenTyping?: boolean },
): () => void {
  const id = Symbol();
  const entry: StackEntry = {
    id,
    dismiss,
    ignoreWhenTyping: options?.ignoreWhenTyping,
  };

  if (isMobileBackNavigation()) {
    history.pushState(OVERLAY_HISTORY_STATE, '');
    entry.historyPushed = true;
  }

  stack.push(entry);
  ensureKeydownListening();

  return () => {
    unregisterEntry(id);
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
