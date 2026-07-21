import { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ConfirmOptions } from '../../utils/confirmDialog';
import { dismissOverlay } from '../../utils/focus';
import { useOverlayDismiss } from '../../utils/overlayStack';
import { usePenCompatibleClick } from '../../utils/penClick';

interface ConfirmDialogProps {
  open: boolean;
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, options, onConfirm, onCancel }: ConfirmDialogProps) {
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const cancel = useCallback(() => {
    dismissOverlay(() => onCancelRef.current());
  }, []);

  useOverlayDismiss(open, cancel);

  const cancelPenClick = usePenCompatibleClick(cancel);
  const confirmPenClick = usePenCompatibleClick(onConfirm);

  const {
    title = 'Confirm',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
  } = options;

  if (!open) return null;

  return createPortal(
    <div
      className="tv-modal open confirm-dialog"
      data-scroll-lock-overlay
      onClick={cancel}
    >
      <div
        id="confirm-dialog-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="confirm-dialog-hdr">
          <div id="confirm-dialog-title">{title}</div>
        </div>

        <div id="confirm-dialog-body">
          <p id="confirm-dialog-message">{message}</p>
        </div>

        <div id="confirm-dialog-actions">
          <button type="button" className="btn" {...cancelPenClick}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn"
            {...confirmPenClick}
            style={
              destructive
                ? { color: 'var(--red)', borderColor: 'var(--red)' }
                : { background: 'var(--accent)', color: '#ffffff', border: 'none' }
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
