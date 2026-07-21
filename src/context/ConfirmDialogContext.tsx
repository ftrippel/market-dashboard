import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { setConfirmHandler, type ConfirmOptions } from '../utils/confirmDialog';

interface QueuedConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

interface ConfirmDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const queueRef = useRef<QueuedConfirm[]>([]);
  const [active, setActive] = useState<QueuedConfirm | null>(null);

  const pump = useCallback(() => {
    setActive((current) => {
      if (current) return current;
      return queueRef.current.shift() ?? null;
    });
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        queueRef.current.push({ options, resolve });
        pump();
      }),
    [pump],
  );

  useEffect(() => {
    setConfirmHandler(confirm);
    return () => setConfirmHandler(null);
  }, [confirm]);

  const finish = useCallback(
    (confirmed: boolean) => {
      setActive((current) => {
        current?.resolve(confirmed);
        return queueRef.current.shift() ?? null;
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => finish(true), [finish]);
  const handleCancel = useCallback(() => finish(false), [finish]);

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        open={active !== null}
        options={active?.options ?? { message: '' }}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmDialogProvider');
  }
  return ctx.confirm;
}
