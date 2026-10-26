import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleCheck, FileSignature, FlaskConical, Link2Off } from 'lucide-react'
import { api, ApiError } from '../shared/api/client'
import { formatDateTime } from '../shared/lib/cn'
import { Btn, ErrorNote, Field, Input, Skeleton, Tag } from '../shared/ui/kit'
import { AuthLayout, AuthTitle } from './AuthLayout'

type Procedure = { description: string; document_hash: string; expires_at: string }

/**
 * Заглушка eGov mobile для разработки: сюда ведут QR и deeplink, пока нет договора с SIGEX.
 * Подписывает тестовым сертификатом с введёнными ИИН и ФИО. На сервере маршрут есть только
 * при SIGNATURE_PROVIDER=dev, в production его нет вовсе.
 */
export function DevEgov() {
  const id = window.location.hash.slice(1)
  const [iin, setIin] = useState('')
  const [name, setName] = useState('')
  const q = useQuery({ queryKey: ['dev-egov', id], queryFn: () => api<Procedure>(`/dev/egov/${encodeURIComponent(id)}`), retry: false, enabled: !!id })
  const sign = useMutation({ mutationFn: () => api(`/dev/egov/${encodeURIComponent(id)}/sign`, { method: 'POST', body: { iin, full_name: name } }) })
  const fields = sign.error instanceof ApiError ? sign.error.fields : {}

  return (
    <AuthLayout>
      <Tag tone="warn" icon={FlaskConical}>Тестовый режим: вместо eGov mobile</Tag>
      {sign.isSuccess ? (
        <>
          <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700"><CircleCheck size={22} strokeWidth={2} /></span>
          <AuthTitle title="Документ подписан" sub="Вернитесь в приложение Ortaq и нажмите «Готово»: сервер сам заберёт и проверит подпись." />
        </>
      ) : !id || q.isError ? (
        <>
          <span className="grid size-12 place-items-center rounded-full bg-surface text-ink-2"><Link2Off size={22} strokeWidth={2} /></span>
          <AuthTitle title="Процедура не найдена" sub="Она истекла, уже подписана или сервер перезапускался. Начните подтверждение в приложении заново." />
        </>
      ) : q.isPending ? <Skeleton rows={3} /> : (
        <>
          <span className="grid size-12 place-items-center rounded-full bg-surface text-ink-2"><FileSignature size={22} strokeWidth={2} /></span>
          <AuthTitle title={q.data.description} sub={`Подписать до ${formatDateTime(q.data.expires_at)}. Сервер получит только хеш документа`} />
          <p className="break-all rounded-[15px] bg-surface px-4 py-3 font-mono text-[12.5px] text-ink-2">SHA-256: {q.data.document_hash}</p>
          <Field label="ИИН из тестового сертификата" error={fields.iin}>
            {(fid) => <Input id={fid} value={iin} onChange={(v) => setIin(v.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" className="nums" autoFocus />}
          </Field>
          <Field label="ФИО владельца сертификата" error={fields.full_name}>
            {(fid) => <Input id={fid} value={name} onChange={setName} placeholder="Асанов Данияр Айдарович" />}
          </Field>
          <ErrorNote>{sign.error && !Object.keys(fields).length ? sign.error.message : null}</ErrorNote>
          <Btn size="lg" full icon={FileSignature} loading={sign.isPending} disabled={iin.length !== 12 || name.trim().length < 3} onClick={() => sign.mutate()}>Подписать</Btn>
        </>
      )}
    </AuthLayout>
  )
}
