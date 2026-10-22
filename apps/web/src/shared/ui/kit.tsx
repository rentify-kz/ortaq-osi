import { useId, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ChevronDown, CircleAlert, LoaderCircle, type LucideIcon } from 'lucide-react'
import { cn, ease, spring } from '../lib/cn'

/*
 * UI-кит кабинета. Перенесён из прототипа (apps/prototype/src/components/web/ui.tsx):
 * без рамок и теней, глубина — тональными слоями canvas → surface → surface-2 → surface-3.
 * Наведение меняет только фон или цвет (CLAUDE.md, правило 1).
 */

/* ───────── кнопки ───────── */

type BtnProps = {
  children: ReactNode
  variant?: 'solid' | 'soft' | 'ghost' | 'danger'
  size?: 'md' | 'lg'
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
  full?: boolean
  type?: 'button' | 'submit'
  onClick?: () => void
  className?: string
}

export function Btn({ children, variant = 'solid', size = 'md', icon: Icon, loading, disabled, full, type = 'button', onClick, className }: BtnProps) {
  return (
    <motion.button
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.975 }}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        size === 'md' ? 'h-11 px-5 text-[14.5px]' : 'h-12 px-6 text-[15px]',
        variant === 'solid' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'soft' && 'bg-surface-2 text-ink hover:bg-surface-3',
        variant === 'ghost' && 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'bg-danger-soft text-danger hover:bg-[#fbdedc]',
        full && 'w-full',
        className,
      )}
    >
      {loading ? <LoaderCircle size={17} strokeWidth={2.2} className="animate-spin" /> : Icon && <Icon size={17} strokeWidth={2.1} />}
      {children}
    </motion.button>
  )
}

/* ───────── карточки и заголовки ───────── */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('min-w-0 rounded-[26px] bg-surface p-5 sm:p-6', className)}>{children}</section>
}

export function CardHead({ icon: Icon, title, sub, aside }: { icon?: LucideIcon; title: ReactNode; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {Icon && (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
          <Icon size={19} strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.01em] text-ink">{title}</h2>
        {sub && <p className="mt-1 text-[13.5px] text-ink-2">{sub}</p>}
      </div>
      {aside}
    </div>
  )
}

export function PageHead({ title, sub, actions, back }: {
  title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { label: string; onClick: () => void }
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}
      className="flex flex-wrap items-end justify-between gap-4 px-1 pb-2"
    >
      <div className="min-w-0">
        {back && (
          <button onClick={back.onClick} className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface pl-3 pr-4 text-[14px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
            <ArrowLeft size={16} strokeWidth={2.2} /> {back.label}
          </button>
        )}
        <h1 className="font-display text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">{title}</h1>
        {sub && <p className="mt-2 text-[15px] text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  )
}

/* ───────── переключатели и метки ───────── */

export function Segmented<T extends string>({ options, value, onChange, id, label }: {
  options: { v: T; label: string; n?: number }[]; value: T; onChange: (v: T) => void; id: string; label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit max-w-full flex-wrap rounded-full bg-surface-2 p-1">
      {options.map((o) => {
        const on = o.v === value
        return (
          <button key={o.v} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.v)} className="relative h-9 rounded-full px-4 text-[14px] font-semibold">
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

/* ───────── таблица: строка — залитый блок ───────── */

export type Col = { label: string; right?: boolean }

export function Table({ cols, minW = 640, children }: { cols: Col[]; minW?: number; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-separate border-spacing-y-2 text-left" style={{ minWidth: minW }}>
        <thead>
          <tr className="text-[13px] text-ink-2">
            {cols.map((c) => <th key={c.label} className={cn('px-5 pb-0.5 font-medium', c.right && 'text-right')}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'group [&>td]:bg-surface-2 [&>td]:transition-colors [&>td:first-child]:rounded-l-[18px] [&>td:last-child]:rounded-r-[18px]',
        onClick && 'cursor-pointer [&>td]:group-hover:bg-surface-3',
      )}
    >
      {children}
    </tr>
  )
}

export function Td({ children, right, className }: { children: ReactNode; right?: boolean; className?: string }) {
  return <td className={cn('px-5 py-4 text-[14px] text-ink', right && 'whitespace-nowrap text-right', className)}>{children}</td>
}

export function Cell({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <span className="block text-[15px] font-medium text-ink">{title}</span>
      {sub && <span className="mt-0.5 block text-[12.5px] text-ink-2">{sub}</span>}
    </>
  )
}

/* ───────── состояния ───────── */

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] bg-surface-2 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface text-ink-2"><Icon size={20} strokeWidth={2} /></span>
      <p className="mt-3 text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-[44ch] text-[13.5px] text-ink-2">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Скелет на время загрузки: форма та же, что у данных */
export function Skeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-[18px] bg-surface-2" />)}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {children && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          className="flex items-start gap-2 overflow-hidden rounded-[15px] bg-danger-soft px-4 py-3 text-[14px] text-danger"
        >
          <CircleAlert size={17} strokeWidth={2.2} className="mt-px shrink-0" />
          <span>{children}</span>
        </motion.p>
      )}
    </AnimatePresence>
  )
}

/* ───────── поля: метка всегда над полем ───────── */

export const fieldCls =
  'w-full rounded-[15px] bg-surface-2 px-4 text-[15px] text-ink outline-none transition-[background-color,box-shadow] placeholder:text-ink-3 focus:bg-surface focus:ring-[3px] focus:ring-brand-100 aria-[invalid=true]:bg-danger-soft'

export function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode
}) {
  const id = useId()
  const noteId = `${id}-note`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-semibold text-ink">{label}</label>
      {children(id, error || hint ? noteId : undefined)}
      {error ? <span id={noteId} className="text-[12.5px] text-danger">{error}</span>
        : hint ? <span id={noteId} className="text-[12.5px] text-ink-2">{hint}</span> : null}
    </div>
  )
}

type InputProps = {
  id?: string; describedBy?: string; value: string; onChange: (v: string) => void; placeholder?: string
  type?: 'text' | 'email' | 'password' | 'number'; autoComplete?: string; inputMode?: 'text' | 'numeric' | 'decimal' | 'email'
  invalid?: boolean; autoFocus?: boolean; className?: string; maxLength?: number
}

export function Input({ id, describedBy, value, onChange, placeholder, type = 'text', autoComplete, inputMode, invalid, autoFocus, className, maxLength }: InputProps) {
  return (
    <input
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      autoComplete={autoComplete}
      inputMode={inputMode}
      autoFocus={autoFocus}
      maxLength={maxLength}
      className={cn(fieldCls, 'h-12', className)}
    />
  )
}

export function Select({ id, value, onChange, options, placeholder }: {
  id?: string; value: string; onChange: (v: string) => void; options: { v: string; label: string }[]; placeholder?: string
}) {
  return (
    <span className="relative block">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldCls, 'h-12 appearance-none pr-11', !value && 'text-ink-3')}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      <ChevronDown size={17} strokeWidth={2.2} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-2" />
    </span>
  )
}
