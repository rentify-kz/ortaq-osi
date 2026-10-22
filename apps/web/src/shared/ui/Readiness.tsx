import { motion } from 'motion/react'
import { Check, ClipboardCheck, TriangleAlert } from 'lucide-react'
import type { ReadinessResponse } from '@ortaq/shared'
import { cn, ease, plural } from '../lib/cn'
import { Card, CardHead } from './kit'

type Item = { done: boolean; label: string; value: string }

function items(r: ReadinessResponse): Item[] {
  return [
    { done: r.units_generated, label: 'Помещения созданы', value: String(r.units_total) },
    {
      done: r.chairman_activated,
      label: 'Председатель назначен',
      value: r.chairman_activated ? 'вошёл' : r.chairman_assigned ? 'ждём пароль и 2FA' : 'нет',
    },
    { done: r.is_voting_ready, label: 'Площади помещений', value: `${r.areas_filled} из ${r.areas_total}` },
    { done: r.registry_uploaded, label: 'Реестр собственников', value: r.registry_uploaded ? 'загружен' : 'не загружен' },
    {
      done: r.residents_joined > 0,
      label: 'Жильцы присоединились',
      value: `${r.residents_joined} ${plural(r.residents_joined, ['жилец', 'жильца', 'жильцов'])}`,
    },
  ]
}

/**
 * Чек-лист готовности дома (docs/04 §4): вместо пустого дашборда при первом входе.
 * Одна и та же картина у админа платформы и у председателя.
 */
export function Readiness({ data, title = 'Подготовка дома' }: { data: ReadinessResponse; title?: string }) {
  const list = items(data)
  const done = list.filter((i) => i.done).length
  return (
    <Card>
      <CardHead
        icon={ClipboardCheck}
        title={title}
        sub="Что осталось, чтобы дом заработал полностью"
        aside={<span className="nums font-display text-[15px] font-bold text-ink-2">{done} из {list.length}</span>}
      />
      <div className="mb-4 flex gap-1.5" aria-hidden>
        {list.map((i) => <span key={i.label} className={cn('h-1.5 flex-1 rounded-full', i.done ? 'bg-brand-500' : 'bg-surface-3')} />)}
      </div>
      <ul className="flex flex-col gap-2">
        {list.map((i, n) => (
          <motion.li
            key={i.label}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.04 * n, ease }}
            className="flex items-center gap-3 rounded-[16px] bg-surface-2 px-4 py-3"
          >
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', i.done ? 'bg-brand-600 text-white' : 'bg-surface-3 text-transparent')}>
              <Check size={15} strokeWidth={2.6} />
            </span>
            <span className={cn('flex-1 text-[15px]', i.done ? 'text-ink' : 'font-medium text-ink')}>{i.label}</span>
            <span className={cn('nums text-[14px]', i.done ? 'text-ink-2' : 'font-semibold text-ink')}>{i.value}</span>
          </motion.li>
        ))}
      </ul>
      {data.blocking_issues.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {data.blocking_issues.map((issue) => (
            <li key={issue} className="flex items-start gap-2 rounded-[15px] bg-warning-soft px-4 py-3 text-[14px] text-ink">
              <TriangleAlert size={17} strokeWidth={2.2} className="mt-px shrink-0 text-warning" />
              {issue}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
