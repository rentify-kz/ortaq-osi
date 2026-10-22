import { LayoutGroup } from 'motion/react'
import { House, ClipboardList, Wallet, MoreHorizontal } from 'lucide-react'
import { TabBar } from '../../components/TabBar'
import { ResidentProvider, useResident, type Tab, type Views, type Vote } from './state'
import { RHome } from './Home'
import { RRequests } from './Requests'
import { RFinance } from './Finance'
import { RMore } from './More'
import { cn } from '../../lib/cn'

function Shell({ id }: { id: string }) {
  const { tab, go, charges, vote } = useResident()
  // Бейдж на «Главной»: сколько действий ждёт жильца
  const actions = (charges.some((c) => c.status !== 'checking') ? 1 : 0) + (vote ? 0 : 1)
  const tabs = [
    { icon: House, label: 'Главная', badge: actions || undefined },
    { icon: ClipboardList, label: 'Заявки' },
    { icon: Wallet, label: 'Финансы' },
    { icon: MoreHorizontal, label: 'Ещё' },
  ]
  // Вкладки остаются смонтированными, чтобы не терять состояние при переключении
  const pane = (i: Tab) => cn('flex min-h-0 flex-1 flex-col', tab !== i && 'hidden')
  return (
    <>
      <div className={pane(0)}><RHome /></div>
      <div className={pane(1)}><RRequests /></div>
      <div className={pane(2)}><RFinance /></div>
      <div className={pane(3)}><RMore /></div>
      <TabBar tabs={tabs} active={tab} id={id} onChange={(i) => go(i as Tab)} />
    </>
  )
}

export function ResidentApp({ initialTab = 0, initialViews, initialVote, id }: {
  initialTab?: Tab; initialViews?: Partial<Views>; initialVote?: Vote; id: string
}) {
  return (
    // Отдельная группа: одинаковые layoutId в соседних телефонах витрины не перетекают друг в друга
    <LayoutGroup id={id}>
      <ResidentProvider initialTab={initialTab} initialViews={initialViews} initialVote={initialVote}>
        <Shell id={id} />
      </ResidentProvider>
    </LayoutGroup>
  )
}
