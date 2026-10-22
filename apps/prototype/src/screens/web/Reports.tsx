import { useState } from 'react'
import { motion } from 'motion/react'
import { Download, Paperclip, Check, PenLine, CircleAlert, Camera, ChevronRight } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, HeadBtn, Tag, GroupLabel } from '../../components/web/ui'
import { report, type ReportLine } from '../../data/chairman'
import { fmt } from '../../lib/useCountUp'
import { cn, ease } from '../../lib/cn'

/* ───────────── тело отчёта ───────────── */

function Lines({ title, total, lines }: { title: string; total: number; lines: ReportLine[] }) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-4 rounded-[14px] bg-surface-2 px-4 py-3">
        <span className="font-display text-[16px] font-bold text-ink">{title}</span>
        <span className="nums font-display text-[18px] font-extrabold tracking-[-0.02em] text-ink">
          {fmt(total)} <span className="text-ink-3">₸</span>
        </span>
      </div>
      {lines.map((l) => (
        // Подстатьи отличаются цветом и размером, без дополнительного отступа
        <div key={l.code} className="flex items-baseline gap-4 px-4 py-2">
          <span className={cn('nums w-12 shrink-0 text-[13px]', l.sub ? 'text-ink-3' : 'text-ink-2')}>{l.code}</span>
          <span className={cn('min-w-0 flex-1', l.sub ? 'text-[13.5px] text-ink-2' : 'text-[14.5px] font-medium text-ink')}>{l.t}</span>
          <span className={cn('nums shrink-0', l.sub ? 'text-[13.5px] text-ink-2' : 'text-[14.5px] font-semibold text-ink')}>{fmt(l.v)}</span>
        </div>
      ))}
    </section>
  )
}

/* ───────────── экран ───────────── */

export function Reports() {
  const [attached, setAttached] = useState<string[]>([])
  const [sent, setSent] = useState(false)
  const left = report.missing.filter((m) => !attached.includes(m.t))
  const income = report.income.reduce((s, l) => s + l.v, 0)
  const expense = report.expense.filter((l) => !l.sub).reduce((s, l) => s + l.v, 0)

  return (
    <>
      <PageHead
        title={<>Отчёт за <span className="text-ink-3">август 2026</span></>}
        sub="Черновик собран автоматически 15 сентября из проведённых операций"
        actions={<HeadBtn icon={Download}>Скачать PDF</HeadBtn>}
      />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        {/* Действия до подписания: сверху справа, на узком экране первыми */}
        <Card delay={0.08} lift={false} className="flex flex-col gap-4 xl:sticky xl:top-[92px] xl:order-2 xl:col-span-4">
          <CardHead
            title="Перед подписанием"
            sub="Сдать до 20 сентября, осталось 4 дня"
            icon={<PenLine size={18} strokeWidth={2} />}
          />

          {report.missing.length > 0 && (
            <div className="flex flex-col gap-2">
              <GroupLabel tone={left.length ? 'warn' : 'mute'}>
                {left.length ? <><CircleAlert size={15} strokeWidth={2.4} /> Без документов: {left.length}</> : <><Check size={15} strokeWidth={2.6} /> Все документы приложены</>}
              </GroupLabel>
              {report.missing.map((m) => {
                const done = attached.includes(m.t)
                return (
                  <motion.div
                    key={m.t}
                    layout
                    transition={{ duration: 0.3, ease }}
                    className={cn('flex items-center gap-3 rounded-[16px] p-3.5', done ? 'bg-brand-50' : 'bg-warning-soft')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-ink">{m.t}, {fmt(m.v)} ₸</p>
                      <p className={cn('text-[12.5px]', done ? 'text-brand-700' : 'text-warning')}>
                        {done ? `${m.doc} приложен` : `нет ${m.doc}а, операция от ${m.date}`}
                      </p>
                    </div>
                    {done
                      ? <Check size={18} strokeWidth={2.6} className="text-brand-600" />
                      : (
                        <button
                          onClick={() => setAttached((a) => [...a, m.t])}
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-brand-600 hover:text-white"
                        >
                          <Paperclip size={13} strokeWidth={2.4} /> Приложить
                        </button>
                      )}
                  </motion.div>
                )
              })}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            {sent
              ? <Tag tone="brand" icon={Check}>Отправлен на подпись бухгалтеру</Tag>
              : (
                <Btn full disabled={left.length > 0} onClick={() => setSent(true)}>
                  <PenLine size={15} strokeWidth={2.2} /> Подписать и опубликовать
                </Btn>
              )}
            {/* Ошибка объясняет, что делать */}
            <p className="text-[13px] leading-snug text-ink-2">
              {left.length > 0
                ? `Приложите ${left.length === 1 ? 'документ' : `${left.length} документа`}: отчёт без подтверждений не примут на проверке.`
                : 'Отчёт подписывают председатель и бухгалтер через eGov mobile, затем его увидят жильцы.'}
            </p>
          </div>
        </Card>

        <Card delay={0.15} lift={false} className="flex flex-col gap-5 !p-6 xl:order-1 xl:col-span-8">
          <Lines title="Поступления" total={income} lines={report.income} />
          <Lines title="Расходы" total={expense} lines={report.expense} />

          <button className="flex items-center gap-3 rounded-[16px] bg-surface-2 p-4 text-left transition-colors hover:bg-surface-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink-2"><Camera size={18} strokeWidth={2} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">Выполненные работы: {report.works}</span>
              <span className="block text-[13px] text-ink-2">с фото из подтверждённых задач</span>
            </span>
            <ChevronRight size={18} strokeWidth={2.2} className="text-ink-3" />
          </button>
        </Card>
      </div>
    </>
  )
}
