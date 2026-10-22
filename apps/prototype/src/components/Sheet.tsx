import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'

/**
 * Нижний лист мобильного приложения. Рендерится порталом в экран телефона
 * ([data-sheet-root]), чтобы анимированные предки с transform не обрезали его.
 */
export function Sheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const anchor = <span hidden ref={(el) => { if (el && !root) setRoot(el.closest<HTMLElement>('[data-sheet-root]')) }} />
  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-ink/35"
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="no-scrollbar absolute inset-x-0 bottom-0 z-50 flex max-h-[88%] flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-surface px-4 pb-6 pt-2.5"
          >
            <span aria-hidden className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-surface-3" />
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[19px] font-extrabold tracking-[-0.02em] text-ink">{title}</h2>
              <button onClick={onClose} aria-label="Закрыть" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3">
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
  return <>{anchor}{root ? createPortal(sheet, root) : sheet}</>
}
