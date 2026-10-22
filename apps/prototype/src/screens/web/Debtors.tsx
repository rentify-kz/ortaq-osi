import { useState } from 'react'
import { motion } from 'motion/react'
import { Send, Download, Check, Lock, ArrowDown } from 'lucide-react'
import { Card } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, HeadBtn, Segmented, Tag, Table, Row, Td, Cell, Money, type Go } from '../../components/web/ui'
import { debtors, collection } from '../../data/chairman'
import { fmt } from '../../lib/useCountUp'
import { cn, plural } from '../../lib/cn'

type Filter = 'all' | 'long' | 'mid' | 'month'

const match = (months: number, f: Filter) =>
  f === 'all' || (f === 'long' && months >= 3) || (f === 'mid' && months === 2) || (f === 'month' && months === 1)

const VISIBLE = 8

export function Debtors({ go }: { go: Go }) {
  const [f, setF] = useState<Filter>('all')
  const [open, setOpen] = useState(false)
  const [reminded, setReminded] = useState<number[]>([])

  const rows = debtors.filter((d) => match(d.months, f)).sort((a, b) => b.debt - a.debt)
  const shown = open ? rows : rows.slice(0, VISIBLE)
  const count = (x: Filter) => debtors.filter((d) => match(d.months, x)).length
  const remindAll = () => setReminded(debtors.map((d) => d.flat))

  return (
    <>
      <PageHead
        back={{ label: 'Финансы', onClick: () => go('Финансы') }}
        title="Должники"
        sub={`Сентябрь 2026: ${collection.debtors} помещений, к доплате ${fmt(collection.debt)} ₸`}
        actions={
          <>
            <HeadBtn icon={Download}>Выгрузить для юриста</HeadBtn>
            <Btn className="!rounded-full" onClick={remindAll} disabled={reminded.length === debtors.length}>
              {reminded.length === debtors.length
                ? <><Check size={16} strokeWidth={2.6} /> Напоминания отправлены</>
                : <><Send size={15} strokeWidth={2.2} /> Напомнить всем</>}
            </Btn>
          </>
        }
      />

      <Card delay={0.08} lift={false} className="!p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            id="debt"
            value={f}
            onChange={(v) => { setF(v); setOpen(false) }}
            options={[
              { v: 'all', label: 'Все', n: count('all') },
              { v: 'long', label: '3 месяца и больше', n: count('long') },
              { v: 'mid', label: '2 месяца', n: count('mid') },
              { v: 'month', label: 'Только сентябрь', n: count('month') },
            ]}
          />
          <p className="flex items-center gap-2 text-[13.5px] text-ink-2">
            <Lock size={15} strokeWidth={2.2} /> Список видите только вы и бухгалтер
          </p>
        </div>

        <div className="mt-4">
          <Table cols={[{ label: 'Помещение' }, { label: 'Долг', right: true }, { label: 'Просрочка' }, { label: 'Последний платёж' }, { label: '', right: true }]}>
            {shown.map((d, i) => {
              const done = reminded.includes(d.flat)
              return (
                <Row key={d.flat} i={i}>
                  <Td><Cell title={`кв. ${d.flat}`} sub={d.owner} /></Td>
                  <Td right><Money v={d.debt} /></Td>
                  <Td>
                    <Tag tone={d.months >= 3 ? 'warn' : 'mute'}>{d.months} {plural(d.months, ['месяц', 'месяца', 'месяцев'])}</Tag>
                  </Td>
                  <Td className="text-ink-2">{d.last}</Td>
                  <Td right>
                    {done
                      ? <Tag tone="brand" icon={Check}>Напомнили</Tag>
                      : (
                        <button
                          onClick={() => setReminded((r) => [...r, d.flat])}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-brand-600 hover:text-white"
                        >
                          <Send size={13} strokeWidth={2.2} /> Напомнить
                        </button>
                      )}
                  </Td>
                </Row>
              )
            })}
          </Table>
        </div>

        {rows.length > VISIBLE && (
          <div className="mt-3 flex justify-center">
            <motion.button
              whileTap={{ scale: 0.975 }}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-2 px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-3"
            >
              {open ? 'Свернуть' : `Показать всех (${rows.length})`}
              <ArrowDown size={15} strokeWidth={2.2} className={cn('transition-transform duration-300', open && 'rotate-180')} />
            </motion.button>
          </div>
        )}
      </Card>
    </>
  )
}
