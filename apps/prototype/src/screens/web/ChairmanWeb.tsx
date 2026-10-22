import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  LayoutGrid, ClipboardList, Wrench, Vote, Wallet, FileText,
  Users, HardHat, Megaphone, FolderOpen, Sparkles, Settings as SettingsIcon, LogOut,
} from 'lucide-react'
import { TopBar } from '../../components/TopBar'
import { Rail } from '../../components/Rail'
import { type Go } from '../../components/web/ui'
import { Dashboard } from './Dashboard'
import { Requests } from './Requests'
import { Tasks } from './Tasks'
import { Votes } from './Votes'
import { Finance } from './Finance'
import { Debtors } from './Debtors'
import { Reports } from './Reports'
import { Residents } from './Residents'
import { Staff } from './Staff'
import { Announcements } from './Announcements'
import { Documents } from './Documents'
import { Assistant } from './Assistant'
import { Settings, Logout } from './Settings'
import { VoteWizard } from './VoteWizard'
import { NewExpense } from './NewExpense'
import { HouseProvider } from './HouseContext'

const nav = [
  { icon: LayoutGrid, label: 'Дашборд' },
  { icon: ClipboardList, label: 'Заявки', badge: 4 },
  { icon: Wrench, label: 'Задачи' },
  { icon: Vote, label: 'Голосования' },
  { icon: Wallet, label: 'Финансы' },
  { icon: FileText, label: 'Отчёты' },
]
const railItems = [
  { icon: Users, label: 'Жильцы', badge: 3 },
  { icon: HardHat, label: 'Персонал' },
  { icon: Megaphone, label: 'Объявления' },
  { icon: FolderOpen, label: 'Документы' },
  { icon: Sparkles, label: 'Помощник' },
]
const railBottom = [
  { icon: SettingsIcon, label: 'Настройки' },
  { icon: LogOut, label: 'Выйти' },
]

/** Вложенные экраны подсвечивают родительский раздел в навигации */
const parent: Record<string, string> = {
  Должники: 'Финансы', 'Новый расход': 'Финансы', 'Новый расход · форма': 'Финансы',
  'Новое голосование': 'Голосования', 'Новое голосование · сроки': 'Голосования',
}

function screen(section: string, go: Go): ReactNode {
  switch (section) {
    case 'Дашборд': return <Dashboard go={go} />
    case 'Заявки': return <Requests />
    case 'Задачи': return <Tasks />
    case 'Голосования': return <Votes go={go} />
    case 'Новое голосование': return <VoteWizard go={go} />
    case 'Новый расход': return <NewExpense go={go} />
    // Состояния глубже первого экрана: открываются только с доски экранов
    case 'Новый расход · форма': return <NewExpense go={go} filled />
    case 'Новое голосование · сроки': return <VoteWizard go={go} preset={{ step: 2, topic: 'Замена лифта во 2 подъезде', kind: 'capital', questions: ['Утвердить замену лифта за счёт капремонта?'] }} />
    case 'Финансы': return <Finance go={go} />
    case 'Должники': return <Debtors go={go} />
    case 'Отчёты': return <Reports />
    case 'Жильцы': return <Residents />
    case 'Персонал': return <Staff />
    case 'Объявления': return <Announcements />
    case 'Документы': return <Documents />
    case 'Помощник': return <Assistant go={go} />
    case 'Настройки': return <Settings />
    case 'Выйти': return <Logout go={go} />
    default: return <Dashboard go={go} />
  }
}

export function ChairmanWeb({ initial = 'Дашборд' }: { initial?: string }) {
  const [section, setSection] = useState(initial)
  const go: Go = (s) => {
    setSection(s)
    window.scrollTo({ top: 0 })
  }
  const active = parent[section] ?? section

  return (
    <HouseProvider>
      <div className="mx-auto max-w-[1520px] px-4 pb-28 pt-3 md:px-6">
        <TopBar items={nav} active={active} onChange={go} />

        <div className="mt-6 flex gap-5">
          <Rail
            top={{ initials: 'АА', label: 'ЖК Асыл Арман, блок 3' }}
            items={railItems}
            bottom={railBottom}
            active={active}
            onChange={go}
          />

          <main className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={section}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="flex flex-col gap-4"
              >
                {screen(section, go)}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </HouseProvider>
  )
}
