import { useEffect, useRef } from 'react';
import { showConfirm } from './confirmDialog';
import { isTypingTarget } from './focus';
import { createUuid } from './id';

type DismissHandler = () => void;

const LEAVE_CONFIRM_MESSAGE = 'Go back to the previous page?';
const ROOT_GUARD_KEY = '__rootGuard';
const ROOT_GUARD_OWNER_KEY = '__rootGuardOwner';
const rootGuardOwner = createUuid();

interface StackEntry {
  id: symbol;
  dismiss: DismissHandler;
  ignoreWhenTyping?: boolean;
}

const stack: StackEntry[] = [];
let keydownListening = false;
let ignoringPopstateCount = 0;
let backNavigationInitialized = false;
let historyGuardDepth = 0;
let trimmingHistory = false;
let leaveConfirmationOpen = false;

function getHistoryGuardDepth(state: unknown): number {
  if (!state || typeof state !== 'object' || !(ROOT_GUARD_KEY in state)) return 0;

  const guardState = state as Record<string, unknown>;
  if (guardState[ROOT_GUARD_OWNER_KEY] !== rootGuardOwner) return 0;

  const depth = guardState.depth;
  // Legacy guards and guards inherited after a page refresh belong to another
  // document. Treat them as unarmed and replace them on the next user interaction.
  return typeof depth === 'number' && depth > 0 ? depth : 0;
}

function pushHistoryGuard() {
  historyGuardDepth++;
  history.pushState(
    {
      [ROOT_GUARD_KEY]: true,
      [ROOT_GUARD_OWNER_KEY]: rootGuardOwner,
      depth: historyGuardDepth,
    },
    '',
  );
}

/**
 * Safari skips script-created history entries that were added without recent user
 * interaction. Calling this directly from pointer/keyboard input makes the root
 * guard eligible for Safari's browser Back button and swipe-back gesture.
 */
function armHistoryFromUserInteraction() {
  if (leaveConfirmationOpen) return;
  if (historyGuardDepth === 0) pushHistoryGuard();
}

function ensureHistoryForStack() {
  if (!backNavigationInitialized || leaveConfirmationOpen) return;

  const desiredDepth = Math.max(1, stack.length);
  while (historyGuardDepth < desiredDepth) {
    pushHistoryGuard();
  }
}

function trimHistoryForStack() {
  if (trimmingHistory) return;

  const desiredDepth = Math.max(1, stack.length);
  if (historyGuardDepth <= desiredDepth) return;

  trimmingHistory = true;
  ignoringPopstateCount++;
  history.go(desiredDepth - historyGuardDepth);
}

/** Install browser/system Back handling for overlays on every input type. */
export function initBackNavigation() {
  if (backNavigationInitialized) return;
  backNavigationInitialized = true;
  historyGuardDepth = getHistoryGuardDepth(history.state);

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  window.addEventListener('popstate', onPopState);
  window.addEventListener('pointerdown', armHistoryFromUserInteraction, true);
  window.addEventListener('keydown', armHistoryFromUserInteraction, true);
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

function onPopState(event: PopStateEvent) {
  const previousDepth = historyGuardDepth;
  historyGuardDepth = getHistoryGuardDepth(event.state);

  if (ignoringPopstateCount > 0) {
    ignoringPopstateCount--;
    trimmingHistory = false;
    trimHistoryForStack();
    return;
  }

  // Forward navigation does not represent a request to dismiss the current overlay.
  if (historyGuardDepth >= previousDepth) return;

  const top = stack[stack.length - 1];
  if (top) {
    top.dismiss();
    return;
  }

  // Keep the confirmation on the unguarded root entry. If confirmed, the next
  // history.back() must leave the page rather than merely close another guard.
  leaveConfirmationOpen = true;
  void showConfirm({
    title: 'Leave page',
    message: LEAVE_CONFIRM_MESSAGE,
    confirmLabel: 'Go back',
    cancelLabel: 'Stay',
  }).then((confirmed) => {
    leaveConfirmationOpen = false;

    if (confirmed) {
      ignoringPopstateCount++;
      history.back();
      return;
    }

    ensureHistoryForStack();
  });
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

  stack.splice(index, 1);
  stopKeydownListeningIfEmpty();

  // Remove history entries for overlays closed through their UI or Escape.
  // A browser Back action has already moved to the correct guard depth.
  if (historyGuardDepth > Math.max(1, stack.length)) trimHistoryForStack();
}

/** Whether any modal overlay is currently registered (excludes ephemeral UI like hover previews). */
export function hasOpenOverlays(): boolean {
  return stack.length > 0;
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

  stack.push(entry);
  ensureKeydownListening();
  ensureHistoryForStack();

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
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const ignoreWhenTyping = options?.ignoreWhenTyping;

  useEffect(() => {
    if (!active) return;
    return pushOverlayDismiss(() => dismissRef.current(), { ignoreWhenTyping });
  }, [active, ignoreWhenTyping]);
}
