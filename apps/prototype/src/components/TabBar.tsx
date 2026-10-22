import { motion, AnimatePresence } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

export type Tab = { icon: LucideIcon; label: string; badge?: number }

const spring = { type: 'spring', stiffness: 400, damping: 32 } as const

/** Стеклянный таб-бар: активная вкладка — пилюля с иконкой и подписью, остальные — иконки */
export function TabBar({ tabs, active, id, onChange }: { tabs: Tab[]; active: number; id: string; onChange?: (i: number) => void }) {
  return (
    <nav className="glass relative z-20 mx-3 mb-3 flex shrink-0 items-center justify-between gap-1 rounded-full p-1.5">
      {tabs.map((t, i) => {
        const on = i === active
        return (
          <motion.button
            key={t.label}
            layout
            transition={spring}
            onClick={() => onChange?.(i)}
            tabIndex={onChange ? 0 : -1}
            aria-label={t.label}
            aria-current={on ? 'page' : undefined}
            className={cn('relative flex h-12 items-center justify-center rounded-full', on ? 'px-4' : 'flex-1', !onChange && 'pointer-events-none')}
          >
            {on && (
              <motion.span layoutId={`tab-${id}`} transition={spring} className="absolute inset-0 rounded-full bg-brand-600" />
            )}
            <motion.span layout="position" className="relative">
              <t.icon size={20} strokeWidth={on ? 2.2 : 1.9} className={on ? 'text-white' : 'text-ink-2'} />
              {t.badge && (
                <span className="nums absolute -right-2 -top-1.5 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {t.badge}
                </span>
              )}
            </motion.span>
            <AnimatePresence initial={false}>
              {on && (
                <motion.span
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={spring}
                  className="relative overflow-hidden whitespace-nowrap"
                >
                  <span className="block pl-2 text-[14px] font-semibold text-white">{t.label}</span>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )
      })}
    </nav>
  )
}
