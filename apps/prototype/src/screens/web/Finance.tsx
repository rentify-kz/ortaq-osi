import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Plus, Download, Users, Receipt, Check, CircleAlert, ArrowDown, Image as ImageIcon } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, HeadBtn, Segmented, Tag, Table, Row, Td, Cell, Money, Empty, type Go } from '../../components/web/ui'
import { Accounts } from './Dashboard'
import { ops, checks as initialChecks, type OpStatus } from '../../data/chairman'
import { fmt } from '../../lib/useCountUp'
import { cn, ease } from '../../lib/cn'

/* ───────────── чеки жильцов ───────────── */

function Checks() {
  const [list, setList] = useState(initialChecks)
  return (
    <Card delay={0.08} lift={false} className="flex flex-col gap-4 xl:col-span-7">
      <CardHead
        title="Чеки жильцов на проверке"
        sub="ИИ распознал сумму и дату. Сверьте с выпиской и подтвердите"
        icon={<Receipt size={18} strokeWidth={2} />}
      />
      {list.length === 0 ? (
        <div className="rounded-[18px] bg-surface-2 px-5 py-8">
          <Empty icon={Check} title="Все чеки проверены" text="Когда жилец оплатит взнос и сфотографирует чек, он появится здесь." />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {list.map((c) => (
              <motion.div
                key={c.flat}
                layout
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.3, ease }}
                className="flex flex-wrap items-center gap-4 rounded-[18px] bg-surface-2 py-3 pl-3 pr-4"
              >
                <button aria-label="Открыть фото чека" className="grid h-14 w-11 shrink-0 place-items-center rounded-[10px] bg-surface-3 text-ink-3 transition-colors hover:bg-brand-50 hover:text-brand-600">
                  <ImageIcon size={18} strokeWidth={1.8} />
                </button>
                <div className="min-w-[150px] flex-1">
                  <p className="text-[15px] font-medium text-ink">кв. {c.flat}, {c.owner}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">{c.what}, {c.when}</p>
                </div>
                <span className="nums font-display text-[16px] font-bold text-ink">{fmt(c.amount)} <span className="text-ink-3">₸</span></span>
                <Btn className="!h-10 !rounded-full" onClick={() => setList((l) => l.filter((x) => x.flat !== c.flat))}>
                  <Check size={15} strokeWidth={2.6} /> Подтвердить
                </Btn>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Card>
  )
}

/* ───────────── операции ───────────── */

const status: Record<OpStatus, ReactNode> = {
  draft: <Tag tone="solid"><span className="size-1.5 rounded-full bg-white" /> Черновик</Tag>,
  missing: <Tag tone="warn" icon={CircleAlert}>Нет акта</Tag>,
  done: <Tag tone="brand" icon={Check}>Проведено</Tag>,
}

function Operations() {
  const [f, setF] = useState<'all' | 'out' | 'in'>('all')
  const [open, setOpen] = useState(false)
  const rows = ops.filter((o) => f === 'all' || (f === 'in' ? o.amount > 0 : o.amount < 0))
  const shown = open ? rows : rows.slice(0, 4)

  return (
    <Card delay={0.22} lift={false} className="!p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[24px] font-extrabold tracking-[-0.03em] text-ink">Операции за сентябрь</h2>
        <Segmented
          id="ops"
          value={f}
          onChange={setF}
          options={[{ v: 'all', label: 'Все' }, { v: 'out', label: 'Расходы' }, { v: 'in', label: 'Поступления' }]}
        />
      </div>

      <div className="mt-4">
        <Table
          cols={[{ label: 'Дата' }, { label: 'Операция' }, { label: 'Получатель' }, { label: 'Сумма', right: true }, { label: 'Статус', right: true }]}
          empty={rows.length === 0 && (
            <Empty icon={Receipt} title="Операций пока нет" text="Сфотографируйте чек, и расход появится здесь." />
          )}
        >
          {shown.map((o, i) => (
            <Row key={o.t} i={i}>
              <Td className="nums whitespace-nowrap text-ink-2">{o.date}</Td>
              <Td><Cell title={o.t} sub={o.sub} /></Td>
              <Td>{o.who}</Td>
              <Td right><Money v={o.amount} sign /></Td>
              <Td right>{status[o.status]}</Td>
            </Row>
          ))}
        </Table>
      </div>

      {rows.length > 4 && (
        <div className="mt-3 flex justify-center">
          <motion.button
            whileTap={{ scale: 0.975 }}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-2 px-5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-3"
          >
            {open ? 'Свернуть' : `Показать все операции (${rows.length})`}
            <ArrowDown size={15} strokeWidth={2.2} className={cn('transition-transform duration-300', open && 'rotate-180')} />
          </motion.button>
        </div>
      )}
    </Card>
  )
}

/* ───────────── экран ───────────── */

export function Finance({ go }: { go: Go }) {
  return (
    <>
      <PageHead
        title="Финансы"
        sub="Сентябрь 2026. Жильцы видят те же цифры без имён должников"
        actions={
          <>
            <HeadBtn icon={Users} onClick={() => go('Должники')}>Должники · 16</HeadBtn>
            <HeadBtn icon={Download}>Выгрузить в XLSX</HeadBtn>
            <Btn className="!rounded-full" onClick={() => go('Новый расход')}><Plus size={16} strokeWidth={2.4} /> Внести расход</Btn>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <Checks />
        <Accounts delay={0.15} className="xl:col-span-5" />
      </div>
      <Operations />
    </>
  )
}
