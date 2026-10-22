import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { Badge } from './TopBar'

export type RailItem = { icon: LucideIcon; label: string; badge?: number }

const spring = { type: 'spring', stiffness: 400, damping: 32 } as const

/** Подпись справа от рейки — тёмная для читаемости поверх карточек, всплывает при наведении и фокусе */
function Tip({ children }: { children: string }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 z-20 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-full px-3.5 py-2 text-[14px] font-semibold bg-ink text-white opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
      {children}
    </span>
  )
}

/**
 * Вертикальная навигация: одна пилюля-рейка, круглые иконки,
 * активная залита брендом, сверху — знак дома.
 */
export function Rail({
  top, items, bottom, active, onChange,
}: {
  top: { initials: string; label: string }
  items: RailItem[]
  bottom: RailItem[]
  active: string
  onChange: (label: string) => void
}) {
  const btn = (it: RailItem) => {
    const on = it.label === active
    return (
      <button
        key={it.label}
        onClick={() => onChange(it.label)}
        aria-label={it.label}
        aria-current={on ? 'page' : undefined}
        className={cn(
          'group relative grid size-12 place-items-center rounded-full transition-colors',
          !on && 'hover:bg-surface-2',
        )}
      >
        {on && (
          <motion.span layoutId="rail-pill" transition={spring} className="absolute inset-0 rounded-full bg-brand-600" />
        )}
        <it.icon
          size={20}
          strokeWidth={on ? 2.2 : 1.9}
          className={cn('relative transition-colors duration-200', on ? 'text-white' : 'text-ink-2 group-hover:text-ink')}
        />
        {it.badge && <Badge n={it.badge} className="right-0 top-0" />}
        <Tip>{it.label}</Tip>
      </button>
    )
  }

  return (
    <motion.nav
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Разделы"
      className="sticky top-[92px] z-20 hidden h-fit shrink-0 flex-col items-center gap-1.5 rounded-full bg-surface p-1.5 lg:flex"
    >
      <button aria-label={top.label} className="group relative mb-2 grid size-12 place-items-center rounded-full bg-brand-100 font-display text-[14px] font-extrabold text-brand-700 transition-colors hover:bg-brand-200">
        {top.initials}
        <Tip>{top.label}</Tip>
      </button>
      {items.map(btn)}
      <span className="h-6" aria-hidden />
      {bottom.map(btn)}
    </motion.nav>
  )
}
