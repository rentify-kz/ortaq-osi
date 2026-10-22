import { useState } from 'react'
import { motion } from 'motion/react'
import { Plus, CircleAlert, Phone, Clock3, Check, Eye, EyeOff, Building2 } from 'lucide-react'
import { Card, CardHead } from '../../components/Card'
import { Btn } from '../../components/Bits'
import { PageHead, Toggle, Tag, Table, Row, Td, Cell } from '../../components/web/ui'
import { staff as initialStaff, contractors as initialContractors } from '../../data/chairman'
import { ease, plural } from '../../lib/cn'

/** Договоры, которые истекают в ближайшие 30 дней */
const EXPIRING_DAYS = 30

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2)
}

export function Staff() {
  const [people, setPeople] = useState(initialStaff)
  const [firms, setFirms] = useState(initialContractors)
  const [renewed, setRenewed] = useState<string[]>([])

  const expiring = firms.filter((c) => c.daysLeft <= EXPIRING_DAYS && !renewed.includes(c.name))
  const setVisible = (name: string, visible: boolean) =>
    setPeople((p) => p.map((s) => (s.name === name ? { ...s, visible } : s)))
  const setFirmVisible = (name: string, visible: boolean) =>
    setFirms((f) => f.map((c) => (c.name === name ? { ...c, visible } : c)))

  return (
    <>
      <PageHead
        title="Персонал и подрядчики"
        sub="Жильцы видят ФИО, должность, рабочий телефон и график. Зарплату и личные данные не видят"
        actions={<Btn className="!rounded-full"><Plus size={16} strokeWidth={2.4} /> Добавить</Btn>}
      />

      {expiring.map((c) => (
        <motion.div
          key={c.name}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-warning-soft py-4 pl-5 pr-4"
        >
          <p className="flex items-start gap-3 text-[15px] leading-snug text-ink">
            <CircleAlert size={20} strokeWidth={2.2} className="mt-px shrink-0 text-warning" />
            <span>
              Договор с {c.name} заканчивается {c.until}, через {c.daysLeft} {plural(c.daysLeft, ['день', 'дня', 'дней'])}
              <span className="block text-[13.5px] text-ink-2">{c.service}. Продлите или найдите замену, чтобы работы не остановились</span>
            </span>
          </p>
          <div className="flex gap-2">
            <Btn variant="ghost" className="!rounded-full !bg-surface hover:!bg-surface-2">Найти замену</Btn>
            <Btn className="!rounded-full" onClick={() => setRenewed((r) => [...r, c.name])}>Продлить договор</Btn>
          </div>
        </motion.div>
      ))}

      <Card delay={0.08} lift={false} className="flex flex-col gap-4">
        <CardHead title="Персонал" sub={`${people.length} ${plural(people.length, ['сотрудник', 'сотрудника', 'сотрудников'])} в штате ОСИ`} />
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {people.map((s) => (
            <article key={s.name} className="flex flex-col gap-4 rounded-[20px] bg-surface-2 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-100 font-display text-[15px] font-bold text-brand-700">
                  {initials(s.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15.5px] font-semibold text-ink">{s.name}</p>
                  <p className="text-[13px] text-ink-2">{s.role}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-[13.5px] text-ink">
                <span className="flex items-center gap-2.5"><Clock3 size={15} strokeWidth={2} className="shrink-0 text-ink-2" /> {s.schedule}</span>
                <span className="nums flex items-center gap-2.5"><Phone size={15} strokeWidth={2} className="shrink-0 text-ink-2" /> {s.phone}</span>
              </div>
              <p className={s.today > 3 ? 'text-[13px] font-semibold text-warning' : 'text-[13px] text-ink-2'}>
                Сегодня {s.today} {plural(s.today, ['задача', 'задачи', 'задач'])}
              </p>
              <div className="mt-auto rounded-[14px] bg-surface px-3">
                <Toggle on={s.visible} onChange={(v) => setVisible(s.name, v)} label="Виден жильцам" />
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card delay={0.15} lift={false} className="flex flex-col gap-4 !p-6">
        <CardHead
          title="Подрядчики"
          sub="Их наименования попадают в отчёт по статье 6.2.1, поэтому справочник ведётся даже без входа в систему"
          icon={<Building2 size={18} strokeWidth={2} />}
        />
        <Table cols={[{ label: 'Организация' }, { label: 'Услуга' }, { label: 'Договор до' }, { label: 'Жильцам', right: true }]}>
          {firms.map((c, i) => {
            const soon = c.daysLeft <= EXPIRING_DAYS && !renewed.includes(c.name)
            return (
              <Row key={c.name} i={i}>
                <Td><Cell title={c.name} sub={`БИН ${c.bin}`} /></Td>
                <Td>{c.service}</Td>
                <Td>
                  {soon
                    ? <Tag tone="warn" icon={CircleAlert}>{c.until}</Tag>
                    : renewed.includes(c.name) ? <Tag tone="brand" icon={Check}>Продлевается</Tag>
                    : <span className="nums">{c.until}</span>}
                </Td>
                <Td right>
                  <button
                    onClick={() => setFirmVisible(c.name, !c.visible)}
                    aria-pressed={c.visible}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3"
                  >
                    {c.visible ? <><Eye size={14} strokeWidth={2.2} /> Виден</> : <><EyeOff size={14} strokeWidth={2.2} /> Скрыт</>}
                  </button>
                </Td>
              </Row>
            )
          })}
        </Table>
      </Card>
    </>
  )
}
