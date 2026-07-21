export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmHandler = (options: ConfirmOptions) => Promise<boolean>;

let confirmHandler: ConfirmHandler | null = null;

/** Register the React confirm handler (called by ConfirmDialogProvider on mount). */
export function setConfirmHandler(handler: ConfirmHandler | null): void {
  confirmHandler = handler;
}

/** Show a confirmation dialog. Falls back to `window.confirm` if no handler is registered. */
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  if (confirmHandler) return confirmHandler(options);
  return Promise.resolve(window.confirm(options.message));
}
