import { useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DoorOpen, LayoutGrid, MailCheck, Plus, Trash2, UserRound } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import type { AssignChairmanBody, GenerateUnitsBody } from '@ortaq/shared'
import { api, ApiError } from '../shared/api/client'
import { ease, formatDate, plural } from '../shared/lib/cn'
import { Btn, Card, CardHead, ErrorNote, Field, Input, PageHead, Row, Segmented, Skeleton, Table, Tag, Td } from '../shared/ui/kit'
import { Readiness } from '../shared/ui/Readiness'
import type { EntranceLayout, HouseDetail, Unit } from './types'

/* ───────── председатель ───────── */

function Chairman({ house }: { house: HouseDetail }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'house', house.id] })

  const assign = useMutation({
    mutationFn: (body: AssignChairmanBody) => api(`/admin/houses/${house.id}/chairman`, { method: 'POST', body }),
    onSuccess: async () => {
      setSentTo(email)
      setEmail('')
      setName('')
      await refresh()
    },
  })
  const revoke = useMutation({
    mutationFn: () => api(`/admin/houses/${house.id}/chairman`, { method: 'DELETE' }),
    onSuccess: async () => {
      setConfirmRevoke(false)
      await refresh()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    assign.mutate({ email, full_name: name })
  }

  const c = house.chairman
  return (
    <Card>
      <CardHead icon={UserRound} title="Председатель" sub={c ? 'Распоряжается деньгами дома, вход только с 2FA' : 'Учётка по почте, письмо с установкой пароля'} />
      {sentTo && (
        <p className="mb-4 flex items-start gap-2 rounded-[15px] bg-brand-50 px-4 py-3 text-[14px] text-brand-800">
          <MailCheck size={17} strokeWidth={2.2} className="mt-px shrink-0" /> Письмо отправлено на {sentTo}. Ссылка действует 72 часа.
        </p>
      )}
      {c ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-[18px] bg-surface-2 px-4 py-3">
            <p className="text-[15px] font-semibold text-ink">{c.full_name}</p>
            <p className="text-[13.5px] text-ink-2">{c.email} · назначен {formatDate(c.assigned_at)}</p>
            <div className="mt-2">{c.activated ? <Tag tone="brand">Вошёл, 2FA подключена</Tag> : <Tag tone="warn">Ждём пароль и 2FA</Tag>}</div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {confirmRevoke ? (
              <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3 rounded-[18px] bg-danger-soft p-4">
                <p className="text-[14px] text-ink">Отозвать доступ? Дом останется без председателя до назначения нового. Действие попадёт в журнал.</p>
                <ErrorNote>{revoke.error?.message}</ErrorNote>
                <div className="flex gap-2">
                  <Btn variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate()}>Отозвать</Btn>
                  <Btn variant="soft" onClick={() => setConfirmRevoke(false)}>Оставить</Btn>
                </div>
              </motion.div>
            ) : (
              <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Btn variant="ghost" onClick={() => setConfirmRevoke(true)}>Отозвать доступ при переизбрании</Btn>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="ФИО">{(id) => <Input id={id} value={name} onChange={setName} autoComplete="off" />}</Field>
          <Field label="Почта" hint="Вход председателя — по почте и паролю, с кодом из приложения">
            {(id, d) => <Input id={id} describedBy={d} type="email" value={email} onChange={setEmail} autoComplete="off" />}
          </Field>
          <ErrorNote>{assign.error?.message}</ErrorNote>
          <Btn type="submit" loading={assign.isPending} disabled={name.trim().length < 3 || !email.includes('@')}>Назначить и отправить письмо</Btn>
        </form>
      )}
    </Card>
  )
}

/* ───────── разбивка по подъездам ───────── */

type Draft = { entrance: number; from: string; to: string; floors: string }

const toDraft = (l: EntranceLayout[]): Draft[] =>
  l.map((e) => ({ entrance: e.entrance, from: String(e.from), to: String(e.to), floors: String(e.floors) }))

function Layout({ house }: { house: HouseDetail }) {
  const qc = useQueryClient()
  const [rows, setRows] = useState<Draft[]>(() => toDraft(house.layout))
  const [editing, setEditing] = useState(false)

  const regenerate = useMutation({
    mutationFn: (body: GenerateUnitsBody) => api(`/admin/houses/${house.id}/generate-units`, { method: 'POST', body }),
    onSuccess: async () => {
      setEditing(false)
      await qc.invalidateQueries({ queryKey: ['admin', 'house', house.id] })
      await qc.invalidateQueries({ queryKey: ['admin', 'units', house.id] })
    },
  })

  const total = rows.reduce((s, r) => s + Math.max(0, Number(r.to) - Number(r.from) + 1), 0)
  const set = (i: number, key: keyof Draft, v: string) =>
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, [key]: v.replace(/\D/g, '').slice(0, 5) } : r)))
  const add = () => {
    const last = rows.at(-1)
    const from = last ? Number(last.to) + 1 : 1
    setRows((rs) => [...rs, { entrance: rs.length + 1, from: String(from), to: String(from), floors: last?.floors ?? '9' }])
  }
  const remove = (i: number) => setRows((rs) => rs.filter((_, n) => n !== i).map((r, n) => ({ ...r, entrance: n + 1 })))

  const submit = () =>
    regenerate.mutate({
      strategy: 'SEQUENTIAL',
      entrances: rows.map((r) => ({ entrance: r.entrance, from: Number(r.from), to: Number(r.to), floors: Number(r.floors) || 1 })),
    })

  return (
    <Card>
      <CardHead
        icon={LayoutGrid}
        title="Разбивка по подъездам"
        sub="Генератор делит поровну. Реальные дома почти никогда не делятся ровно — поправьте номера"
        aside={!editing && <Btn variant="soft" onClick={() => { setRows(toDraft(house.layout)); setEditing(true) }}>Изменить</Btn>}
      />
      {!editing ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {house.layout.map((e) => (
            <li key={e.entrance} className="flex items-center justify-between rounded-[16px] bg-surface-2 px-4 py-3">
              <span className="text-[14.5px] font-semibold text-ink">{e.entrance} подъезд</span>
              <span className="nums text-[14px] text-ink-2">кв. {e.from}–{e.to} · {e.floors} эт.</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-2 text-[13px] font-semibold text-ink-2">
            <span className="w-20">Подъезд</span><span>С номера</span><span>По номер</span><span>Этажей</span><span className="w-10" />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-2">
              <span className="nums w-20 text-[15px] font-semibold text-ink">{r.entrance}</span>
              <Input value={r.from} onChange={(v) => set(i, 'from', v)} inputMode="numeric" className="nums" />
              <Input value={r.to} onChange={(v) => set(i, 'to', v)} inputMode="numeric" className="nums" />
              <Input value={r.floors} onChange={(v) => set(i, 'floors', v)} inputMode="numeric" className="nums" />
              <button onClick={() => remove(i)} disabled={rows.length === 1} aria-label={`Убрать ${r.entrance} подъезд`} className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40">
                <Trash2 size={17} strokeWidth={2} />
              </button>
            </div>
          ))}
          <Btn variant="ghost" icon={Plus} onClick={add} className="self-start">Подъезд</Btn>
          <p className="rounded-[15px] bg-warning-soft px-4 py-3 text-[14px] text-ink">
            Перегенерация пересоздаёт все {total} {plural(total, ['помещение', 'помещения', 'помещений'])}, введённые площади сбросятся. Если к помещениям уже привязаны жильцы, система не даст это сделать.
          </p>
          <ErrorNote>{regenerate.error?.message}</ErrorNote>
          <div className="flex gap-2">
            <Btn loading={regenerate.isPending} onClick={submit}>Перегенерировать</Btn>
            <Btn variant="soft" onClick={() => setEditing(false)}>Отмена</Btn>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ───────── помещения ───────── */

function Units({ houseId, entrances }: { houseId: string; entrances: number[] }) {
  const q = useQuery({ queryKey: ['admin', 'units', houseId], queryFn: () => api<Unit[]>(`/admin/houses/${houseId}/units`) })
  const [entrance, setEntrance] = useState(String(entrances[0] ?? 1))
  const list = useMemo(() => (q.data ?? []).filter((u) => String(u.entrance) === entrance), [q.data, entrance])
  const missing = list.filter((u) => u.area === null && !u.is_excluded_from_voting).length

  return (
    <Card>
      <CardHead icon={DoorOpen} title="Помещения" sub={missing ? `В этом подъезде без площади: ${missing}` : 'Площади заполнены'} />
      {entrances.length > 1 && (
        <div className="mb-3">
          <Segmented id="units-entrance" label="Подъезд" value={entrance} onChange={setEntrance}
            options={entrances.map((e) => ({ v: String(e), label: `${e} подъезд` }))} />
        </div>
      )}
      {q.isPending ? <Skeleton rows={4} /> : (
        <div className="max-h-[520px] overflow-y-auto">
          <Table cols={[{ label: 'Номер' }, { label: 'Этаж' }, { label: 'Тип' }, { label: 'Площадь', right: true }]} minW={420}>
            {list.map((u) => (
              <Row key={u.id}>
                <Td><span className="nums font-semibold">кв. {u.number}</span></Td>
                <Td className="nums text-ink-2">{u.floor ?? '—'}</Td>
                <Td className="text-ink-2">{u.type === 'APARTMENT' ? 'Квартира' : u.type === 'COMMERCIAL' ? 'Нежилое' : u.type === 'PARKING' ? 'Паркинг' : 'Кладовая'}</Td>
                <Td right>{u.area ? <span className="nums">{u.area.replace('.', ',')} м²</span> : <span className="text-warning">не указана</span>}</Td>
              </Row>
            ))}
          </Table>
        </div>
      )}
    </Card>
  )
}

export function House() {
  const { houseId = '' } = useParams()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['admin', 'house', houseId], queryFn: () => api<HouseDetail>(`/admin/houses/${houseId}`), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 })
  const back = { label: 'Дома', onClick: () => navigate('/admin/houses') }

  if (q.isPending) return <><PageHead title="Дом" back={back} /><Skeleton rows={5} /></>
  if (q.isError) return <><PageHead title="Дом не найден" back={back} /><ErrorNote>{q.error.message}</ErrorNote></>

  const h = q.data
  return (
    <>
      <PageHead
        title={h.display_name}
        sub={`${h.address} · ${h.organization.name}`}
        back={back}
        actions={h.is_voting_ready ? <Tag tone="brand">Готов к голосованиям</Tag> : <Tag tone="mute">Голосования недоступны</Tag>}
      />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease }} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Readiness data={h.readiness} title="Подключение дома" />
          <Units houseId={h.id} entrances={h.layout.map((e) => e.entrance)} />
        </div>
        <div className="flex flex-col gap-6">
          <Chairman house={h} />
          <Layout key={h.layout.map((e) => `${e.from}-${e.to}`).join()} house={h} />
        </div>
      </motion.div>
    </>
  )
}
