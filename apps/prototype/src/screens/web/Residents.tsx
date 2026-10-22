import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Upload, Link2, Check, X, CircleAlert, UserPlus, ArrowDown, Ruler, Users } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import {
  PageHead, HeadBtn, Segmented, Tag, Table, Row, Td, Cell, Empty, Search, Input, type Tone,
} from '../../components/web/ui'
import { joinRequests, type JoinRequest, type UnitStatus } from '../../data/chairman'
import { useHouse } from './HouseContext'
import { ease, plural } from '../../lib/cn'

/* ───────────── заявки на вступление ───────────── */

const registryTag: Record<JoinRequest['registry']['kind'], { tone: Tone; icon: typeof Check }> = {
  match: { tone: 'brand', icon: Check },
  mismatch: { tone: 'warn', icon: CircleAlert },
  tenant: { tone: 'mute', icon: Users },
}

function Joins() {
  const [list, setList] = useState(joinRequests)
  const drop = (flat: number) => setList((l) => l.filter((j) => j.flat !== flat))

  return (
    <Card delay={0.08} lift={false} className="flex flex-col gap-4">
      <CardHead
        title="Заявки на вступление"
        sub="Реестр подсказывает, но решение за вами: квартиры продаются и наследуются"
        icon={<UserPlus size={18} strokeWidth={2} />}
        action={list.length > 0 && <span className="nums grid size-9 place-items-center rounded-full bg-warning-soft font-display text-[14px] font-extrabold text-warning">{list.length}</span>}
      />
      {list.length === 0 ? (
        <div className="rounded-[18px] bg-surface-2 px-5 py-8">
          <Empty icon={Check} title="Новых заявок нет" text="Жильцы, которые найдут дом по адресу, появятся здесь." />
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.map((j) => {
              const tag = registryTag[j.registry.kind]
              return (
                <motion.article
                  key={j.flat}
                  layout
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.3, ease }}
                  className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-100 font-display text-[14px] font-bold text-brand-700">
                      {j.name.split(' ').map((w) => w[0]).join('')}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-ink">{j.name}</p>
                      <p className="text-[13px] text-ink-2">кв. {j.flat}, {j.relation}</p>
                    </div>
                  </div>
                  <p className="text-[14px] leading-relaxed text-ink">«{j.note}»</p>
                  <p className="text-[13px] text-ink-2">{j.phone}</p>
                  <div><Tag tone={tag.tone} icon={tag.icon}>{j.registry.text}</Tag></div>
                  <div className="mt-auto flex gap-2 pt-1">
                    <Btn className="flex-1" onClick={() => drop(j.flat)}><Check size={15} strokeWidth={2.6} /> Подтвердить</Btn>
                    <Btn variant="ghost" className="!bg-surface hover:!bg-surface-3" onClick={() => drop(j.flat)}><X size={15} strokeWidth={2.4} /> Отклонить</Btn>
                  </div>
                </motion.article>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </Card>
  )
}

/* ───────────── помещения ───────────── */

type Filter = 'all' | 'noarea' | 'pending' | 'absent'

const statusTag: Record<UnitStatus, { label: string; tone: Tone }> = {
  verified: { label: 'Личность подтверждена', tone: 'brand' },
  pending: { label: 'Ждёт подтверждения', tone: 'warn' },
  absent: { label: 'Не в приложении', tone: 'mute' },
}

const PAGE = 10
const fmtArea = (a: number) => `${String(a).replace('.', ',')} м²`

function AreaCell({ flat, area, onSave }: { flat: number; area: number | null; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)

  if (area !== null && !editing) return <span className="nums">{fmtArea(area)}</span>

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-warning-soft px-3.5 text-[13px] font-semibold text-warning transition-colors hover:bg-[#fbebd4]"
      >
        <Ruler size={14} strokeWidth={2.2} /> Указать площадь
      </button>
    )
  }

  const save = () => {
    const v = Number(draft.replace(',', '.'))
    if (!v || v < 10 || v > 500) { setError(true); return }
    onSave(Math.round(v * 10) / 10)
    setEditing(false)
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(v) => { setDraft(v); setError(false) }}
          placeholder="62,4"
          inputMode="decimal"
          autoFocus
          className="!h-9 w-[92px] !rounded-full !bg-surface !px-3 !text-[14px]"
        />
        <button type="submit" aria-label={`Сохранить площадь кв. ${flat}`} className="grid size-9 place-items-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700">
          <Check size={15} strokeWidth={2.6} />
        </button>
      </div>
      {error && <span className="text-[12px] text-danger">Площадь в м², например 62,4</span>}
    </form>
  )
}

function Units() {
  const [f, setF] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const { units: list, missing, setArea } = useHouse()
  const match = (u: (typeof list)[number], x: Filter) =>
    x === 'all' || (x === 'noarea' && u.area === null) || u.status === x
  const query = q.trim().toLowerCase().replace(/^кв\.?\s*/, '')
  const found = (u: (typeof list)[number]) => !query || String(u.flat) === query || u.owner.toLowerCase().includes(query)
  const rows = list.filter((u) => match(u, f) && found(u))
  const count = (x: Filter) => list.filter((u) => match(u, x)).length

  return (
    <Card delay={0.15} lift={false} className="flex flex-col gap-4 !p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">Помещения</h2>
        <Search value={q} onChange={(v) => { setQ(v); setLimit(PAGE) }} label="Поиск помещения" placeholder="Номер квартиры или фамилия" />
      </div>

      {/* Без площадей голоса нельзя посчитать по закону, поэтому это главное действие экрана */}
      {missing > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-warning-soft py-3 pl-4 pr-3">
          <p className="flex items-start gap-2.5 text-[14px] leading-snug text-ink">
            <CircleAlert size={18} strokeWidth={2.2} className="mt-px shrink-0 text-warning" />
            <span>
              Голосования недоступны: у {missing} {plural(missing, ['помещения', 'помещений', 'помещений'])} не указана площадь.
              <span className="block text-[13px] text-ink-2">Голоса считаются пропорционально площади, без неё протокол можно оспорить.</span>
            </span>
          </p>
          {f !== 'noarea' && <Btn className="!h-10 !rounded-full" onClick={() => { setF('noarea'); setLimit(PAGE) }}>Заполнить</Btn>}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-[16px] bg-brand-50 px-4 py-3 text-[14px] text-brand-700">
          <Check size={18} strokeWidth={2.6} /> Площади заполнены, голосования доступны
        </div>
      )}

      <Segmented
        id="units"
        value={f}
        onChange={(v) => { setF(v); setLimit(PAGE) }}
        options={[
          { v: 'all', label: 'Все', n: count('all') },
          { v: 'noarea', label: 'Без площади', n: count('noarea') },
          { v: 'pending', label: 'Ждут подтверждения', n: count('pending') },
          { v: 'absent', label: 'Не в приложении', n: count('absent') },
        ]}
      />

      <Table
        cols={[{ label: 'Помещение' }, { label: 'Площадь' }, { label: 'Собственник по реестру' }, { label: 'В приложении' }, { label: 'Статус', right: true }]}
        empty={rows.length === 0 && (
          <Empty
            icon={Check}
            title={f === 'noarea' && !query ? 'Все площади указаны' : 'Ничего не нашлось'}
            text={f === 'noarea' && !query ? 'Голосования снова доступны.' : 'Проверьте номер квартиры или фамилию.'}
          />
        )}
      >
        {rows.slice(0, limit).map((u, i) => (
          <Row key={u.flat} i={i % PAGE}>
            <Td><Cell title={`кв. ${u.flat}`} sub={`${u.entrance} подъезд, ${u.floor} этаж`} /></Td>
            <Td><AreaCell flat={u.flat} area={u.area} onSave={(v) => setArea(u.flat, v)} /></Td>
            <Td>{u.owner}</Td>
            <Td className="text-ink-2">{u.residents ? `${u.residents} ${plural(u.residents, ['жилец', 'жильца', 'жильцов'])}` : 'нет'}</Td>
            <Td right><Tag tone={statusTag[u.status].tone}>{statusTag[u.status].label}</Tag></Td>
          </Row>
        ))}
      </Table>

      {rows.length > limit && (
        <div className="flex justify-center">
          <motion.button
            whileTap={{ scale: 0.975 }}
            onClick={() => setLimit((l) => l + 20)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-2 px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-3"
          >
            Показать ещё, осталось {rows.length - limit} <ArrowDown size={15} strokeWidth={2.2} />
          </motion.button>
        </div>
      )}
    </Card>
  )
}

/* ───────────── экран ───────────── */

export function Residents() {
  const { units, loadRegistry } = useHouse()
  const [copied, setCopied] = useState(false)
  const [loaded, setLoaded] = useState<number | null>(null)
  const inApp = units.reduce((s, u) => s + u.residents, 0)
  const verified = units.filter((u) => u.status === 'verified').length

  return (
    <>
      <PageHead
        title="Жильцы"
        sub={`128 помещений. В приложении ${inApp} жильцов, личность подтвердили в ${verified} помещениях`}
        actions={
          <>
            {loaded === null
              ? <HeadBtn icon={Upload} onClick={() => setLoaded(loadRegistry())}>Загрузить реестр</HeadBtn>
              : <Tag tone="brand" icon={Check}>Реестр загружен, площади заполнены: {loaded}</Tag>}
            <Btn className="!rounded-full" onClick={() => setCopied(true)}>
              {copied ? <><Check size={16} strokeWidth={2.6} /> Ссылка скопирована</> : <><Link2 size={16} strokeWidth={2.2} /> Пригласить жильцов</>}
            </Btn>
          </>
        }
      />
      <Joins />
      <Units />
    </>
  )
}
