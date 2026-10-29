import { useRef, useState } from 'react'
import { FilePlus2, ScanLine } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FileView, VoteView } from '@ortaq/shared'
import { api, ApiError } from '../../shared/api/client'
import { ACCEPT_ATTR, uploadFile } from '../../shared/api/upload'
import { cn } from '../../shared/lib/cn'
import { Btn, Card, CardHead, ErrorNote, Field, Input, Select } from '../../shared/ui/kit'

type Unit = { id: string; number: string }

/**
 * Бумажный бюллетень письменного опроса (ст. 43). Скан обязателен; бюллетень попадает в аудит
 * и протокол с отметкой «внесён председателем», а собственник в приложении получает уведомление.
 */
export function PaperBallot({ houseId, vote }: { houseId: string; vote: VoteView }) {
  const qc = useQueryClient()
  const units = useQuery({ queryKey: ['house', houseId, 'units'], queryFn: () => api<Unit[]>(`/houses/${houseId}/units`) })
  const [unit, setUnit] = useState('')
  const [name, setName] = useState('')
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [scan, setScan] = useState<FileView | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useMutation({ mutationFn: (f: File) => uploadFile(houseId, f, 'BALLOT_SCAN'), onSuccess: setScan })
  const save = useMutation({
    mutationFn: () => api<{ unit_number: string }>(`/houses/${houseId}/votes/${vote.id}/paper-ballots`, {
      method: 'POST', body: { unit_id: unit, voter_name: name, scan_file_id: scan!.id, answers: vote.questions.map((q) => ({ question_id: q.id, option_ids: answers[q.id] ?? [] })) },
    }),
    onSuccess: async () => {
      setUnit(''); setName(''); setAnswers({}); setScan(null)
      await qc.invalidateQueries({ queryKey: ['house', houseId, 'vote', vote.id] })
    },
  })
  const fields = save.error instanceof ApiError ? save.error.fields : {}
  const pick = (qid: string, oid: string, multi: boolean, abstain: boolean) => setAnswers((a) => {
    const cur = a[qid] ?? []
    if (!multi) return { ...a, [qid]: [oid] }
    const opts = vote.questions.find((q) => q.id === qid)!.options
    const isAbstain = (id: string) => opts.find((o) => o.id === id)?.kind === 'ABSTAIN'
    const next = cur.includes(oid) ? cur.filter((x) => x !== oid) : abstain ? [oid] : [...cur.filter((x) => !isAbstain(x)), oid]
    return { ...a, [qid]: next }
  })
  const complete = !!unit && name.trim().length >= 5 && !!scan && vote.questions.every((q) => (answers[q.id]?.length ?? 0) > 0)

  return (
    <Card>
      <CardHead icon={FilePlus2} title="Внести бумажный бюллетень" sub="Для собственников без смартфона. Скан обязателен, собственник в приложении получит уведомление" />
      {save.data && <p className="mb-3 text-[14px] text-brand-700">Бюллетень за помещение №{save.data.unit_number} учтён</p>}
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Помещение" error={fields.unit_id}>{(id) => <Select id={id} value={unit} onChange={setUnit} placeholder="Номер" options={(units.data ?? []).map((u) => ({ v: u.id, label: `№${u.number}` }))} />}</Field>
          <Field label="ФИО на бюллетене" error={fields.voter_name}>{(id) => <Input id={id} value={name} onChange={setName} maxLength={200} />}</Field>
        </div>
        {vote.questions.map((q) => (
          <fieldset key={q.id} className="flex flex-col gap-2">
            <legend className="mb-1 text-[14px] font-medium text-ink">{q.order}. {q.text}</legend>
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => {
                const on = (answers[q.id] ?? []).includes(o.id)
                return (
                  <button key={o.id} type="button" aria-pressed={on} onClick={() => pick(q.id, o.id, q.type === 'MULTI_CHOICE', o.kind === 'ABSTAIN')}
                    className={cn('h-10 rounded-full px-4 text-[14px] font-semibold transition-colors', on ? 'bg-brand-600 text-white' : 'bg-surface-2 text-ink hover:bg-surface-3')}>
                    {o.text}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }} />
          <Btn variant="soft" icon={ScanLine} loading={upload.isPending} onClick={() => fileRef.current?.click()}>{scan ? 'Скан загружен — заменить' : 'Загрузить скан'}</Btn>
          <Btn loading={save.isPending} disabled={!complete} onClick={() => save.mutate()}>Учесть бюллетень</Btn>
        </div>
        <ErrorNote>{(upload.error ?? save.error)?.message}</ErrorNote>
      </div>
    </Card>
  )
}
