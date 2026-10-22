import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, ChevronDown, Search as SearchIcon, type LucideIcon } from 'lucide-react'
import { useCountUp, fmt } from '../../lib/useCountUp'
import { cn, ease, spring } from '../../lib/cn'

/** Переход в раздел кабинета по его названию в навигации */
export type Go = (section: string) => void

/* ───────────── числа ───────────── */

export function Num({ to, decimals = 0, delay }: { to: number; decimals?: number; delay?: number }) {
  return <>{fmt(useCountUp(to, { delay }), decimals)}</>
}

/** Сумма: число в ink, валюта на тон светлее */
export function Tenge({ to, size = 28, light }: { to: number; size?: number; light?: boolean }) {
  return (
    <span
      className={cn('nums font-display font-extrabold tracking-[-0.03em]', light ? 'text-white' : 'text-ink')}
      style={{ fontSize: size, lineHeight: 1.05 }}
    >
      <Num to={to} />
      <span className={cn('ml-1.5 font-bold', light ? 'text-white/60' : 'text-ink-3')} style={{ fontSize: size * 0.62 }}>₸</span>
    </span>
  )
}

/** Статичная сумма в строке таблицы */
export function Money({ v, sign }: { v: number; sign?: boolean }) {
  return (
    <span className={cn('nums font-display font-bold tracking-[-0.01em]', sign && v > 0 ? 'text-brand-600' : 'text-ink')}>
      {sign ? (v > 0 ? '+' : '−') : ''}{fmt(Math.abs(v))} <span className="text-ink-3">₸</span>
    </span>
  )
}

/* ───────────── заголовок экрана ───────────── */

export function PageHead({
  title, sub, actions, back,
}: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { label: string; onClick: () => void } }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease }}
      className="flex flex-wrap items-end justify-between gap-4 px-1 pb-2"
    >
      <div>
        {back && (
          <button onClick={back.onClick} className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface pl-3 pr-4 text-[14px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
            <ArrowLeft size={16} strokeWidth={2.2} /> {back.label}
          </button>
        )}
        <h1 className="font-display text-[clamp(28px,3vw,38px)] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">{title}</h1>
        {sub && <p className="mt-2 text-[15px] text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  )
}

/** Второстепенная кнопка в шапке экрана: белая пилюля на холсте */
export function HeadBtn({ icon: Icon, children, onClick }: { icon?: LucideIcon; children: ReactNode; onClick?: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.975 }}
      onClick={onClick}
      className="flex h-11 items-center gap-2 rounded-full bg-surface px-4 text-[14px] font-medium text-ink transition-colors hover:bg-surface-2"
    >
      {Icon && <Icon size={16} strokeWidth={2} className="text-ink-2" />}
      {children}
    </motion.button>
  )
}

/* ───────────── переключатели ───────────── */

export function Segmented<T extends string>({
  options, value, onChange, id,
}: { options: { v: T; label: string; n?: number }[]; value: T; onChange: (v: T) => void; id: string }) {
  return (
    <div role="tablist" className="flex w-fit max-w-full flex-wrap rounded-full bg-surface-2 p-1">
      {options.map((o) => {
        const on = o.v === value
        return (
          <button
            key={o.v}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.v)}
            className="relative h-9 rounded-full px-4 text-[14px] font-semibold"
          >
            {on && <motion.span layoutId={`seg-${id}`} transition={spring} className="absolute inset-0 rounded-full bg-brand-600" />}
            <span className={cn('relative flex items-center gap-1.5 transition-colors', on ? 'text-white' : 'text-ink hover:text-brand-700')}>
              {o.label}
              {o.n !== undefined && <span className={cn('nums text-[12.5px]', on ? 'text-white/75' : 'text-ink-3')}>{o.n}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-11 items-center gap-3 text-left text-[14px] text-ink"
    >
      <span className={cn('flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors', on ? 'justify-end bg-brand-600' : 'justify-start bg-surface-3')}>
        <motion.span layout transition={spring} className="size-5 rounded-full bg-white" />
      </span>
      {label}
    </button>
  )
}

/* ───────────── метки ───────────── */

export type Tone = 'solid' | 'brand' | 'warn' | 'crit' | 'mute'

export function Tag({ tone = 'brand', icon: Icon, children }: { tone?: Tone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold',
      tone === 'solid' && 'bg-brand-600 text-white',
      tone === 'brand' && 'bg-brand-50 text-brand-700',
      tone === 'warn' && 'bg-warning-soft text-warning',
      tone === 'crit' && 'bg-danger-soft text-danger',
      tone === 'mute' && 'bg-surface-3 text-ink-2',
    )}>
      {Icon && <Icon size={13} strokeWidth={2.4} />}
      {children}
    </span>
  )
}

/** Точка приоритета: цвет всегда продублирован подписью рядом */
export function Dot({ tone }: { tone: 'crit' | 'warn' | 'norm' }) {
  return (
    <span className={cn(
      'size-2 shrink-0 rounded-full',
      tone === 'crit' && 'bg-danger',
      tone === 'warn' && 'bg-warning',
      tone === 'norm' && 'bg-ink-2',
    )} />
  )
}

/** Подпись группы внутри карточки: обычный регистр, без разрядки */
export function GroupLabel({ children, tone = 'mute' }: { children: ReactNode; tone?: 'mute' | 'warn' | 'crit' }) {
  return (
    <p className={cn(
      'flex items-center gap-2 text-[13px] font-semibold',
      tone === 'mute' && 'text-ink-2',
      tone === 'warn' && 'text-warning',
      tone === 'crit' && 'text-danger',
    )}>
      {children}
    </p>
  )
}

/* ───────────── таблица в стиле «строка — залитый блок» ───────────── */

export type Col = { label: string; right?: boolean }

export function Table({
  cols, minW = 680, children, empty,
}: { cols: Col[]; minW?: number; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-separate border-spacing-y-2 text-left" style={{ minWidth: minW }}>
        <thead>
          <tr className="text-[13px] text-ink-2">
            {cols.map((c) => (
              <th key={c.label} className={cn('px-5 pb-0.5 font-medium', c.right && 'text-right')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>{children}</AnimatePresence>
          {empty && (
            <tr><td colSpan={cols.length} className="rounded-[18px] bg-surface-2 px-5 py-8 text-center">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Row({
  children, i = 0, onClick, tone = 'base',
}: { children: ReactNode; i?: number; onClick?: () => void; tone?: 'base' | 'crit' | 'selected' }) {
  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, delay: 0.04 * i, ease }}
      onClick={onClick}
      className={cn(
        'group [&>td]:transition-colors [&>td:first-child]:rounded-l-[18px] [&>td:last-child]:rounded-r-[18px]',
        onClick && 'cursor-pointer',
        tone === 'base' && '[&>td]:bg-surface-2 [&>td]:group-hover:bg-surface-3',
        tone === 'crit' && '[&>td]:bg-danger-soft',
        tone === 'selected' && '[&>td]:bg-brand-50',
      )}
    >
      {children}
    </motion.tr>
  )
}

export function Td({ children, right, className }: { children: ReactNode; right?: boolean; className?: string }) {
  return <td className={cn('px-5 py-4 text-[14px] text-ink', right && 'whitespace-nowrap text-right', className)}>{children}</td>
}

/** Две строки в ячейке: основное и пояснение */
export function Cell({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <span className="block text-[15px] font-medium text-ink">{title}</span>
      {sub && <span className="mt-0.5 block text-[12.5px] text-ink-2">{sub}</span>}
    </>
  )
}

/* ───────────── пустое состояние ───────────── */

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface text-ink-2">
        <Icon size={20} strokeWidth={2} />
      </span>
      <p className="mt-3 text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-[42ch] text-[13.5px] text-ink-2">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ───────────── поля ввода ─────────────
   Метка всегда над полем, а не в плейсхолдере. Без рамки: фон surface-2,
   при фокусе фон белеет и появляется кольцо brand-100. */

const fieldCls =
  'w-full rounded-[15px] bg-surface-2 px-4 text-[15px] text-ink outline-none transition-[background-color,box-shadow] placeholder:text-ink-3 focus:bg-surface focus:ring-[3px] focus:ring-brand-100'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13.5px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="text-[12.5px] text-ink-2">{hint}</span>}
    </label>
  )
}

export function Input({ value, onChange, placeholder, className, inputMode, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
  inputMode?: 'text' | 'decimal'; autoFocus?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      autoFocus={autoFocus}
      className={cn(fieldCls, 'h-12', className)}
    />
  )
}

export function TextArea({ value, onChange, placeholder, rows = 4 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(fieldCls, 'resize-none py-3 leading-relaxed')}
    />
  )
}

/** Поиск по списку: подпись скрыта визуально, но доступна скринридеру */
export function Search({ value, onChange, label, placeholder }: {
  value: string; onChange: (v: string) => void; label: string; placeholder: string
}) {
  return (
    <label className="relative block w-full max-w-[320px]">
      <span className="sr-only">{label}</span>
      <SearchIcon size={17} strokeWidth={2} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(fieldCls, 'h-11 rounded-full pl-11')}
      />
    </label>
  )
}

export type Option = { v: string; label: string }

/** Нативный список: доступен с клавиатуры и скринридеру, оформлен как остальные поля */
export function Select({ value, onChange, groups, placeholder, invalid }: {
  value: string; onChange: (v: string) => void
  groups: { label?: string; options: Option[] }[]
  placeholder?: string; invalid?: boolean
}) {
  const render = (o: Option) => <option key={o.v} value={o.v}>{o.label}</option>
  return (
    <span className="relative block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldCls, 'h-12 appearance-none pr-11', !value && 'text-ink-3', invalid && 'bg-danger-soft')}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {groups.map((g) => (g.label
          ? <optgroup key={g.label} label={g.label}>{g.options.map(render)}</optgroup>
          : g.options.map(render)))}
      </select>
      <ChevronDown size={17} strokeWidth={2.2} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-2" />
    </span>
  )
}
