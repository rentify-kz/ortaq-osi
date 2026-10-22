import { useState } from 'react'
import { Plus, Send, Timer, CircleAlert, Check, PenLine, EyeOff } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { Quorum } from '../../components/Charts'
import { PageHead, Tag, Table, Row, Td, Cell, Num, type Tone, type Go } from '../../components/web/ui'
import { activeVote as v, pastVotes, type PastVote } from '../../data/chairman'

const result: Record<PastVote['result'], { label: string; tone: Tone }> = {
  accepted: { label: 'Принято', tone: 'brand' },
  rejected: { label: 'Не принято', tone: 'mute' },
  failed: { label: 'Не состоялось', tone: 'warn' },
}

function Active() {
  const [reminded, setReminded] = useState(false)
  const missing = v.total - v.voted
  return (
    <Card delay={0.08} lift={false} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="brand"><span className="size-1.5 rounded-full bg-brand-500" /> идёт</Tag>
            <span className="text-[13.5px] text-ink-2">{v.kind}</span>
          </div>
          <h2 className="mt-3 font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{v.title}</h2>
        </div>

        <div>
          <div className="flex items-end justify-between gap-4">
            <span className="text-[14px] font-medium text-ink-2">Явка по площади</span>
            <span className="nums font-display text-[40px] font-extrabold leading-none tracking-[-0.04em] text-ink">
              <Num to={v.turnout} decimals={1} /><span className="text-[24px] text-ink-3">%</span>
            </span>
          </div>
          <div className="mt-3"><Quorum value={v.turnout} need={v.need} /></div>
          <p className="nums text-[14px] text-ink-2">Проголосовали {v.voted} из {v.total} помещений</p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3 rounded-[16px] bg-surface-2 p-4">
          <Timer size={18} strokeWidth={2} className="shrink-0 text-ink-2" />
          <div>
            <p className="text-[14px] font-semibold text-ink">Осталось {v.left}</p>
            <p className="text-[12.5px] text-ink-2">закроется автоматически {v.ends}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-[16px] bg-warning-soft p-4 text-[13.5px] leading-snug text-ink">
          <CircleAlert size={18} strokeWidth={2.2} className="shrink-0 text-warning" />
          Кворум пока не набран: не хватает 7,7% площади.
        </div>
        <div className="flex items-start gap-3 rounded-[16px] bg-surface-2 p-4 text-[13.5px] leading-snug text-ink-2">
          <EyeOff size={18} strokeWidth={2} className="shrink-0" />
          Как голосуют, видно только после закрытия. Так никто не сможет напоминать выборочно.
        </div>
        <Btn full className="mt-auto" disabled={reminded} onClick={() => setReminded(true)}>
          {reminded
            ? <><Check size={16} strokeWidth={2.6} /> Напоминание отправлено</>
            : <><Send size={15} strokeWidth={2.2} /> Напомнить {missing} собственникам</>}
        </Btn>
      </div>
    </Card>
  )
}

export function Votes({ go }: { go: Go }) {
  const [signed, setSigned] = useState<string[]>([])
  return (
    <>
      <PageHead
        title="Голосования"
        sub="Одно идёт, один протокол ждёт подписи"
        actions={<Btn className="!rounded-full" onClick={() => go('Новое голосование')}><Plus size={16} strokeWidth={2.4} /> Новое голосование</Btn>}
      />

      <Active />

      <Card delay={0.15} lift={false} className="!p-6">
        <CardHead title="Завершённые" sub="Протоколы подписываются через eGov mobile и публикуются жильцам" />
        <div className="mt-4">
          <Table cols={[{ label: 'Вопрос' }, { label: 'Кворум' }, { label: 'Результат' }, { label: 'Протокол', right: true }]}>
            {pastVotes.map((p, i) => {
              const isSigned = p.protocol === 'signed' || signed.includes(p.title)
              return (
                <Row key={p.title} i={i}>
                  <Td><Cell title={p.title} sub={`закрыто ${p.date}`} /></Td>
                  <Td className="nums">{String(p.quorum).replace('.', ',')}%</Td>
                  <Td><Tag tone={result[p.result].tone}>{result[p.result].label}</Tag></Td>
                  <Td right>
                    {isSigned
                      ? <Tag tone="brand" icon={Check}>Подписан</Tag>
                      : (
                        <Btn className="!h-9 !rounded-full !px-3.5 !text-[13px]" onClick={() => setSigned((s) => [...s, p.title])}>
                          <PenLine size={14} strokeWidth={2.2} /> Подписать ЭЦП
                        </Btn>
                      )}
                  </Td>
                </Row>
              )
            })}
          </Table>
        </div>
      </Card>
    </>
  )
}
