import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export function Card({
  children, className, delay = 0, lift = true,
}: { children: ReactNode; className?: string; delay?: number; lift?: boolean }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'rounded-card bg-surface p-5 transition-colors duration-300',
        lift && 'hover:bg-surface-2',
        className,
      )}
    >
      {children}
    </motion.section>
  )
}

export function CardHead({
  title, sub, icon, action,
}: { title: string; sub?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2">
            {icon}
          </span>
        )}
        <div>
          <h2 className="font-display text-[15px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-[12.5px] text-ink-3">{sub}</p>}
        </div>
      </div>
      {action}
    </header>
  )
}

export function Delta({ value, className }: { value: number; className?: string }) {
  const up = value >= 0
  return (
    <span
      className={cn(
        'nums inline-flex items-center rounded-full px-2 py-[3px] text-[11.5px] font-semibold',
        up ? 'bg-brand-100 text-brand-700' : 'bg-danger-soft text-danger',
        className,
      )}
    >
      {up ? '+' : '−'}{Math.abs(value).toFixed(1)}%
    </span>
  )
}

export function IconBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-brand-50 hover:text-brand-700"
    >
      {children}
    </motion.button>
  )
}
