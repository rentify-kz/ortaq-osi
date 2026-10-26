import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BadgeCheck, Check, Copy, Link2, RefreshCw, ShieldQuestion, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import type { AddMemberBody, CreateInviteBody } from '@ortaq/shared'
import { api, ApiError } from '../shared/api/client'
import { cn, ease, formatDate, plural } from '../shared/lib/cn'
import { Btn, Card, CardHead, Cell, Empty, ErrorNote, Field, Input, PageHead, Row, Segmented, Skeleton, Table, Tag, Td } from '../shared/ui/kit'
import { ROLE_LABELS } from '../admin/types'

type JoinRequest = {
  id: string; full_name: string; phone: string | null; unit_number: string; unit_exists: boolean
  relation: 'OWNER' | 'TENANT'; comment: string | null; created_at: string
}
type Invite = {
  id: string; type: 'PUBLIC_LINK' | 'PERSONAL'; target_role: string; expires_at: string; max_uses: number | null
  use_count: number; status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED'; created_at: string
}
type Issued = Invite & { token: string; url: string }
type PendingOwnership = {
  id: string; full_name: string; phone: string | null; identity_verified: boolean; unit_number: string
  relation: 'OWNER' | 'TENANT'; note: string | null; registry_names: string[]; created_at: string
}
type Member = {
  user_id: string; full_name: string; phone: string | null; role: string; joined_at: string
  units: { number: string; relation: string; verification: string }[]
}

/* ───────── заявки на вступление ───────── */

/** Отмена подтверждения кодом — не ошибка, её не показываем */
const shownError = (e: Error | null) => (e && !(e instanceof ApiError && e.code === 'STEP_UP_CANCELLED') ? e.message : null)

function JoinRequestCard({ r, houseId }: { r: JoinRequest; houseId: string }) {
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const done = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['house', houseId, 'join-requests'] }),
    qc.invalidateQueries({ queryKey: ['house', houseId, 'members'] }),
    qc.invalidateQueries({ queryKey: ['house', houseId, 'readiness'] }),
  ])
  const approve = useMutation({ mutationFn: () => api(`/houses/${houseId}/join-requests/${r.id}/approve`, { method: 'POST' }), onSuccess: done })
  const reject = useMutation({ mutationFn: () => api(`/houses/${houseId}/join-requests/${r.id}/reject`, { method: 'POST', body: { reason } }), onSuccess: done })

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease }}
      className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[15.5px] font-semibold text-ink">{r.full_name}</p>
          <p className="nums text-[13.5px] text-ink-2">{r.phone} · {r.relation === 'OWNER' ? 'собственник' : 'наниматель'} · {formatDate(r.created_at)}</p>
        </div>
        <span className="nums font-display text-[17px] font-bold text-ink">кв. {r.unit_number}</span>
      </div>
      {r.comment && <p className="text-[14px] text-ink">«{r.comment}»</p>}
      {!r.unit_exists && <p className="text-[13.5px] text-warning">Помещения №{r.unit_number} в доме нет: проверьте номер с жильцом</p>}
      <p className="text-[13px] text-ink-2">Сверка с реестром собственников появится после его загрузки. Право голоса — только после подтверждения личности через ЭЦП.</p>
      <ErrorNote>{shownError(approve.error ?? reject.error)}</ErrorNote>
      <AnimatePresence mode="wait" initial={false}>
        {rejecting ? (
          <motion.div key="reject" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
            <Field label="Причина отказа" hint="Жилец её увидит">
              {(id, d) => <Input id={id} describedBy={d} value={reason} onChange={setReason} autoFocus />}
            </Field>
            <div className="flex gap-2">
              <Btn variant="danger" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate()}>Отклонить</Btn>
              <Btn variant="soft" onClick={() => setRejecting(false)}>Назад</Btn>
            </div>
          </motion.div>
        ) : (
          <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2">
            <Btn icon={Check} loading={approve.isPending} disabled={!r.unit_exists} onClick={() => approve.mutate()}>Подтвердить</Btn>
            <Btn variant="soft" icon={X} onClick={() => setRejecting(true)}>Отклонить</Btn>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

function JoinRequests({ houseId }: { houseId: string }) {
  const q = useQuery({ queryKey: ['house', houseId, 'join-requests', 'PENDING'], queryFn: () => api<JoinRequest[]>(`/houses/${houseId}/join-requests?status=PENDING`) })
  return (
    <Card>
      <CardHead icon={UserPlus} title="Заявки на вступление" sub="От тех, кто пришёл без ссылки. Решение за вами: реестр мог устареть после продажи квартиры"
        aside={q.data && q.data.length > 0 ? <span className="nums grid size-8 place-items-center rounded-full bg-warning-soft font-display text-[14px] font-bold text-warning">{q.data.length}</span> : null} />
      {q.isPending && <Skeleton rows={2} />}
      {q.data?.length === 0 && <Empty icon={UserPlus} title="Новых заявок нет" text="Когда жилец попросит вступить без ссылки, заявка появится здесь." />}
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>{q.data?.map((r) => <JoinRequestCard key={r.id} r={r} houseId={houseId} />)}</AnimatePresence>
      </ul>
    </Card>
  )
}

/* ───────── ссылки-приглашения ───────── */

const STATUS: Record<Invite['status'], { label: string; tone: 'brand' | 'mute' | 'warn' }> = {
  ACTIVE: { label: 'Действует', tone: 'brand' },
  REVOKED: { label: 'Отозвана', tone: 'mute' },
  EXPIRED: { label: 'Истекла', tone: 'mute' },
  EXHAUSTED: { label: 'Активации закончились', tone: 'warn' },
}

/** Ссылка показывается один раз: в базе только её хеш */
function IssuedLink({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(issued.url)
    setCopied(true)
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }}
      className="flex flex-col gap-3 rounded-[20px] bg-brand-50 p-4">
      <p className="text-[14px] font-semibold text-brand-800">Скопируйте ссылку сейчас: больше её не покажем</p>
      <p className="break-all rounded-[14px] bg-surface px-4 py-3 font-mono text-[13.5px] text-ink">{issued.url}</p>
      <div className="flex flex-wrap gap-2">
        <Btn icon={copied ? Check : Copy} onClick={() => void copy()}>{copied ? 'Скопировано' : 'Скопировать ссылку'}</Btn>
        <Btn variant="ghost" onClick={onClose}>Готово</Btn>
      </div>
    </motion.div>
  )
}

function Invites({ houseId }: { houseId: string }) {
  const qc = useQueryClient()
  const [type, setType] = useState<'PUBLIC_LINK' | 'PERSONAL'>('PUBLIC_LINK')
  const [days, setDays] = useState('14')
  const [limit, setLimit] = useState('')
  const [issued, setIssued] = useState<Issued | null>(null)
  const q = useQuery({ queryKey: ['house', houseId, 'invites'], queryFn: () => api<Invite[]>(`/houses/${houseId}/invites`) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['house', houseId, 'invites'] })

  const create = useMutation({
    mutationFn: (body: CreateInviteBody) => api<Issued>(`/houses/${houseId}/invites`, { method: 'POST', body }),
    onSuccess: async (i) => { setIssued(i); await refresh() },
  })
  const reissue = useMutation({
    mutationFn: (id: string) => api<Issued>(`/houses/${houseId}/invites/${id}/reissue`, { method: 'POST' }),
    onSuccess: async (i) => { setIssued(i); await refresh() },
  })
  const revoke = useMutation({ mutationFn: (id: string) => api(`/houses/${houseId}/invites/${id}`, { method: 'DELETE' }), onSuccess: refresh })

  const submit = () =>
    create.mutate({
      type,
      target_role: 'RESIDENT',
      expires_in_days: Math.min(90, Math.max(1, Number(days) || 14)),
      max_uses: type === 'PUBLIC_LINK' && limit ? Number(limit) : null,
    })

  return (
    <Card>
      <CardHead icon={Link2} title="Ссылки-приглашения" sub="Ссылка определяет дом. Личность и право голоса подтверждаются отдельно, через eGov" />
      <AnimatePresence mode="wait">
        {issued ? <IssuedLink key="issued" issued={issued} onClose={() => setIssued(null)} /> : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
            <Segmented id="invite-type" label="Тип ссылки" value={type} onChange={setType}
              options={[{ v: 'PUBLIC_LINK', label: 'Для чата дома' }, { v: 'PERSONAL', label: 'Одному человеку' }]} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Срок, дней">
                {(id) => <Input id={id} value={days} onChange={(v) => setDays(v.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className="nums" />}
              </Field>
              {type === 'PUBLIC_LINK' && (
                <Field label="Лимит активаций" hint="Пусто — без лимита">
                  {(id, d) => <Input id={id} describedBy={d} value={limit} onChange={(v) => setLimit(v.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className="nums" />}
                </Field>
              )}
            </div>
            <ErrorNote>{create.error?.message}</ErrorNote>
            <Btn icon={Link2} loading={create.isPending} onClick={submit} className="self-start">Создать ссылку</Btn>
          </motion.div>
        )}
      </AnimatePresence>

      {q.data && q.data.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2">
          {q.data.map((i) => (
            <li key={i.id} className={cn('flex flex-wrap items-center gap-3 rounded-[18px] bg-surface-2 px-4 py-3', i.status !== 'ACTIVE' && 'opacity-70')}>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold text-ink">{i.type === 'PUBLIC_LINK' ? 'Для чата дома' : 'Персональная'}</p>
                <p className="nums text-[13px] text-ink-2">
                  {i.use_count} {plural(i.use_count, ['активация', 'активации', 'активаций'])}{i.max_uses ? ` из ${i.max_uses}` : ''} · до {formatDate(i.expires_at)}
                </p>
              </div>
              <Tag tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Tag>
              {i.status === 'ACTIVE' && (
                <div className="flex gap-1">
                  <Btn variant="ghost" icon={RefreshCw} loading={reissue.isPending && reissue.variables === i.id} onClick={() => reissue.mutate(i.id)}>Перевыпустить</Btn>
                  <Btn variant="ghost" loading={revoke.isPending && revoke.variables === i.id} onClick={() => revoke.mutate(i.id)}>Отозвать</Btn>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ───────── ручное подтверждение собственности ───────── */

function OwnershipCard({ o, houseId }: { o: PendingOwnership; houseId: string }) {
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const done = () => Promise.all(['ownerships', 'members'].map((k) => qc.invalidateQueries({ queryKey: ['house', houseId, k] })))
  const verify = useMutation({ mutationFn: () => api(`/houses/${houseId}/ownerships/${o.id}/verify`, { method: 'POST' }), onSuccess: done })
  const reject = useMutation({ mutationFn: () => api(`/houses/${houseId}/ownerships/${o.id}/reject`, { method: 'POST', body: { reason } }), onSuccess: done })
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease }}
      className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[15.5px] font-semibold text-ink">{o.full_name || 'Имя не указано'}</p>
          <p className="nums text-[13.5px] text-ink-2">{o.phone} · {o.relation === 'OWNER' ? 'собственник' : 'наниматель'}</p>
        </div>
        <span className="nums font-display text-[17px] font-bold text-ink">кв. {o.unit_number}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {o.identity_verified ? <Tag icon={BadgeCheck}>Личность подтверждена ЭЦП</Tag> : <Tag tone="warn">Личность ещё не подтверждена</Tag>}
        {o.note && <Tag tone="mute">{o.note}</Tag>}
      </div>
      <p className="text-[13.5px] text-ink-2">
        {o.registry_names.length > 0 ? `В реестре по этой квартире: ${o.registry_names.join(', ')}` : 'В реестре по этой квартире никого нет'}
      </p>
      <ErrorNote>{shownError(verify.error ?? reject.error)}</ErrorNote>
      <AnimatePresence mode="wait" initial={false}>
        {rejecting ? (
          <motion.div key="reject" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
            <Field label="Причина" hint="Например: квартира продана">
              {(id, d) => <Input id={id} describedBy={d} value={reason} onChange={setReason} autoFocus />}
            </Field>
            <div className="flex gap-2">
              <Btn variant="danger" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate()}>Отклонить</Btn>
              <Btn variant="soft" onClick={() => setRejecting(false)}>Назад</Btn>
            </div>
          </motion.div>
        ) : (
          <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-2">
            <Btn icon={Check} loading={verify.isPending} disabled={!o.identity_verified} onClick={() => verify.mutate()}>Подтвердить собственность</Btn>
            <Btn variant="soft" icon={X} onClick={() => setRejecting(true)}>Отклонить</Btn>
          </motion.div>
        )}
      </AnimatePresence>
      {!o.identity_verified && <p className="text-[12.5px] text-ink-2">Подтвердить можно после того, как жилец подпишет согласие в eGov mobile: голос без идентификации не даётся</p>}
    </motion.li>
  )
}

function ManualReview({ houseId }: { houseId: string }) {
  const q = useQuery({ queryKey: ['house', houseId, 'ownerships', 'pending'], queryFn: () => api<PendingOwnership[]>(`/houses/${houseId}/ownerships/pending`) })
  return (
    <Card>
      <CardHead icon={ShieldQuestion} title="Ждут вашего подтверждения" sub="Нет в реестре или ФИО не совпало с ЭЦП. Вы знаете своих жильцов лучше устаревшего реестра"
        aside={q.data && q.data.length > 0 ? <span className="nums grid size-8 place-items-center rounded-full bg-warning-soft font-display text-[14px] font-bold text-warning">{q.data.length}</span> : null} />
      {q.isPending && <Skeleton rows={2} />}
      {q.data?.length === 0 && <Empty icon={BadgeCheck} title="Очередь пуста" text="Собственники из реестра подтверждаются сами, как только подпишут согласие в eGov." />}
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>{q.data?.map((o) => <OwnershipCard key={o.id} o={o} houseId={houseId} />)}</AnimatePresence>
      </ul>
    </Card>
  )
}

/* ───────── участники ───────── */

const VERIFICATION: Record<string, { label: string; tone: 'brand' | 'warn' | 'mute' }> = {
  VERIFIED: { label: 'собственность подтверждена', tone: 'brand' },
  PENDING: { label: 'ждёт подтверждения', tone: 'warn' },
  REJECTED: { label: 'отклонено', tone: 'mute' },
}

function AddAccountant({ houseId, onClose }: { houseId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const add = useMutation({
    mutationFn: (body: AddMemberBody) => api(`/houses/${houseId}/members`, { method: 'POST', body }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['house', houseId, 'members'] }); onClose() },
  })
  const fields = add.error instanceof ApiError ? add.error.fields : {}
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
      <div className="mb-5 flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4">
        <p className="text-[13.5px] text-ink-2">Бухгалтер получит письмо, задаст пароль и подключит приложение-аутентификатор. Вносит транзакции, но не утверждает их</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ФИО" error={fields.full_name}>{(id) => <Input id={id} value={name} onChange={setName} autoFocus />}</Field>
          <Field label="Почта" error={fields.email}>{(id) => <Input id={id} type="email" value={email} onChange={setEmail} autoComplete="off" />}</Field>
        </div>
        <ErrorNote>{shownError(add.error && !Object.keys(fields).length ? add.error : null)}</ErrorNote>
        <div className="flex gap-2">
          <Btn icon={UserPlus} loading={add.isPending} onClick={() => add.mutate({ role: 'ACCOUNTANT', email, full_name: name })}>Пригласить бухгалтера</Btn>
          <Btn variant="soft" onClick={onClose}>Отмена</Btn>
        </div>
      </div>
    </motion.div>
  )
}

function Members({ houseId }: { houseId: string }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['house', houseId, 'members'], queryFn: () => api<Member[]>(`/houses/${houseId}/members`) })
  const revoke = useMutation({
    mutationFn: (userId: string) => api(`/houses/${houseId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setConfirm(null)
      await Promise.all(['members', 'ownerships', 'readiness'].map((k) => qc.invalidateQueries({ queryKey: ['house', houseId, k] })))
    },
  })
  return (
    <Card>
      <CardHead icon={Users} title="Участники дома" sub="Все, у кого есть доступ к дому, и их помещения"
        aside={!adding && <Btn variant="soft" icon={UserPlus} onClick={() => setAdding(true)}>Бухгалтер</Btn>} />
      <AnimatePresence>{adding && <AddAccountant houseId={houseId} onClose={() => setAdding(false)} />}</AnimatePresence>
      <ErrorNote>{shownError(revoke.error)}</ErrorNote>
      {q.isPending && <Skeleton rows={3} />}
      {q.data && (
        <Table cols={[{ label: 'Человек' }, { label: 'Роль' }, { label: 'Помещения' }, { label: 'С нами', right: true }, { label: '' }]} minW={760}>
          {q.data.map((m) => (
            <Row key={m.user_id}>
              <Td><Cell title={m.full_name || 'Имя не указано'} sub={m.phone ?? undefined} /></Td>
              <Td className="text-ink-2">{ROLE_LABELS[m.role] ?? m.role}</Td>
              <Td>
                {m.units.length === 0 ? <span className="text-ink-3">—</span> : (
                  <span className="flex flex-wrap gap-1.5">
                    {m.units.map((u) => (
                      <Tag key={u.number} tone={VERIFICATION[u.verification]?.tone ?? 'mute'}>кв. {u.number}, {VERIFICATION[u.verification]?.label}</Tag>
                    ))}
                  </span>
                )}
              </Td>
              <Td right className="text-ink-2">{formatDate(m.joined_at)}</Td>
              <Td right>
                {m.role !== 'CHAIRMAN' && (confirm === m.user_id ? (
                  <span className="flex justify-end gap-1">
                    <Btn variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate(m.user_id)}>Отозвать</Btn>
                    <Btn variant="ghost" onClick={() => setConfirm(null)}>Нет</Btn>
                  </span>
                ) : (
                  <Btn variant="ghost" icon={UserMinus} onClick={() => setConfirm(m.user_id)}>Отозвать</Btn>
                ))}
              </Td>
            </Row>
          ))}
        </Table>
      )}
      <p className="mt-3 text-[12.5px] text-ink-2">Отзыв доступа закрывает и право голоса по помещениям. История заявок и платежей остаётся</p>
    </Card>
  )
}

export function Residents() {
  const { houseId = '' } = useParams()
  return (
    <>
      <PageHead title="Жильцы" sub="Приглашения, заявки на вступление, подтверждение собственности и участники дома" />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <JoinRequests houseId={houseId} />
        <Invites houseId={houseId} />
      </div>
      <ManualReview houseId={houseId} />
      <Members houseId={houseId} />
    </>
  )
}
