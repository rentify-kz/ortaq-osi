import { useState } from 'react'
import { LayoutGroup } from 'motion/react'
import { ListChecks, Mic, Megaphone } from 'lucide-react'
import { TabBar } from '../../components/TabBar'
import { MTasks } from './Tasks'
import { MDelegate } from './Delegate'
import { MNews } from './News'
import { cn } from '../../lib/cn'

/* Мобильный председатель: только реактивная работа на ходу.
   Отчёты, голосования, реестр и финансы остаются в веб-кабинете. */
const tabs = [
  { icon: ListChecks, label: 'Задачи', badge: 4 },
  { icon: Mic, label: 'Поручить' },
  { icon: Megaphone, label: 'Объявления' },
]

export function ChairmanApp({ initial = 0, id, voiceReview }: { initial?: number; id: string; voiceReview?: boolean }) {
  const [tab, setTab] = useState(initial)
  const pane = (i: number) => cn('flex min-h-0 flex-1 flex-col', tab !== i && 'hidden')
  // Отдельная группа: одинаковые layoutId в соседних телефонах витрины не должны перетекать друг в друга
  return (
    <LayoutGroup id={id}>
      {/* Вкладки остаются смонтированными, чтобы не терять состояние при переключении */}
      <div className={pane(0)}><MTasks /></div>
      <div className={pane(1)}><MDelegate review={voiceReview} /></div>
      <div className={pane(2)}><MNews /></div>
      <TabBar tabs={tabs} active={tab} id={id} onChange={setTab} />
    </LayoutGroup>
  )
}
