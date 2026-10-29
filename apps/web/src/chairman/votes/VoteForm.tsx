import { useRef, useState } from 'react'
import { Paperclip, Plus, Scale, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import {
  DECISION_LABEL, DECISION_THRESHOLD, DecisionType, THRESHOLD_LABEL,
  type FileView, type QuestionType, type VoteView,
} from '@ortaq/shared'
import { api, ApiError } from '../../shared/api/client'
import { ACCEPT_ATTR, uploadFile } from '../../shared/api/upload'
import { cn } from '../../shared/lib/cn'
import { Btn, Card, CardHead, ErrorNote, Field, fieldCls, Input, PageHead, Segmented, Select, Skeleton } from '../../shared/ui/kit'
import { QUESTION_TYPE } from '../labels'

type Q = { text: string; type: QuestionType; options: string[] }
type Candidate = { user_id: string; name: string; role: string }

/** Ошибки этих полей видны у самих полей; остальные (например, в вариантах вопроса) — общей строкой */
const SHOWN = ['title', 'description', 'decision_type', 'secretary_user_id', 'questions']

const blank = (): Q => ({ text: '', type: 'YES_NO', options: [] })

/**
 * Создание и правка черновика (docs/06 §6.6, шаги 1–2). Порог не выбирается — он следует из
 * типа решения. Сроки задаются при рассылке уведомления, на странице голосования.
 */
export function VoteForm() {
  const { houseId = '', voteId } = useParams()
  const existing = useQuery({ queryKey: ['house', houseId, 'vote', voteId], queryFn: () => api<VoteView>(`/houses/${houseId}/votes/${voteId}`), enabled: !!voteId })
  if (voteId && existing.isPending) return <Skeleton rows={6} />
  if (voteId && !existing.data) return <ErrorNote>{existing.error?.message}</ErrorNote>
  return <Form houseId={houseId} vote={existing.data} />
}

function Form({ houseId, vote }: { houseId: string; vote?: VoteView }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState(vote?.title ?? '')
  const [description, setDescription] = useState(vote?.description ?? '')
  const [decision, setDecision] = useState<DecisionType>(vote?.decision_type ?? 'ROUTINE')
  const [basis, setBasis] = useState<'ART_44_ELECTRONIC' | 'ART_43_WRITTEN_SURVEY'>(vote?.legal_basis === 'ART_43_WRITTEN_SURVEY' ? 'ART_43_WRITTEN_SURVEY' : 'ART_44_ELECTRONIC')
  const [open, setOpen] = useState(vote?.results_visible_during ?? false)
  const [secretary, setSecretary] = useState(vote?.secretary?.user_id ?? '')
  const [questions, setQuestions] = useState<Q[]>(() => vote?.questions.map((q) => ({ text: q.text, type: q.type, options: q.options.filter((o) => o.kind === 'CHOICE').map((o) => o.text) })) ?? [blank()])
  const [materials, setMaterials] = useState<FileView[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const candidates = useQuery({ queryKey: ['house', houseId, 'secretary-candidates'], queryFn: () => api<Candidate[]>(`/houses/${houseId}/votes/secretary-candidates`) })

  const upload = useMutation({ mutationFn: (f: File) => uploadFile(houseId, f, 'VOTE_MATERIAL'), onSuccess: (f) => setMaterials((m) => [...m, f]) })
  const save = useMutation({
    mutationFn: () => {
      const body = {
        title, description: description || null, decision_type: decision, legal_basis: basis, results_visible_during: open,
        secretary_user_id: secretary || null,
        questions: questions.map((q) => ({ text: q.text, type: q.type, ...(q.type !== 'YES_NO' && { options: q.options.filter((o) => o.trim()) }) })),
        material_file_ids: materials.map((m) => m.id),
      }
      return vote
        ? api<VoteView>(`/houses/${houseId}/votes/${vote.id}`, { method: 'PATCH', body })
        : api<VoteView>(`/houses/${houseId}/votes`, { method: 'POST', body })
    },
    onSuccess: async (v) => {
      await qc.invalidateQueries({ queryKey: ['house', houseId, 'votes'] })
      qc.setQueryData(['house', houseId, 'vote', v.id], v)
      navigate(`/h/${houseId}/votes/${v.id}`)
    },
  })
  const fields = save.error instanceof ApiError ? save.error.fields : {}
  const threshold = DECISION_THRESHOLD[decision]
  const setQ = (i: number, patch: Partial<Q>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  // Вопросу с выбором сразу две пустые строки вариантов: без них он бесполезен
  const setType = (i: number, type: QuestionType) => setQ(i, { type, options: type === 'YES_NO' ? [] : questions[i]!.options.length ? questions[i]!.options : ['', ''] })

  return (
    <div className="flex flex-col gap-5">
      <PageHead title={vote ? 'Черновик голосования' : 'Новое голосование'} sub="Повестка, тип решения и секретарь. Сроки — на следующем шаге, при рассылке уведомления"
        back={{ label: 'Голосования', onClick: () => navigate(vote ? `/h/${houseId}/votes/${vote.id}` : `/h/${houseId}/votes`) }} />

      <Card>
        <CardHead title="Тема и тип решения" />
        <div className="flex flex-col gap-4">
          <Field label="Тема" error={fields.title}>{(id, d) => <Input id={id} describedBy={d} value={title} onChange={setTitle} placeholder="Замена лифта во 2 подъезде" maxLength={200} />}</Field>
          <Field label="Пояснение для собственников" hint="Что предлагается, сколько стоит, откуда деньги" error={fields.description}>
            {(id, d) => <textarea id={id} aria-describedby={d} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={4000} className={cn(fieldCls, 'py-3')} />}
          </Field>
          <Field label="Тип решения" error={fields.decision_type}>
            {(id) => <Select id={id} value={decision} onChange={(v) => setDecision(v as DecisionType)} options={DecisionType.map((d) => ({ v: d, label: `${DECISION_LABEL[d]} — ${THRESHOLD_LABEL[DECISION_THRESHOLD[d]]}` }))} />}
          </Field>
          <div className="flex items-start gap-3 rounded-[18px] bg-brand-50 px-4 py-3 text-[14px] text-brand-800">
            <Scale size={18} className="mt-0.5 shrink-0" />
            <span>Требуется {threshold === 'TWO_THIRDS' ? '2/3' : 'больше половины'} голосов от участвующих по площади. Кворум — более 50% площади помещений. Порог задан законом для этого типа решения и вручную не меняется.</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13.5px] font-semibold text-ink">Форма проведения</span>
            <Segmented id="basis" label="Форма проведения" value={basis} onChange={setBasis}
              options={[{ v: 'ART_44_ELECTRONIC', label: 'Электронное (ст. 44)' }, { v: 'ART_43_WRITTEN_SURVEY', label: 'Письменный опрос (ст. 43)' }]} />
            <span className="text-[12.5px] text-ink-2">{basis === 'ART_43_WRITTEN_SURVEY' ? 'Собственники без смартфона голосуют на бумаге: вы вносите их бюллетени со сканом. Остальные — через ЭЦП' : 'Каждый бюллетень подписывается ЭЦП собственника в eGov mobile'}</span>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-[14px] text-ink">
            <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-brand-600)]" />
            <span>Показывать ход голосования всем<span className="block text-[12.5px] text-ink-2">По умолчанию до закрытия видны только явка и кворум — чтобы промежуточный итог не влиял на тех, кто ещё не голосовал</span></span>
          </label>
          <Field label="Секретарь собрания" hint="Подписывает протокол ЭЦП вместе с вами. Только член дома с подтверждённой личностью" error={fields.secretary_user_id}>
            {(id) => <Select id={id} value={secretary} onChange={setSecretary} placeholder="Выберите секретаря" options={(candidates.data ?? []).map((c) => ({ v: c.user_id, label: c.name }))} />}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Повестка" sub="После рассылки уведомления вопросы не меняются" />
        <div className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-ink">Вопрос {i + 1}</span>
                {questions.length > 1 && <Btn variant="ghost" icon={Trash2} onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}>Убрать</Btn>}
              </div>
              <textarea aria-label={`Текст вопроса ${i + 1}`} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} rows={2} maxLength={1000}
                placeholder="Утвердить замену лифта во 2 подъезде за счёт средств капитального ремонта?" className={cn(fieldCls, 'bg-surface py-3')} />
              <Select value={q.type} onChange={(v) => setType(i, v as QuestionType)} options={Object.entries(QUESTION_TYPE).map(([v, label]) => ({ v, label }))} />
              {q.type !== 'YES_NO' && (
                <div className="flex flex-col gap-2">
                  {q.options.map((o, j) => (
                    <div key={j} className="flex gap-2">
                      <Input value={o} onChange={(v) => setQ(i, { options: q.options.map((x, k) => (k === j ? v : x)) })} placeholder={`Вариант ${j + 1}`} maxLength={200} className="bg-surface" />
                      {q.options.length > 2 && <Btn variant="ghost" icon={Trash2} onClick={() => setQ(i, { options: q.options.filter((_, k) => k !== j) })}>Убрать</Btn>}
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-3">
                    <Btn variant="soft" icon={Plus} onClick={() => setQ(i, { options: [...q.options, ''] })}>Вариант</Btn>
                    <span className="text-[12.5px] text-ink-2">«Воздержался» добавится сам</span>
                  </div>
                </div>
              )}
            </div>
          ))}
          {fields.questions && <p className="text-[12.5px] text-danger">{fields.questions}</p>}
          {questions.length < 20 && <Btn variant="soft" icon={Plus} onClick={() => setQuestions((qs) => [...qs, blank()])}>Добавить вопрос</Btn>}
        </div>
      </Card>

      <Card>
        <CardHead icon={Paperclip} title="Материалы" sub="Коммерческие предложения, дефектный акт, смета — PDF или фото. Видны всем членам дома" />
        {vote && vote.materials.length > 0 && <p className="mb-2 text-[13.5px] text-ink-2">Уже приложено: {vote.materials.length}</p>}
        {materials.length > 0 && <ul className="mb-3 flex flex-col gap-1 text-[14px] text-ink">{materials.map((m, i) => <li key={m.id}>Новый файл {i + 1} · {m.mime_type === 'application/pdf' ? 'PDF' : 'фото'}</li>)}</ul>}
        <input ref={fileRef} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }} />
        <Btn variant="soft" icon={Paperclip} loading={upload.isPending} onClick={() => fileRef.current?.click()}>Приложить файл</Btn>
        <ErrorNote>{upload.error?.message}</ErrorNote>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Btn size="lg" loading={save.isPending} onClick={() => save.mutate()}>{vote ? 'Сохранить черновик' : 'Создать черновик'}</Btn>
        <ErrorNote>{save.error && !SHOWN.some((k) => fields[k]) ? save.error.message : null}</ErrorNote>
      </div>
    </div>
  )
}
