import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Building2, Eye, EyeOff, Plus, UserRound, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { Specialization, type ContractorBody, type StaffBody } from '@ortaq/shared'
import { api } from '../shared/api/client'
import { cn, ease, formatDate } from '../shared/lib/cn'
import { Btn, Card, CardHead, Empty, ErrorNote, Field, Input, PageHead, Skeleton, Tag } from '../shared/ui/kit'
import { SPECIALIZATION_LABELS } from './labels'

type StaffMember = {
  id: string; full_name: string; position: string; specializations: string[]; phone_public: string | null
  work_schedule: string | null; visible_to_residents: boolean; is_active: boolean; user_id: string | null
}
type Contractor = {
  id: string; name: string; bin: string | null; specializations: string[]; contact_person: string | null; phone: string | null
  email: string | null; contract_from: string | null; contract_to: string | null; visible_to_residents: boolean; is_active: boolean
}

const formatPhone = (p: string | null) => (p ? p.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 $1 $2 $3 $4') : null)

function Chips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div role="group" aria-label="Специализации" className="flex flex-wrap gap-1.5">
      {Specialization.map((s) => {
        const on = value.includes(s)
        return (
          <button key={s} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
            className={cn('h-10 rounded-full px-4 text-[13.5px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface-2 text-ink hover:bg-surface-3')}>
            {SPECIALIZATION_LABELS[s]}
          </button>
        )
      })}
    </div>
  )
}

/** Видимость жильцам — главный переключатель прозрачности, поэтому он прямо на карточке */
function VisibilityToggle({ on, loading, onToggle }: { on: boolean; loading: boolean; onToggle: () => void }) {
  return (
    <Btn variant="ghost" icon={on ? Eye : EyeOff} loading={loading} onClick={onToggle}>{on ? 'Видят жильцы' : 'Скрыт от жильцов'}</Btn>
  )
}

function StaffForm({ houseId, onClose }: { houseId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ full_name: '', position: '', phone_public: '', work_schedule: '' })
  const [specs, setSpecs] = useState<string[]>([])
  const create = useMutation({
    mutationFn: (body: StaffBody) => api(`/houses/${houseId}/staff`, { method: 'POST', body }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['house', houseId, 'staff'] }); onClose() },
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const fields = create.error instanceof Error && 'fields' in create.error ? (create.error as { fields: Record<string, string> }).fields : {}
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
      <div className="mb-5 flex flex-col gap-4 rounded-[20px] bg-surface-2 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ФИО" error={fields.full_name}>{(id) => <Input id={id} value={f.full_name} onChange={set('full_name')} autoFocus />}</Field>
          <Field label="Должность" error={fields.position}>{(id) => <Input id={id} value={f.position} onChange={set('position')} placeholder="Сантехник" />}</Field>
          <Field label="Рабочий телефон" hint="Его увидят жильцы. Личный не указывайте" error={fields.phone_public}>
            {(id, d) => <Input id={id} describedBy={d} value={f.phone_public} onChange={set('phone_public')} inputMode="numeric" placeholder="+7 727 000 00 00" />}
          </Field>
          <Field label="График">{(id) => <Input id={id} value={f.work_schedule} onChange={set('work_schedule')} placeholder="Пн–Пт 9:00–18:00" />}</Field>
        </div>
        <Chips value={specs} onChange={setSpecs} />
        <ErrorNote>{create.error && !Object.keys(fields).length ? create.error.message : null}</ErrorNote>
        <div className="flex gap-2">
          <Btn icon={Plus} loading={create.isPending} onClick={() => create.mutate({
            full_name: f.full_name, position: f.position, specializations: specs as StaffBody['specializations'],
            phone_public: f.phone_public.trim() || null, work_schedule: f.work_schedule || null,
          })}>Добавить</Btn>
          <Btn variant="soft" onClick={onClose}>Отмена</Btn>
        </div>
      </div>
    </motion.div>
  )
}

function StaffCard({ houseId }: { houseId: string }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const q = useQuery({ queryKey: ['house', houseId, 'staff'], queryFn: () => api<StaffMember[]>(`/houses/${houseId}/staff`) })
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<StaffMember> }) => api(`/houses/${houseId}/staff/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['house', houseId, 'staff'] }),
  })
  return (
    <Card>
      <CardHead icon={UserRound} title="Персонал" sub="Жильцы видят ФИО, должность, рабочий телефон и график. Не видят ничего личного"
        aside={!adding && <Btn variant="soft" icon={Plus} onClick={() => setAdding(true)}>Добавить</Btn>} />
      <AnimatePresence>{adding && <StaffForm houseId={houseId} onClose={() => setAdding(false)} />}</AnimatePresence>
      {q.isPending && <Skeleton rows={2} />}
      {q.data?.length === 0 && !adding && <Empty icon={UserRound} title="Персонал не добавлен" text="Добавьте дворника, сантехника, электрика — жильцы будут знать, к кому обращаться." />}
      <ul className="flex flex-col gap-2">
        {q.data?.map((s) => (
          <li key={s.id} className={cn('flex flex-wrap items-center gap-3 rounded-[18px] bg-surface-2 px-4 py-3', !s.is_active && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">{s.full_name}</p>
              <p className="text-[13.5px] text-ink-2">
                {[s.position, formatPhone(s.phone_public), s.work_schedule].filter(Boolean).join(' · ')}
              </p>
              {s.specializations.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">{s.specializations.map((x) => <Tag key={x} tone="mute">{SPECIALIZATION_LABELS[x]}</Tag>)}</div>
              )}
            </div>
            {s.is_active && <VisibilityToggle on={s.visible_to_residents} loading={patch.isPending && patch.variables?.id === s.id && 'visible_to_residents' in patch.variables.body}
              onToggle={() => patch.mutate({ id: s.id, body: { visible_to_residents: !s.visible_to_residents } })} />}
            <Btn variant="ghost" icon={s.is_active ? X : undefined} onClick={() => patch.mutate({ id: s.id, body: { is_active: !s.is_active } })}>
              {s.is_active ? 'Уволить' : 'Вернуть'}
            </Btn>
          </li>
        ))}
      </ul>
      <ErrorNote>{patch.error?.message}</ErrorNote>
    </Card>
  )
}

function ContractorForm({ houseId, onClose }: { houseId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ name: '', bin: '', contact_person: '', phone: '', email: '', contract_from: '', contract_to: '' })
  const [specs, setSpecs] = useState<string[]>([])
  const create = useMutation({
    mutationFn: (body: ContractorBody) => api(`/houses/${houseId}/contractors`, { method: 'POST', body }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['house', houseId, 'contractors'] }); onClose() },
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  const fields = create.error && 'fields' in create.error ? (create.error as { fields: Record<string, string> }).fields : {}
  const orNull = (v: string) => v.trim() || null
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
      <div className="mb-5 flex flex-col gap-4 rounded-[20px] bg-surface-2 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Наименование" error={fields.name}>{(id) => <Input id={id} value={f.name} onChange={set('name')} placeholder="ТОО «Лифт Сервис»" autoFocus />}</Field>
          <Field label="БИН" error={fields.bin}>{(id) => <Input id={id} value={f.bin} onChange={(v) => set('bin')(v.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" className="nums" />}</Field>
          <Field label="Контактное лицо">{(id) => <Input id={id} value={f.contact_person} onChange={set('contact_person')} />}</Field>
          <Field label="Телефон" error={fields.phone}>{(id) => <Input id={id} value={f.phone} onChange={set('phone')} inputMode="numeric" />}</Field>
          <Field label="Почта" error={fields.email}>{(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Договор с" error={fields.contract_from}>{(id) => <input id={id} type="date" value={f.contract_from} onChange={(e) => set('contract_from')(e.target.value)} className="h-12 w-full rounded-[15px] bg-surface px-3 text-[15px] text-ink" />}</Field>
            <Field label="по" error={fields.contract_to}>{(id) => <input id={id} type="date" value={f.contract_to} onChange={(e) => set('contract_to')(e.target.value)} className="h-12 w-full rounded-[15px] bg-surface px-3 text-[15px] text-ink" />}</Field>
          </div>
        </div>
        <Chips value={specs} onChange={setSpecs} />
        <ErrorNote>{create.error && !Object.keys(fields).length ? create.error.message : null}</ErrorNote>
        <div className="flex gap-2">
          <Btn icon={Plus} loading={create.isPending} onClick={() => create.mutate({
            name: f.name, bin: orNull(f.bin), contact_person: orNull(f.contact_person), phone: orNull(f.phone), email: orNull(f.email),
            contract_from: orNull(f.contract_from), contract_to: orNull(f.contract_to), specializations: specs as ContractorBody['specializations'],
          })}>Добавить</Btn>
          <Btn variant="soft" onClick={onClose}>Отмена</Btn>
        </div>
      </div>
    </motion.div>
  )
}

function ContractorsCard({ houseId }: { houseId: string }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const q = useQuery({ queryKey: ['house', houseId, 'contractors'], queryFn: () => api<Contractor[]>(`/houses/${houseId}/contractors`) })
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Contractor> }) => api(`/houses/${houseId}/contractors/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['house', houseId, 'contractors'] }),
  })
  return (
    <Card>
      <CardHead icon={Building2} title="Подрядчики" sub="Компании по договорам: лифты, вывоз мусора, обслуживание"
        aside={!adding && <Btn variant="soft" icon={Plus} onClick={() => setAdding(true)}>Добавить</Btn>} />
      <AnimatePresence>{adding && <ContractorForm houseId={houseId} onClose={() => setAdding(false)} />}</AnimatePresence>
      {q.isPending && <Skeleton rows={2} />}
      {q.data?.length === 0 && !adding && <Empty icon={Building2} title="Подрядчиков нет" text="Добавьте компании, с которыми у дома договоры: жильцы увидят, кто обслуживает лифты и вывозит мусор." />}
      <ul className="flex flex-col gap-2">
        {q.data?.map((c) => (
          <li key={c.id} className={cn('flex flex-wrap items-center gap-3 rounded-[18px] bg-surface-2 px-4 py-3', !c.is_active && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">{c.name}</p>
              <p className="nums text-[13.5px] text-ink-2">
                {[c.bin && `БИН ${c.bin}`, c.contact_person, formatPhone(c.phone), c.contract_to && `договор до ${formatDate(c.contract_to)}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            {c.is_active && <VisibilityToggle on={c.visible_to_residents} loading={patch.isPending && patch.variables?.id === c.id}
              onToggle={() => patch.mutate({ id: c.id, body: { visible_to_residents: !c.visible_to_residents } })} />}
            <Btn variant="ghost" onClick={() => patch.mutate({ id: c.id, body: { is_active: !c.is_active } })}>{c.is_active ? 'Закрыть договор' : 'Вернуть'}</Btn>
          </li>
        ))}
      </ul>
      <ErrorNote>{patch.error?.message}</ErrorNote>
    </Card>
  )
}

export function Staff() {
  const { houseId = '' } = useParams()
  return (
    <>
      <PageHead title="Персонал и подрядчики" sub="Кто работает в доме. Прозрачность для жильцов — без их личных данных" />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <StaffCard houseId={houseId} />
        <ContractorsCard houseId={houseId} />
      </div>
    </>
  )
}
