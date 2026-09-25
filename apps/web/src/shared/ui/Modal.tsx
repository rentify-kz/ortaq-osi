import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

/** Модальное окно на нативном <dialog>: фокус-ловушка и Esc из коробки. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-xl bg-bg-surface p-0 text-text-primary shadow-md backdrop:bg-black/30"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-h2 font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-1 text-text-secondary hover:bg-bg-subtle"
              aria-label="Закрыть"
            >
              <X size={20} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
