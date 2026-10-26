import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import { Building2, LogOut, type LucideIcon } from 'lucide-react'
import { cn, initials, spring } from '../lib/cn'
import { useSignOut } from '../hooks'

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number }

/**
 * Каркас кабинета: стеклянная шапка с навигацией-пилюлями из прототипа.
 * Активный раздел — пилюля с подписью, остальные — иконки с подписью рядом на широком экране.
 */
export function Shell({ id, caption, items, user, children }: {
  id: string; caption: string; items: NavItem[]; user: { name: string; role: string }; children: ReactNode
}) {
  const signOut = useSignOut()
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[1440px] flex-col gap-6 px-4 pb-16 pt-3 md:px-6">
      <header className="glass sticky top-3 z-30 flex items-center justify-between gap-3 rounded-full p-1.5">
        <div className="flex shrink-0 items-center gap-2.5 pl-1.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><Building2 size={18} strokeWidth={2.2} /></span>
          <span className="hidden font-display text-[20px] font-extrabold tracking-[-0.03em] text-ink sm:block">Ortaq</span>
          <span className="hidden truncate text-[14px] text-ink-2 lg:block">{caption}</span>
        </div>

        {/* На телефоне подписи остаются только для читалок экрана; если пунктов больше, чем места, меню прокручивается, а не страница */}
        <nav aria-label="Разделы" className="flex min-w-0 overflow-x-auto rounded-full bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className="relative flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-2.5 sm:px-4">
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId={`nav-${id}`} transition={spring} className="absolute inset-0 rounded-full bg-brand-600" />}
                  <span className={cn('relative flex items-center gap-2 text-[14px] font-semibold transition-colors', isActive ? 'text-white' : 'text-ink-2 hover:text-ink')}>
                    <it.icon size={17} strokeWidth={2.1} />
                    <span className={cn('sr-only sm:not-sr-only', !isActive && 'sm:sr-only lg:not-sr-only')}>{it.label}</span>
                    {it.badge ? (
                      <span className={cn('nums grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold', isActive ? 'bg-white text-brand-700' : 'bg-danger text-white')}>
                        {it.badge}
                      </span>
                    ) : null}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden items-center gap-2 rounded-full bg-surface p-1 sm:flex xl:pr-3">
            <span className="grid size-9 place-items-center rounded-full bg-brand-100 font-display text-[13px] font-bold text-brand-700">{initials(user.name)}</span>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block text-[13px] font-semibold text-ink">{user.name}</span>
              <span className="block text-[11.5px] text-ink-2">{user.role}</span>
            </span>
          </span>
          <button onClick={() => void signOut()} aria-label="Выйти" className="grid size-11 place-items-center rounded-full bg-surface text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
            <LogOut size={18} strokeWidth={2} />
          </button>
        </div>
      </header>
      <main className="flex min-w-0 flex-col gap-6">{children}</main>
    </div>
  )
}
