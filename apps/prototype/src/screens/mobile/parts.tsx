import type { ReactNode } from 'react'
import { Bell, Sparkles } from 'lucide-react'
import { AppBar } from '../../components/Bits'
import { workers } from '../../data/chairman'
import { cn, plural } from '../../lib/cn'

/** Шапка вкладки: дом мелко, название крупно, справа уведомления или действие */
export function MHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <AppBar
      left={
        <div>
          <p className="text-[13px] font-medium text-ink-2">Асыл Арман, блок 3</p>
          <h1 className="mt-0.5 font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{title}</h1>
        </div>
      }
      right={right ?? (
        <button aria-label="Уведомления, 4 новых" className="relative grid size-11 shrink-0 place-items-center rounded-full bg-surface text-ink-2">
          <Bell size={18} strokeWidth={2} />
          <span className="nums absolute -right-0.5 -top-0.5 grid size-[18px] place-items-center rounded-full bg-danger text-[10px] font-bold text-white">4</span>
        </button>
      )}
    />
  )
}

const staffOnly = workers.filter((w) => !w.contractor).sort((a, b) => a.load - b.load)

/** Выбор исполнителя: свободные сверху, рядом загрузка, специалист из подсказки ИИ отмечен */
export function WorkerPicker({ value, onChange, suggest }: { value: string; onChange: (name: string) => void; suggest?: string }) {
  return (
    <div role="radiogroup" className="flex flex-col gap-1.5">
      {staffOnly.map((w) => {
        const on = w.name === value
        const ai = suggest && w.role === suggest
        return (
          <button
            key={w.name}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(w.name)}
            className={cn('flex min-h-14 items-center gap-3 rounded-[16px] px-3.5 py-2.5 text-left transition-colors', on ? 'bg-brand-50' : 'bg-surface-2')}
          >
            <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', on ? 'bg-brand-600' : 'bg-surface-3')}>
              {on && <span className="size-2 rounded-full bg-white" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                {w.name}
                {ai && <Sparkles size={13} strokeWidth={2.4} className="text-brand-600" aria-label="советует ИИ" />}
              </span>
              <span className="block text-[13px] text-ink-2">{w.role}</span>
            </span>
            <span className={cn('nums shrink-0 text-[13px] font-medium', w.load > 2 ? 'text-warning' : 'text-ink-2')}>
              {w.load === 0 ? 'свободен' : `${w.load} ${plural(w.load, ['задача', 'задачи', 'задач'])}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
