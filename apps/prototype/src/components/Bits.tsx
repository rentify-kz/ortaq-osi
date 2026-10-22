import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '../lib/cn'

/** Шапка экрана — стеклянная, залипающая */
export function AppBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-1">
      {left}
      {right}
    </div>
  )
}

export function Scroll({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
      <motion.div
        initial="hide"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}
        className="flex flex-col gap-3"
      >
        {children}
      </motion.div>
    </div>
  )
}

const rise = {
  hide: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
}

export function Block({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={rise} className={cn('rounded-[22px] bg-surface p-4', className)}>
      {children}
    </motion.div>
  )
}

export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div variants={rise} className={cn('flex flex-col gap-2.5', className)}>{children}</motion.div>
}

export function Label({ children, tone = 'mute' }: { children: ReactNode; tone?: 'mute' | 'warn' | 'crit' }) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-1 text-[13px] font-semibold',
      tone === 'mute' && 'text-ink-3',
      tone === 'warn' && 'text-warning',
      tone === 'crit' && 'text-danger',
    )}>
      {children}
    </div>
  )
}

export function Pill({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'warn' | 'crit' }) {
  return (
    <span className={cn(
      'nums inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold',
      tone === 'brand' && 'bg-brand-100 text-brand-700',
      tone === 'warn' && 'bg-warning-soft text-warning',
      tone === 'crit' && 'bg-danger-soft text-danger',
    )}>
      {children}
    </span>
  )
}

export function Btn({
  children, variant = 'solid', full, className, onClick, disabled, type = 'button',
}: {
  children: ReactNode; variant?: 'solid' | 'soft' | 'ghost'; full?: boolean; className?: string
  onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'
}) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.975 }}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-[15px] px-4 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-2',
        variant === 'solid' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'soft' && 'bg-surface-2 text-ink hover:bg-surface-3',
        variant === 'ghost' && 'bg-white/70 text-ink hover:bg-white',
        full && 'w-full',
        className,
      )}
    >
      {children}
    </motion.button>
  )
}

/** Крупная сумма: дробная часть и валюта светлее — приём из референса */
export function Amount({ value, unit = '₸', size = 30 }: { value: string; unit?: string; size?: number }) {
  const [int, frac] = value.split(',')
  return (
    <span className="nums font-display font-extrabold tracking-[-0.03em] text-ink" style={{ fontSize: size, lineHeight: 1.05 }}>
      {int}
      {frac && <span className="text-ink-3">,{frac}</span>}
      <span className="ml-1 font-bold text-ink-3" style={{ fontSize: size * 0.62 }}>{unit}</span>
    </span>
  )
}

/** Шаги выполнения заявки */
export function Stepper({ total, done }: { total: number; done: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const state = i < done ? 'done' : i === done ? 'now' : 'next'
        return (
          <motion.span
            key={i}
            initial={{ scaleX: 0.3, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.09, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'h-[5px] flex-1 origin-left rounded-full',
              state === 'done' && 'bg-brand-600',
              state === 'now' && 'bg-brand-300',
              state === 'next' && 'bg-surface-3',
            )}
          />
        )
      })}
    </div>
  )
}
