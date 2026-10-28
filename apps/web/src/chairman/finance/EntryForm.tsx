import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { FileText, Paperclip, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DocumentKind, PAYMENT_PROOF, type AccountView, type BudgetCategoryView, type CreateTransactionBody, type TransactionView } from '@ortaq/shared'
import { api, ApiError } from '../../shared/api/client'
import { ACCEPT_ATTR, uploadFile } from '../../shared/api/upload'
import { cn, ease } from '../../shared/lib/cn'
import { Btn, ErrorNote, Field, fieldCls, Input, Segmented, Select } from '../../shared/ui/kit'
import { ACCOUNT_TYPE, DOC_KIND, MISSING_DOC } from '../labels'

type Contractor = { id: string; name: string }
type Attached = { file_id: string; kind: DocumentKind; name: string }

const todayAlmaty = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)
const parseAmount = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'))

/** Подписи групп в выборе строки: родитель + его подстроки, как в форме отчёта */
function groups(categories: BudgetCategoryView[], section: 'INCOME' | 'EXPENSE') {
  const byCode = new Map(categories.map((c) => [c.code, c]))
  const out = new Map<string, BudgetCategoryView[]>()
  for (const c of categories) {
    if (c.section !== section || !c.is_leaf) continue
    const parent = c.parent_code ? byCode.get(c.parent_code) : undefined
    const label = parent && parent.parent_code ? `${parent.code} ${parent.short_name}` : section === 'INCOME' ? 'Поступления' : 'Прочие расходы'
    out.set(label, [...(out.get(label) ?? []), c])
  }
  return [...out.entries()]
}

/**
 * Внесение операции (docs/06 §6.3). Строка формы обязательна и выбирается из справочника:
 * от неё зависят счёт, получатель и документы для отчёта. Ключ идемпотентности живёт столько же,
 * сколько форма: повторное нажатие после обрыва связи не проведёт расход дважды.
 */
export function EntryForm({ houseId, chairman, accounts, categories, onClose }: {
  houseId: string; chairman: boolean; accounts: AccountView[]; categories: BudgetCategoryView[]; onClose: () => void
}) {
  const qc = useQueryClient()
  const [key] = useState(() => crypto.randomUUID())
  const [direction, setDirection] = useState<'OUT' | 'IN'>('OUT')
  const [code, setCode] = useState('')
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayAlmaty)
  const [period, setPeriod] = useState('')
  const [description, setDescription] = useState('')
  const [contractorId, setContractorId] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [docs, setDocs] = useState<Attached[]>([])
  const contractors = useQuery({ queryKey: ['house', houseId, 'contractors'], queryFn: () => api<Contractor[]>(`/houses/${houseId}/contractors`) })

  const category = categories.find((c) => c.code === code)
  const options = useMemo(() => groups(categories, direction === 'IN' ? 'INCOME' : 'EXPENSE'), [categories, direction])
  const allowed = accounts.filter((a) => !category || category.allowed_accounts.includes(a.type))
  const account = allowed.find((a) => a.id === accountId) ?? (allowed.length === 1 ? allowed[0] : undefined)
  const needs = category && direction === 'OUT'
    ? [...(PAYMENT_PROOF.some((k) => docs.some((d) => d.kind === k)) ? [] : (['RECEIPT'] as DocumentKind[])), ...category.required_documents.filter((k) => !docs.some((d) => d.kind === k))]
    : []

  const upload = useMutation({
    mutationFn: async (files: File[]) => Promise.all(files.map(async (f) => ({ id: (await uploadFile(houseId, f, 'FINANCE_DOCUMENT')).id, name: f.name }))),
    onSuccess: (uploaded) => setDocs((list) => {
      const next = [...list]
      for (const u of uploaded) {
        // Вид по умолчанию — первый ещё не закрытый документ: обычно сначала чек, потом акт
        const have = next.map((d) => d.kind)
        const kind = (!PAYMENT_PROOF.some((k) => have.includes(k)) ? 'RECEIPT' : category?.required_documents.find((k) => !have.includes(k))) ?? 'OTHER'
        next.push({ file_id: u.id, kind, name: u.name })
      }
      return next
    }),
  })

  const save = useMutation({
    mutationFn: (confirm: boolean) => api<TransactionView>(`/houses/${houseId}/transactions`, {
      method: 'POST',
      body: {
        idempotency_key: key, account_id: account?.id ?? '', category_code: code, amount: parseAmount(amount), occurred_on: date,
        period: period || undefined, description, contractor_id: contractorId || null, counterparty: counterparty.trim() || null,
        documents: docs.map(({ file_id, kind }) => ({ file_id, kind })), confirm,
      } satisfies CreateTransactionBody,
    }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['house', houseId, 'transactions'] }), qc.invalidateQueries({ queryKey: ['house', houseId, 'accounts'] })])
      onClose()
    },
  })
  const fields = save.error instanceof ApiError ? save.error.fields : {}
  const ready = !!code && !!account && parseAmount(amount) > 0 && description.trim().length >= 3 && !upload.isPending

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
      <div className="mb-5 flex flex-col gap-4 rounded-[20px] bg-surface-2 p-4 sm:p-5">
        <Segmented id="tx-dir" label="Вид операции" value={direction} onChange={(d) => { setDirection(d); setCode('') }}
          options={[{ v: 'OUT', label: 'Расход' }, { v: 'IN', label: 'Поступление' }]} />

        <Field label="Строка отчёта" hint={category?.name} error={fields.category_code}>
          {(id, describedBy) => (
            <select id={id} aria-describedby={describedBy} value={code} onChange={(e) => setCode(e.target.value)} className={cn(fieldCls, 'h-12 pr-4', !code && 'text-ink-3')}>
              <option value="" disabled>Выберите строку формы</option>
              {options.map(([label, items]) => (
                <optgroup key={label} label={label}>
                  {items.map((c) => <option key={c.code} value={c.code}>{c.code} {c.short_name}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Сумма, ₸" error={fields.amount}>{(id) => <Input id={id} value={amount} onChange={setAmount} inputMode="decimal" placeholder="85 000" />}</Field>
          <Field label="Дата операции" error={fields.occurred_on}>
            {(id) => <input id={id} type="date" value={date} max={todayAlmaty()} onChange={(e) => setDate(e.target.value)} className={cn(fieldCls, 'h-12')} />}
          </Field>
          <Field label="Отчётный месяц" hint="Если отличается от даты" error={fields.period}>
            {(id) => <input id={id} type="month" value={period || date.slice(0, 7)} onChange={(e) => setPeriod(e.target.value)} className={cn(fieldCls, 'h-12')} />}
          </Field>
        </div>

        <Field label="Счёт" error={fields.account_id} hint={category && allowed.length < accounts.length ? 'Для этой строки подходит только этот счёт' : undefined}>
          {(id) => <Select id={id} value={account?.id ?? ''} onChange={setAccountId} placeholder="Выберите счёт"
            options={allowed.map((a) => ({ v: a.id, label: `${ACCOUNT_TYPE[a.type]} · ${a.bank_name}` }))} />}
        </Field>

        <Field label="Назначение платежа" error={fields.description}>{(id) => <Input id={id} value={description} onChange={setDescription} placeholder="Обслуживание лифтов за октябрь" maxLength={500} />}</Field>

        {direction === 'OUT' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={category?.requires_contractor ? 'Подрядчик' : 'Подрядчик, если есть'} error={fields.contractor_id}>
              {(id) => <Select id={id} value={contractorId} onChange={setContractorId}
                options={[{ v: '', label: 'Не из справочника' }, ...(contractors.data ?? []).map((c) => ({ v: c.id, label: c.name }))]} />}
            </Field>
            <Field label="Или получатель" hint={category?.requires_contractor ? 'Наименование печатается в отчёте' : undefined}>
              {(id) => <Input id={id} value={counterparty} onChange={setCounterparty} placeholder="ИП Сейткали, дворник" />}
            </Field>
          </div>
        ) : (
          <Field label="Плательщик, если важно">{(id) => <Input id={id} value={counterparty} onChange={setCounterparty} placeholder="ТОО «Кофейня», аренда 1 этажа" />}</Field>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[13.5px] font-semibold text-ink">Подтверждающие документы</span>
          {docs.map((d, i) => (
            <div key={d.file_id} className="flex flex-wrap items-center gap-2 rounded-[15px] bg-surface p-2 pl-4">
              <FileText size={17} className="shrink-0 text-ink-2" />
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{d.name}</span>
              <span className="w-56 max-w-full"><Select value={d.kind} onChange={(k) => setDocs((l) => l.map((x, j) => (j === i ? { ...x, kind: k as DocumentKind } : x)))}
                options={DocumentKind.map((k) => ({ v: k, label: DOC_KIND[k] ?? k }))} /></span>
              <button type="button" aria-label="Убрать документ" onClick={() => setDocs((l) => l.filter((_, j) => j !== i))}
                className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2"><X size={17} /></button>
            </div>
          ))}
          <label className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-full bg-surface px-4 text-[14px] font-semibold text-ink focus-within:ring-[3px] focus-within:ring-brand-100 hover:bg-surface-3">
            <Paperclip size={16} /> {upload.isPending ? 'Загружаем…' : 'Приложить фото или PDF'}
            <input type="file" multiple accept={ACCEPT_ATTR} className="sr-only" disabled={upload.isPending}
              onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) upload.mutate(files) }} />
          </label>
          {needs.length > 0 && (
            <p className="text-[13px] text-ink-2">Для отчёта понадобятся: {needs.map((k) => MISSING_DOC[k] ?? k).join(', ')}. Провести можно и сейчас — документы приложите позже.</p>
          )}
        </div>

        <ErrorNote>{upload.error?.message ?? (save.error && !Object.keys(fields).length ? save.error.message : null)}</ErrorNote>
        <div className="flex flex-wrap gap-2">
          {chairman && <Btn loading={save.isPending && save.variables === true} disabled={!ready} onClick={() => save.mutate(true)}>Провести</Btn>}
          <Btn variant={chairman ? 'soft' : 'solid'} loading={save.isPending && save.variables === false} disabled={!ready} onClick={() => save.mutate(false)}>
            {chairman ? 'Сохранить черновиком' : 'Передать на проведение'}
          </Btn>
          <Btn variant="ghost" onClick={onClose}>Отмена</Btn>
        </div>
      </div>
    </motion.div>
  )
}
