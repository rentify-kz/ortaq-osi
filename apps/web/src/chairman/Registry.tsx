import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, FileSpreadsheet, ShieldCheck, TriangleAlert, Upload, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import type { ApplyRegistryBody, RegistryPreview } from '@ortaq/shared'
import { api, ApiError } from '../shared/api/client'
import { cn, ease, formatDateTime, plural } from '../shared/lib/cn'
import { Btn, Card, CardHead, ErrorNote, PageHead, Segmented, Skeleton, Tag } from '../shared/ui/kit'

type Summary = { uploaded_at: string | null; entries: number; units_covered: number; units_total: number; last_import: RegistryPreview | null }
type Applied = { applied: true; entries: number; areas_updated: number; verified_now: number }
type AreasMode = NonNullable<ApplyRegistryBody['areas']>

/** Отмена подтверждения кодом — не ошибка, её не показываем */
const shownError = (e: Error | null) => (e && !(e instanceof ApiError && e.code === 'STEP_UP_CANCELLED') ? e.message : null)

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'warn' }) {
  return (
    <div className="rounded-[18px] bg-surface-2 px-4 py-3">
      <p className={cn('nums font-display text-[24px] font-bold leading-none', tone === 'warn' && value > 0 ? 'text-warning' : 'text-ink')}>{value}</p>
      <p className="mt-1.5 text-[13px] text-ink-2">{label}</p>
    </div>
  )
}

function PreviewCard({ preview, houseId, onDone }: { preview: RegistryPreview; houseId: string; onDone: (r: Applied | null) => void }) {
  const qc = useQueryClient()
  const [areas, setAreas] = useState<AreasMode>('fill_empty')
  const errors = preview.issues.filter((i) => i.severity === 'error')
  const warnings = preview.issues.filter((i) => i.severity === 'warning')
  const invalidate = () => Promise.all(['registry', 'readiness', 'units', 'members'].map((k) => qc.invalidateQueries({ queryKey: ['house', houseId, k] })))

  const apply = useMutation({
    mutationFn: () => api<Applied>(`/houses/${houseId}/registry/imports/${preview.import_id}/apply`, { method: 'POST', body: { areas } }),
    onSuccess: async (r) => { await invalidate(); onDone(r) },
  })
  const discard = useMutation({
    mutationFn: () => api(`/houses/${houseId}/registry/imports/${preview.import_id}`, { method: 'DELETE' }),
    onSuccess: async () => { await invalidate(); onDone(null) },
  })

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }}>
      <Card>
        <CardHead icon={FileSpreadsheet} title="Проверьте файл перед загрузкой" sub={`${preview.file_name}. В реестр пока ничего не записано`} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={preview.rows_valid} label={`из ${preview.rows_total} строк без ошибок`} />
          <Stat value={preview.units_covered} label="помещений в реестре" />
          <Stat value={preview.units_missing} label="помещений нет в файле" tone="warn" />
          <Stat value={preview.area_conflicts} label="расхождений площади" tone="warn" />
        </div>

        {preview.sample.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[13.5px] font-semibold text-ink">Первые строки, как мы их поняли</p>
            <ul className="flex flex-col gap-1.5">
              {preview.sample.map((r) => (
                <li key={r.row} className="flex items-center gap-3 rounded-[14px] bg-surface-2 px-4 py-2.5 text-[14px]">
                  <span className="nums w-16 shrink-0 font-semibold text-ink">кв. {r.unit_number}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{r.full_name}</span>
                  <span className="nums shrink-0 text-ink-2">{r.area ? `${r.area} м²` : 'без площади'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-ink-2">ИИН уже заменены хешем: в базе и на этом экране их нет</p>
          </div>
        )}

        {(errors.length > 0 || warnings.length > 0) && (
          <div className="mt-5 flex flex-col gap-2">
            <p className="text-[13.5px] font-semibold text-ink">
              {errors.length > 0 && `${errors.length} ${plural(errors.length, ['строка не загрузится', 'строки не загрузятся', 'строк не загрузятся'])}`}
              {errors.length > 0 && warnings.length > 0 && ' · '}
              {warnings.length > 0 && `${warnings.length} ${plural(warnings.length, ['предупреждение', 'предупреждения', 'предупреждений'])}`}
            </p>
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
              {[...errors, ...warnings].map((i, n) => (
                <li key={`${i.row}-${i.code}-${n}`} className={cn('flex items-start gap-2.5 rounded-[14px] px-4 py-2.5 text-[13.5px]', i.severity === 'error' ? 'bg-danger-soft' : 'bg-warning-soft')}>
                  <span className="nums shrink-0 font-semibold text-ink">стр. {i.row}</span>
                  <span className="text-ink">{i.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <p className="text-[13.5px] font-semibold text-ink">Площади из файла</p>
          <Segmented id="areas-mode" label="Площади из файла" value={areas} onChange={setAreas} options={[
            { v: 'fill_empty', label: 'Заполнить пустые' },
            { v: 'overwrite', label: 'Заменить расхождения' },
            { v: 'skip', label: 'Не трогать' },
          ]} />
          <p className="text-[12.5px] text-ink-2">Площадь — вес голоса. Уже введённые значения меняются только при «Заменить расхождения»</p>
        </div>

        <ErrorNote>{shownError(apply.error ?? discard.error)}</ErrorNote>
        <div className="mt-5 flex flex-wrap gap-2">
          <Btn icon={Check} loading={apply.isPending} disabled={preview.rows_valid === 0} onClick={() => apply.mutate()}>
            Загрузить {preview.rows_valid} {plural(preview.rows_valid, ['строку', 'строки', 'строк'])}
          </Btn>
          <Btn variant="soft" icon={X} loading={discard.isPending} onClick={() => discard.mutate()}>Отменить</Btn>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-2">Новый реестр заменит прежний целиком. Понадобится код из приложения-аутентификатора</p>
      </Card>
    </motion.div>
  )
}

function UploadCard({ houseId, onPreview }: { houseId: string; onPreview: (p: RegistryPreview) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api<RegistryPreview>(`/houses/${houseId}/registry/imports`, { method: 'POST', body: form })
    },
    onSuccess: onPreview,
  })
  return (
    <Card>
      <CardHead icon={Upload} title="Загрузить файл" sub="XLSX или CSV со столбцами: номер помещения, ФИО, ИИН и, если есть, площадь" />
      <input ref={input} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Файл реестра"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }} />
      <ErrorNote>{upload.error?.message}</ErrorNote>
      <Btn icon={Upload} loading={upload.isPending} onClick={() => input.current?.click()} className="mt-1">Выбрать файл</Btn>
      <ul className="mt-5 flex flex-col gap-1.5 text-[13.5px] text-ink-2">
        <li>Строку с названием над таблицей и столбец «№ п/п» можно не удалять</li>
        <li>CSV из Excel в кодировке Windows-1251 тоже подходит</li>
        <li>До загрузки покажем ошибки: несуществующие квартиры, неверные ИИН, дубли</li>
      </ul>
    </Card>
  )
}

export function Registry() {
  const { houseId = '' } = useParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<RegistryPreview | null>(null)
  const [applied, setApplied] = useState<Applied | null>(null)
  const summary = useQuery({ queryKey: ['house', houseId, 'registry'], queryFn: () => api<Summary>(`/houses/${houseId}/registry`) })
  const pending = preview ?? (summary.data?.last_import?.status === 'PREVIEW' ? summary.data.last_import : null)

  return (
    <>
      <PageHead title="Реестр собственников" sub="Эталон для автоматического подтверждения жильцов и источник площадей"
        actions={<Btn variant="soft" icon={ArrowRight} onClick={() => navigate(`/h/${houseId}/areas`)}>Площади вручную</Btn>} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <AnimatePresence mode="wait">
          {pending ? (
            <PreviewCard key={pending.import_id} preview={pending} houseId={houseId} onDone={(r) => { setPreview(null); setApplied(r) }} />
          ) : (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <UploadCard houseId={houseId} onPreview={(p) => { setApplied(null); setPreview(p) }} />
            </motion.div>
          )}
        </AnimatePresence>

        <Card>
          <CardHead icon={ShieldCheck} title="Сейчас в реестре" />
          {summary.isPending && <Skeleton rows={2} />}
          {summary.data && (
            summary.data.uploaded_at ? (
              <div className="flex flex-col gap-3">
                <p className="nums text-[15px] text-ink">
                  {summary.data.entries} {plural(summary.data.entries, ['запись', 'записи', 'записей'])} · {summary.data.units_covered} из {summary.data.units_total} помещений
                </p>
                <p className="text-[13.5px] text-ink-2">Загружен {formatDateTime(summary.data.uploaded_at)}</p>
                {summary.data.units_covered < summary.data.units_total && (
                  <p className="flex items-start gap-2 rounded-[15px] bg-warning-soft px-4 py-3 text-[13.5px] text-ink">
                    <TriangleAlert size={16} strokeWidth={2.2} className="mt-px shrink-0 text-warning" />
                    Жильцов помещений, которых нет в реестре, придётся подтверждать вручную
                  </p>
                )}
              </div>
            ) : <p className="text-[14px] text-ink-2">Реестр ещё не загружен. Без него каждого жильца придётся подтверждать вручную</p>
          )}
          <AnimatePresence>
            {applied && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-4 flex flex-col gap-1 rounded-[18px] bg-brand-50 px-4 py-3 text-[14px] text-brand-800">
                  <p className="font-semibold">Реестр загружен</p>
                  <p className="nums">Площадей обновлено: {applied.areas_updated}</p>
                  {applied.verified_now > 0 && <p className="nums">Сразу подтверждено собственников: {applied.verified_now}</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-4"><Tag tone="mute">ИИН хранится только хешем</Tag></div>
        </Card>
      </div>
    </>
  )
}
