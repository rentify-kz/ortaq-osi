import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AccountType, AccountView, CreateAccountBody } from '@ortaq/shared'
import { api, ApiError } from '../../shared/api/client'
import { cn } from '../../shared/lib/cn'
import { Btn, Card, CardHead, ErrorNote, Field, fieldCls, Input } from '../../shared/ui/kit'
import { ACCOUNT_TYPE } from '../labels'

const HINT: Record<AccountType, string> = {
  CURRENT: 'Сюда поступают взносы на управление; с него оплачиваются текущие расходы',
  SAVINGS: 'Накопления на капремонт: по закону отдельный счёт, тратится по решению собрания',
}

function AccountForm({ houseId, type }: { houseId: string; type: AccountType }) {
  const qc = useQueryClient()
  const [bank, setBank] = useState('')
  const [number, setNumber] = useState('')
  const [opening, setOpening] = useState('')
  const [openedOn, setOpenedOn] = useState(() => `${new Date().toISOString().slice(0, 7)}-01`)
  const save = useMutation({
    mutationFn: () => api<AccountView>(`/houses/${houseId}/accounts`, {
      method: 'POST',
      body: { type, bank_name: bank, account_number: number.trim() || undefined, opening_balance: Number(opening.replace(/\s/g, '').replace(',', '.')) || 0, opened_on: openedOn } satisfies CreateAccountBody,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['house', houseId, 'accounts'] }),
  })
  const fields = save.error instanceof ApiError ? save.error.fields : {}
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4">
      <div>
        <p className="text-[15px] font-semibold text-ink">{ACCOUNT_TYPE[type]}</p>
        <p className="mt-0.5 text-[13px] text-ink-2">{HINT[type]}</p>
      </div>
      <Field label="Банк" error={fields.bank_name}>{(id) => <Input id={id} value={bank} onChange={setBank} placeholder="Halyk Bank" />}</Field>
      <Field label="Номер счёта" hint="Храним только последние 4 цифры" error={fields.account_number}>
        {(id) => <Input id={id} value={number} onChange={setNumber} placeholder="KZ… или 4 последние цифры" />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Остаток, ₸" error={fields.opening_balance}>{(id) => <Input id={id} value={opening} onChange={setOpening} inputMode="decimal" placeholder="0" />}</Field>
        <Field label="На дату" error={fields.opened_on}>
          {(id) => <input id={id} type="date" value={openedOn} onChange={(e) => setOpenedOn(e.target.value)} className={cn(fieldCls, 'h-12')} />}
        </Field>
      </div>
      <ErrorNote>{save.error && !Object.keys(fields).length ? save.error.message : null}</ErrorNote>
      <Btn loading={save.isPending} disabled={bank.trim().length < 2} onClick={() => save.mutate()}>Добавить счёт</Btn>
    </div>
  )
}

/** Первый шаг финансов: два счёта и остатки на дату начала учёта в системе */
export function AccountsSetup({ houseId, existing }: { houseId: string; existing: AccountView[] }) {
  const missing = (['CURRENT', 'SAVINGS'] as const).filter((t) => !existing.some((a) => a.type === t))
  if (missing.length === 0) return null
  return (
    <Card>
      <CardHead icon={Landmark} title="Счета дома" sub="Остаток на дату — основа всех цифр после неё. После первой проведённой операции он не меняется" />
      <div className="grid gap-3 lg:grid-cols-2">{missing.map((t) => <AccountForm key={t} houseId={houseId} type={t} />)}</div>
    </Card>
  )
}
