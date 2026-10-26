import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Ruler, Search } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { MAX_AREA } from '@ortaq/shared'
import { api, ApiError } from '../shared/api/client'
import { cn, ease, plural } from '../shared/lib/cn'
import { Btn, Card, ErrorNote, fieldCls, PageHead, Segmented, Skeleton } from '../shared/ui/kit'

type Unit = { id: string; number: string; type: string; area: string | null; entrance: number | null; floor: number | null }
type Saved = { updated: number; readiness: { areas_filled: number; areas_total: number; is_voting_ready: boolean } }

/** «54,3» и «54.3» — одно и то же; пусто — не трогаем */
function parseArea(v: string): number | null | 'bad' {
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 && n <= MAX_AREA ? n : 'bad'
}

const shownError = (e: Error | null) => (e && !(e instanceof ApiError && e.code === 'STEP_UP_CANCELLED') ? e.message : null)

/**
 * Массовый ввод площадей (docs/04 §4.1, путь 2): все помещения на одном экране,
 * Tab ведёт от квартиры к квартире. Сохраняются только изменённые, одной транзакцией.
 */
export function Areas() {
  const { houseId = '' } = useParams()
  const qc = useQueryClient()
  const units = useQuery({ queryKey: ['house', houseId, 'units'], queryFn: () => api<Unit[]>(`/houses/${houseId}/units`) })
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'empty' | 'all'>('empty')
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState<Saved | null>(null)

  const list = units.data ?? []
  const emptyCount = list.filter((u) => u.area === null).length
  // Фильтр «без площади» не прячет квартиру, пока её правят: иначе она исчезла бы на первой цифре
  const visible = list.filter((u) => (filter === 'all' || u.area === null || u.id in draft) && (!query || u.number.toLowerCase().startsWith(query.toLowerCase())))
  const byEntrance = useMemo(() => {
    const groups = new Map<number | null, Unit[]>()
    for (const u of visible) groups.set(u.entrance, [...(groups.get(u.entrance) ?? []), u])
    return [...groups.entries()]
  }, [visible])

  const changes = Object.entries(draft).flatMap(([id, v]) => {
    const n = parseArea(v)
    const unit = list.find((u) => u.id === id)
    if (n === null || n === 'bad' || !unit || (unit.area !== null && Number(unit.area) === n)) return []
    return [{ unit_id: id, area: n }]
  })
  const invalid = Object.values(draft).filter((v) => parseArea(v) === 'bad').length

  const save = useMutation({
    mutationFn: () => api<Saved>(`/houses/${houseId}/units/bulk-areas`, { method: 'POST', body: { areas: changes } }),
    onSuccess: async (r) => {
      setSaved(r)
      setDraft({})
      await Promise.all(['units', 'readiness'].map((k) => qc.invalidateQueries({ queryKey: ['house', houseId, k] })))
    },
  })

  return (
    <>
      <PageHead title="Площади помещений" sub="Площадь — основа веса голоса. Пока заполнены не все, голосования недоступны" />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented id="areas-filter" label="Какие помещения показать" value={filter} onChange={setFilter}
            options={[{ v: 'empty', label: 'Без площади', n: emptyCount }, { v: 'all', label: 'Все', n: list.length }]} />
          <label className="relative min-w-[180px] flex-1 sm:max-w-[260px]">
            <span className="sr-only">Номер помещения</span>
            <Search size={17} strokeWidth={2.2} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Номер помещения" className={cn(fieldCls, 'h-11 pl-11')} />
          </label>
        </div>

        {units.isPending && <Skeleton rows={4} className="mt-5" />}
        {units.data && visible.length === 0 && (
          <p className="mt-5 flex items-center gap-2 rounded-[18px] bg-brand-50 px-4 py-4 text-[14.5px] text-brand-800">
            <Check size={18} strokeWidth={2.4} /> {filter === 'empty' && !query ? 'Площади заполнены у всех помещений' : 'Ничего не нашли'}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-6">
          {byEntrance.map(([entrance, group]) => (
            <section key={entrance ?? 'none'}>
              <h2 className="mb-2.5 text-[14px] font-semibold text-ink-2">{entrance ? `Подъезд ${entrance}` : 'Без подъезда'}</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {group.map((u) => {
                  const value = draft[u.id] ?? (u.area ? String(Number(u.area)) : '')
                  const bad = parseArea(value) === 'bad'
                  const touched = u.id in draft
                  return (
                    <label key={u.id} className={cn('flex flex-col gap-1.5 rounded-[18px] p-3 transition-colors', touched ? 'bg-brand-50' : 'bg-surface-2')}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="nums text-[14.5px] font-semibold text-ink">кв. {u.number}</span>
                        {u.floor && <span className="nums text-[12px] text-ink-3">{u.floor} эт.</span>}
                      </span>
                      <span className="relative">
                        <input
                          value={value}
                          inputMode="decimal"
                          aria-invalid={bad || undefined}
                          aria-label={`Площадь помещения ${u.number}, м²`}
                          onChange={(e) => setDraft((d) => ({ ...d, [u.id]: e.target.value.replace(/[^\d.,]/g, '').slice(0, 8) }))}
                          placeholder="—"
                          className={cn(fieldCls, 'nums h-11 bg-surface pr-10')}
                        />
                        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">м²</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </Card>

      {/* Панель сохранения появляется, только когда есть что сохранять */}
      <AnimatePresence>
        {(changes.length > 0 || invalid > 0 || saved) && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.3, ease }}
            className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-[22px] bg-ink px-5 py-3.5 text-white">
            <Ruler size={18} strokeWidth={2.2} className="shrink-0 text-white/70" />
            <p className="nums min-w-0 flex-1 text-[14.5px]">
              {changes.length > 0
                ? `Изменено ${changes.length} ${plural(changes.length, ['помещение', 'помещения', 'помещений'])}${invalid ? `, с ошибкой ${invalid}` : ''}`
                : invalid > 0 ? `Проверьте значения: ${invalid} с ошибкой` : `Сохранено. Заполнено ${saved!.readiness.areas_filled} из ${saved!.readiness.areas_total}`}
            </p>
            {changes.length > 0 && (
              <>
                <Btn variant="ghost" onClick={() => setDraft({})} className="text-white/80 hover:bg-white/10 hover:text-white">Сбросить</Btn>
                <Btn icon={Check} loading={save.isPending} disabled={invalid > 0} onClick={() => { setSaved(null); save.mutate() }}>Сохранить</Btn>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <ErrorNote>{shownError(save.error)}</ErrorNote>
    </>
  )
}
