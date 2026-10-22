import { useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Building, Plus, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import type { CreateHouseBody } from '@ortaq/shared'
import { api, ApiError } from '../shared/api/client'
import { ease } from '../shared/lib/cn'
import { Btn, Card, CardHead, Cell, Empty, ErrorNote, Field, Input, PageHead, Row, Select, Skeleton, Table, Tag, Td } from '../shared/ui/kit'
import type { HouseRow, Organization } from './types'

const num = (v: string) => v.replace(/\D/g, '').slice(0, 4)

function CreateHouse({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const orgs = useQuery({ queryKey: ['admin', 'organizations'], queryFn: () => api<Organization[]>('/admin/organizations') })
  const [org, setOrg] = useState('')
  const [address, setAddress] = useState('')
  const [display, setDisplay] = useState('')
  const [entrances, setEntrances] = useState('')
  const [units, setUnits] = useState('')
  const [floors, setFloors] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (body: CreateHouseBody) => api<{ id: string }>('/admin/houses', { method: 'POST', body }),
    onSuccess: async (house) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'houses'] })
      navigate(`/admin/houses/${house.id}`)
    },
    onError: (e) => e instanceof ApiError && setFields(e.fields),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setFields({})
    create.mutate({
      organization_id: org, address, display_name: display,
      entrance_count: Number(entrances), unit_count: Number(units), floor_count: floors ? Number(floors) : undefined,
    })
  }

  const active = (orgs.data ?? []).filter((o) => o.status === 'ACTIVE')

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease }}>
      <Card>
        <CardHead icon={Building} title="Новый дом" sub="Помещения создадутся сразу, по подъездам поровну. Разбивку потом можно поправить"
          aside={<button onClick={onClose} aria-label="Закрыть" className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"><X size={18} /></button>} />
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <Field label="Организация">
            {(id) => <Select id={id} value={org} onChange={setOrg} placeholder="Выберите ОСИ" options={active.map((o) => ({ v: o.id, label: o.name }))} />}
          </Field>
          <Field label="Как показывать жильцам" hint="Например, «ЖК Асыл Арман, блок 3»" error={fields.display_name}>
            {(id, d) => <Input id={id} describedBy={d} value={display} onChange={setDisplay} invalid={!!fields.display_name} />}
          </Field>
          <div className="md:col-span-2">
            <Field label="Адрес" error={fields.address}>
              {(id, d) => <Input id={id} describedBy={d} value={address} onChange={setAddress} placeholder="г. Алматы, ул. Абая 150" invalid={!!fields.address} />}
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4 md:col-span-2">
            <Field label="Подъездов" error={fields.entrance_count}>
              {(id, d) => <Input id={id} describedBy={d} value={entrances} onChange={(v) => setEntrances(num(v))} inputMode="numeric" className="nums" />}
            </Field>
            <Field label="Квартир" error={fields.unit_count}>
              {(id, d) => <Input id={id} describedBy={d} value={units} onChange={(v) => setUnits(num(v))} inputMode="numeric" className="nums" />}
            </Field>
            <Field label="Этажей" hint="Необязательно">
              {(id, d) => <Input id={id} describedBy={d} value={floors} onChange={(v) => setFloors(num(v))} inputMode="numeric" className="nums" />}
            </Field>
          </div>
          <p className="text-[13.5px] text-ink-2 md:col-span-2">Площади помещений здесь не вводятся: их знает председатель из техпаспорта. Пока площадей нет, голосования в доме недоступны.</p>
          <div className="flex flex-col gap-3 md:col-span-2">
            <ErrorNote>{create.error && !Object.keys(fields).length ? create.error.message : null}</ErrorNote>
            <div className="flex gap-2">
              <Btn type="submit" loading={create.isPending} disabled={!org || address.length < 5 || display.length < 2 || !entrances || !units}>Создать дом</Btn>
              <Btn variant="soft" onClick={onClose}>Отмена</Btn>
            </div>
          </div>
        </form>
      </Card>
    </motion.div>
  )
}

function ChairmanState({ h }: { h: HouseRow }) {
  if (!h.chairman) return <Tag tone="warn">Не назначен</Tag>
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="text-[14px] text-ink">{h.chairman.full_name}</span>
      {!h.chairman.activated && <span className="text-[12.5px] text-warning">ждём пароль и 2FA</span>}
    </span>
  )
}

export function Houses() {
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['admin', 'houses'], queryFn: () => api<HouseRow[]>('/admin/houses') })

  return (
    <>
      <PageHead
        title="Дома"
        sub="Подключение домов: помещения, председатель, готовность к голосованиям"
        actions={!creating && <Btn icon={Plus} onClick={() => setCreating(true)}>Добавить дом</Btn>}
      />
      <AnimatePresence>{creating && <CreateHouse onClose={() => setCreating(false)} />}</AnimatePresence>
      <Card>
        {q.isPending && <Skeleton rows={4} />}
        {q.isError && <ErrorNote>{q.error.message}</ErrorNote>}
        {q.data?.length === 0 && (
          <Empty icon={Building} title="Домов пока нет" text="Сначала заведите организацию, затем добавьте дом и назначьте председателя." />
        )}
        {q.data && q.data.length > 0 && (
          <Table cols={[{ label: 'Дом' }, { label: 'Организация' }, { label: 'Помещения' }, { label: 'Голосования' }, { label: 'Председатель', right: true }]}>
            {q.data.map((h) => (
              <Row key={h.id} onClick={() => navigate(`/admin/houses/${h.id}`)}>
                <Td><Cell title={h.display_name} sub={h.address} /></Td>
                <Td className="text-ink-2">{h.organization_name}</Td>
                <Td><span className="nums">{h.units_total}</span> · {h.entrance_count} подъезд.</Td>
                <Td>{h.is_voting_ready ? <Tag tone="brand">Доступны</Tag> : <Tag tone="mute">Нет площадей</Tag>}</Td>
                <Td right><ChairmanState h={h} /></Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}
