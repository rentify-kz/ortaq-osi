import { motion, AnimatePresence } from 'motion/react'
import { Search, Bell, ChevronDown, Building2, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

export type NavItem = { icon: LucideIcon; label: string; badge?: number }

const spring = { type: 'spring', stiffness: 400, damping: 32 } as const

/** Счётчик на иконке */
export function Badge({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn(
      'nums absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white',
      className,
    )}>
      {n}
    </span>
  )
}

/**
 * Горизонтальная навигация: активный раздел — пилюля с иконкой и подписью,
 * остальные — круглые иконки, подпись всплывает при наведении.
 */
export function NavPills({
  items, active, onChange, id,
}: { items: NavItem[]; active: string; onChange: (label: string) => void; id: string }) {
  return (
    <div className="flex items-center gap-1">
      {items.map((it) => {
        const on = it.label === active
        return (
          <motion.button
            key={it.label}
            layout
            transition={spring}
            onClick={() => onChange(it.label)}
            aria-label={it.label}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'group relative flex h-11 shrink-0 items-center justify-center rounded-full',
              on ? 'px-4' : 'w-11 hover:bg-surface-2',
            )}
          >
            {on && (
              <motion.span layoutId={`pill-${id}`} transition={spring} className="absolute inset-0 rounded-full bg-brand-600" />
            )}
            <motion.span layout="position" className="relative">
              <it.icon size={19} strokeWidth={on ? 2.2 : 1.9} className={cn('transition-colors', on ? 'text-white' : 'text-ink-2 group-hover:text-ink')} />
              {it.badge && !on && <Badge n={it.badge} />}
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
                  <span className="flex items-center gap-1.5 pl-2 text-[14.5px] font-semibold text-white">
                    {it.label}
                    {it.badge && (
                      <span className="nums grid h-[18px] min-w-[18px] place-items-center rounded-full bg-white px-1 text-[10.5px] font-bold text-brand-700">
                        {it.badge}
                      </span>
                    )}
                  </span>
                </motion.span>
              )}
            </AnimatePresence>
            {!on && (
              <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold bg-ink text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                {it.label}
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

export function TopBar({
  items, active, onChange,
}: { items: NavItem[]; active: string; onChange: (label: string) => void }) {
  return (
    // Только прозрачность: сдвиг шапки сбивал замер пилюли layoutId, и она застревала на 14 px ниже
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glass sticky top-3 z-30 flex items-center justify-between gap-4 rounded-full p-1.5"
    >
      <div className="flex items-center gap-2.5 pl-1.5">
        <span className="grid size-9 place-items-center rounded-full bg-brand-600 text-white">
          <Building2 size={18} strokeWidth={2.2} />
        </span>
        <span className="font-display text-[20px] font-extrabold tracking-[-0.03em] text-ink">Ortaq</span>
      </div>

      <nav aria-label="Основные разделы" className="hidden rounded-full bg-surface p-1 md:block">
        <NavPills id="top" items={items} active={active} onChange={onChange} />
      </nav>

      <div className="flex items-center gap-1.5">
        <button aria-label="Поиск" className="grid size-11 place-items-center rounded-full bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
          <Search size={18} strokeWidth={2} />
        </button>
        <button aria-label="Уведомления, 4 новых" className="relative grid size-11 place-items-center rounded-full bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
          <Bell size={18} strokeWidth={2} />
          <Badge n={4} className="right-0 top-0" />
        </button>
        <button className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 transition-colors hover:bg-surface-2">
          <span className="grid size-9 place-items-center rounded-full bg-brand-100 font-display text-[13px] font-bold text-brand-700">БК</span>
          <span className="hidden text-left leading-tight xl:block">
            <span className="block text-[13px] font-semibold text-ink">Бауыржан Кенжебаев</span>
            <span className="block text-[11.5px] text-ink-2">председатель</span>
          </span>
          <ChevronDown size={15} className="text-ink-2" strokeWidth={2} />
        </button>
      </div>
    </motion.header>
  )
}
