import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, FileText, Image, Paperclip, TriangleAlert } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DocumentKind, type TransactionView } from '@ortaq/shared'
import { api } from '../../shared/api/client'
import { ACCEPT_ATTR, openFile, uploadFile } from '../../shared/api/upload'
import { cn, ease, formatDate, formatDateTime } from '../../shared/lib/cn'
import { Btn, ErrorNote, Input, Select, Tag } from '../../shared/ui/kit'
import { ACCOUNT_TYPE, DOC_KIND, MISSING_DOC, money, TX_STATUS } from '../labels'

/**
 * Строка журнала с раскрытием: документы, проведение, аннулирование. Правила прав повторяют
 * сервер (проводит и аннулирует председатель; бухгалтер снимает только свой черновик), но
 * решает всё равно сервер — интерфейс лишь не предлагает заведомо запрещённое.
 */
export function TxRow({ houseId, tx, role, userId }: { houseId: string; tx: TransactionView; role: 'CHAIRMAN' | 'ACCOUNTANT'; userId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [kind, setKind] = useState<DocumentKind>(tx.missing_documents[0] ?? 'OTHER')
  const [removing, setRemoving] = useState<string | null>(null)
  const chairman = role === 'CHAIRMAN'
  const base = `/houses/${houseId}/transactions/${tx.id}`
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['house', houseId, 'transactions'] }), qc.invalidateQueries({ queryKey: ['house', houseId, 'accounts'] })])

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) => api<TransactionView>(`${base}/${path}`, { method: 'POST', body }),
    onSuccess: async () => { setVoiding(false); setReason(''); setRemoving(null); await refresh() },
  })
  const attach = useMutation({
    mutationFn: async (file: File) => {
      const f = await uploadFile(houseId, file, 'FINANCE_DOCUMENT')
      return api<TransactionView>(`${base}/documents`, { method: 'POST', body: { file_id: f.id, kind } })
    },
    onSuccess: refresh,
  })
  const view = useMutation({ mutationFn: (fileId: string) => openFile(houseId, fileId) })

  const sign = tx.direction === 'IN' ? '+' : '−'
  const voided = tx.status === 'VOIDED'
  const canVoid = !voided && (chairman || (tx.status === 'DRAFT' && tx.created_by?.id === userId))
  const canRemove = tx.status === 'DRAFT' || chairman

  return (
    <li className="rounded-[18px] bg-surface-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-4 rounded-[18px] px-4 py-3.5 text-left transition-colors hover:bg-surface-3 sm:px-5">
        <span className="w-10 shrink-0 text-[13px] tabular-nums text-ink-3">№{tx.number}</span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px] font-medium text-ink', voided && 'text-ink-3 line-through')}>{tx.description}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
            {tx.category.code} {tx.category.short_name} · {formatDate(tx.occurred_on)}{tx.contractor ? ` · ${tx.contractor.name}` : tx.counterparty ? ` · ${tx.counterparty}` : ''}
          </span>
        </span>
        <span className="hidden flex-wrap justify-end gap-1.5 sm:flex">
          {tx.status !== 'CONFIRMED' && <Tag tone={tx.status === 'DRAFT' ? 'warn' : 'mute'}>{TX_STATUS[tx.status]}</Tag>}
          {tx.missing_documents.length > 0 && <Tag tone="warn" icon={TriangleAlert}>нет документов</Tag>}
        </span>
        <span className={cn('shrink-0 text-right text-[15px] font-semibold tabular-nums', tx.direction === 'IN' ? 'text-brand-700' : 'text-ink', voided && 'text-ink-3 line-through')}>
          {sign}{money(tx.amount)}
        </span>
        <ChevronDown size={17} className={cn('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden">
            <div className="flex flex-col gap-4 px-4 pb-4 sm:px-5">
              <dl className="grid gap-x-6 gap-y-2 rounded-[15px] bg-surface p-4 text-[13.5px] sm:grid-cols-2">
                <div><dt className="text-ink-2">Строка формы</dt><dd className="text-ink">{tx.category.code} — {tx.category.name}</dd></div>
                <div><dt className="text-ink-2">Счёт и период</dt><dd className="text-ink">{ACCOUNT_TYPE[tx.account.type]} · отчёт за {tx.period}</dd></div>
                {tx.created_by && <div><dt className="text-ink-2">Внёс</dt><dd className="text-ink">{tx.created_by.name}, {formatDateTime(tx.created_at)}</dd></div>}
                {tx.confirmed_at && <div><dt className="text-ink-2">Проведена</dt><dd className="text-ink">{formatDateTime(tx.confirmed_at)}</dd></div>}
                {tx.void_reason && <div className="sm:col-span-2"><dt className="text-ink-2">Причина аннулирования</dt><dd className="text-ink">{tx.void_reason}</dd></div>}
                {tx.corrects && <div><dt className="text-ink-2">Исправляет</dt><dd className="text-ink">операцию №{tx.corrects.number}</dd></div>}
                {tx.corrected_by && <div><dt className="text-ink-2">Исправлена</dt><dd className="text-ink">операцией №{tx.corrected_by.number}</dd></div>}
              </dl>

              <div className="flex flex-col gap-2">
                {tx.documents.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-[15px] bg-surface p-2 pl-4">
                    {d.mime_type === 'application/pdf' ? <FileText size={17} className="text-ink-2" /> : <Image size={17} className="text-ink-2" />}
                    <button type="button" onClick={() => view.mutate(d.file_id)} className="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-brand-700 hover:underline">{DOC_KIND[d.kind]}</button>
                    {canRemove && !voided && (removing === d.id ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {tx.status !== 'DRAFT' && <span className="w-56"><Input value={reason} onChange={setReason} placeholder="Почему изымаете" /></span>}
                        <Btn variant="soft" loading={act.isPending} disabled={tx.status !== 'DRAFT' && reason.trim().length < 5}
                          onClick={() => act.mutate({ path: `documents/${d.id}/remove`, body: tx.status === 'DRAFT' ? {} : { reason } })}>Изъять</Btn>
                        <Btn variant="ghost" onClick={() => setRemoving(null)}>Отмена</Btn>
                      </span>
                    ) : <Btn variant="ghost" onClick={() => { setRemoving(d.id); setReason('') }}>Изъять</Btn>)}
                  </div>
                ))}
                {tx.missing_documents.length > 0 && (
                  <p className="flex items-start gap-2 rounded-[15px] bg-warning-soft px-4 py-3 text-[13.5px] text-warning">
                    <TriangleAlert size={16} className="mt-px shrink-0" /> Для отчёта не хватает: {tx.missing_documents.map((k) => MISSING_DOC[k]).join(', ')}
                  </p>
                )}
                {!voided && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-56"><Select value={kind} onChange={(k) => setKind(k as DocumentKind)} options={DocumentKind.map((k) => ({ v: k, label: DOC_KIND[k] ?? k }))} /></span>
                    <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-surface px-4 text-[14px] font-semibold text-ink focus-within:ring-[3px] focus-within:ring-brand-100 hover:bg-surface-3">
                      <Paperclip size={16} /> {attach.isPending ? 'Загружаем…' : 'Приложить'}
                      <input type="file" accept={ACCEPT_ATTR} className="sr-only" disabled={attach.isPending}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) attach.mutate(f) }} />
                    </label>
                  </div>
                )}
              </div>

              {voiding ? (
                <div className="flex flex-col gap-2 rounded-[15px] bg-surface p-3">
                  <Input value={reason} onChange={setReason} placeholder="Причина: её увидят жильцы" autoFocus />
                  <div className="flex flex-wrap gap-2">
                    <Btn variant="soft" loading={act.isPending && act.variables?.path === 'void'} disabled={reason.trim().length < 5} onClick={() => act.mutate({ path: 'void', body: { reason } })}>
                      {tx.status === 'DRAFT' ? 'Снять черновик' : 'Аннулировать'}
                    </Btn>
                    <Btn variant="ghost" onClick={() => setVoiding(false)}>Отмена</Btn>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {chairman && tx.status === 'DRAFT' && (
                    <Btn loading={act.isPending && act.variables?.path === 'confirm'} onClick={() => act.mutate({ path: 'confirm', body: { revision: tx.revision } })}>Провести</Btn>
                  )}
                  {canVoid && <Btn variant="soft" onClick={() => { setVoiding(true); setReason('') }}>{tx.status === 'DRAFT' ? 'Снять черновик' : 'Аннулировать'}</Btn>}
                </div>
              )}
              <ErrorNote>{(act.error ?? attach.error ?? view.error)?.message}</ErrorNote>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}
