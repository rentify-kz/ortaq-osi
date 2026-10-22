import { useState } from 'react'
import { LayoutGroup } from 'motion/react'
import { ListChecks, Megaphone, UserRound } from 'lucide-react'
import { TabBar } from '../../components/TabBar'
import { WTasks, type WView } from './Tasks'
import { WNewsTab } from './News'
import { WProfile } from './Profile'
import { workerNews, workerTasks } from '../../data/worker'
import { cn } from '../../lib/cn'

/* Работник открывает приложение ради одного экрана: что делать сегодня.
   Финансы, жильцы, голосования и чужие заявки ему не показываются. */

const initialUrgent = workerTasks.filter((t) => t.state === 'new').length

export function WorkerApp({ initialTab = 0, initialView, id }: { initialTab?: number; initialView?: WView; id: string }) {
  const [tab, setTab] = useState(initialTab)
  const [unread, setUnread] = useState(workerNews.filter((n) => n.unread).length)
  const [urgent, setUrgent] = useState(initialUrgent)

  const tabs = [
    { icon: ListChecks, label: 'Задачи', badge: urgent || undefined },
    { icon: Megaphone, label: 'Объявления', badge: unread || undefined },
    { icon: UserRound, label: 'Профиль' },
  ]

  // Вкладки остаются смонтированными, чтобы не терять состояние при переключении
  const pane = (i: number) => cn('flex min-h-0 flex-1 flex-col', tab !== i && 'hidden')

  // Отдельная группа: одинаковые layoutId в соседних телефонах витрины не должны перетекать друг в друга
  return (
    <LayoutGroup id={id}>
      <div className={pane(0)}><WTasks initial={initialView} onUrgent={setUrgent} /></div>
      <div className={pane(1)}><WNewsTab onRead={setUnread} /></div>
      <div className={pane(2)}><WProfile /></div>
      <TabBar tabs={tabs} active={tab} id={id} onChange={setTab} />
    </LayoutGroup>
  )
}
