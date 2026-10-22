import { useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Landmark, Plus, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isValidIinBin, type CreateOrganizationBody } from '@ortaq/shared'
import { api, ApiError } from '../shared/api/client'
import { ease, plural } from '../shared/lib/cn'
import { Btn, Card, CardHead, Cell, Empty, ErrorNote, Field, Input, PageHead, Row, Segmented, Skeleton, Table, Tag, Td } from '../shared/ui/kit'
import type { Organization } from './types'

function CreateOrganization({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [bin, setBin] = useState('')
  const [form, setForm] = useState<'OSI' | 'PT'>('OSI')
  const [address, setAddress] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (body: CreateOrganizationBody) => api<Organization>('/admin/organizations', { method: 'POST', body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'organizations'] })
      onClose()
    },
    onError: (e) => e instanceof ApiError && setFields(e.fields),
  })

  // БИН проверяем сразу: ошибка в нём всплыла бы только к 20 числу, в шапке отчёта
  const binError = bin.length === 12 && !isValidIinBin(bin) ? 'Контрольный разряд не сходится. Проверьте цифры' : fields.bin

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setFields({})
    create.mutate({ name, bin, management_form: form, legal_address: address })
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease }}>
      <Card>
        <CardHead icon={Landmark} title="Новая организация" sub="ОСИ или простое товарищество: юрлицо, которое управляет домами"
          aside={<button onClick={onClose} aria-label="Закрыть" className="grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"><X size={18} /></button>} />
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <Field label="Наименование" error={fields.name}>
            {(id, d) => <Input id={id} describedBy={d} value={name} onChange={setName} placeholder="ОСИ «Асыл Арман-3»" autoFocus invalid={!!fields.name} />}
          </Field>
          <Field label="БИН" hint="12 цифр, попадает в шапку официального отчёта" error={binError}>
            {(id, d) => <Input id={id} describedBy={d} value={bin} onChange={(v) => setBin(v.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" className="nums" invalid={!!binError} />}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13.5px] font-semibold text-ink">Форма управления</span>
            <Segmented id="org-form" label="Форма управления" value={form} onChange={setForm} options={[{ v: 'OSI', label: 'ОСИ' }, { v: 'PT', label: 'Простое товарищество' }]} />
          </div>
          <Field label="Юридический адрес" error={fields.legal_address}>
            {(id, d) => <Input id={id} describedBy={d} value={address} onChange={setAddress} placeholder="г. Алматы, ..." invalid={!!fields.legal_address} />}
          </Field>
          <div className="flex flex-col gap-3 md:col-span-2">
            <ErrorNote>{create.error && !Object.keys(fields).length ? create.error.message : null}</ErrorNote>
            <div className="flex gap-2">
              <Btn type="submit" loading={create.isPending} disabled={!name || bin.length !== 12 || !!binError || address.length < 5}>Создать</Btn>
              <Btn variant="soft" onClick={onClose}>Отмена</Btn>
            </div>
          </div>
        </form>
      </Card>
    </motion.div>
  )
}

export function Organizations() {
  const [creating, setCreating] = useState(false)
  const q = useQuery({ queryKey: ['admin', 'organizations'], queryFn: () => api<Organization[]>('/admin/organizations') })

  return (
    <>
      <PageHead
        title="Организации"
        sub="Юрлица, управляющие домами. Без БИН дом не сможет сформировать отчёт"
        actions={!creating && <Btn icon={Plus} onClick={() => setCreating(true)}>Добавить организацию</Btn>}
      />
      <AnimatePresence>{creating && <CreateOrganization onClose={() => setCreating(false)} />}</AnimatePresence>
      <Card>
        {q.isPending && <Skeleton rows={4} />}
        {q.isError && <ErrorNote>{q.error.message}</ErrorNote>}
        {q.data?.length === 0 && (
          <Empty icon={Landmark} title="Пока ни одной организации" text="Начните с ОСИ: потом к ней привязываются дома и назначается председатель." />
        )}
        {q.data && q.data.length > 0 && (
          <Table cols={[{ label: 'Организация' }, { label: 'Форма' }, { label: 'Дома' }, { label: 'Статус', right: true }]}>
            {q.data.map((o) => (
              <Row key={o.id}>
                <Td><Cell title={o.name} sub={<span className="nums">БИН {o.bin} · {o.legal_address}</span>} /></Td>
                <Td>{o.management_form === 'OSI' ? 'ОСИ' : 'ПТ'}</Td>
                <Td><span className="nums">{o.house_count ?? 0}</span> {plural(o.house_count ?? 0, ['дом', 'дома', 'домов'])}</Td>
                <Td right>{o.status === 'ACTIVE' ? <Tag tone="brand">Работает</Tag> : <Tag tone="warn">Приостановлена</Tag>}</Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}
