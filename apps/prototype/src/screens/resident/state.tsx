/* eslint-disable react-refresh/only-export-components -- провайдер, хук и общие части живут вместе */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AppBar } from '../../components/Bits'
import { charges as initialCharges, myRequests, me, type Charge, type ChargeStatus, type RRequest } from '../../data/resident'

/* ───────────── навигация и общее состояние приложения жильца ───────────── */

export type Tab = 0 | 1 | 2 | 3
export type Views = {
  home: 'main' | 'vote'
  req: { name: 'list' } | { name: 'track'; id: number } | { name: 'new' }
  fin: 'house' | 'mine'
  more: 'menu' | 'news' | 'house' | 'profile'
}
export type Vote = { choice: string; at: string }

type Resident = {
  tab: Tab
  views: Views
  /** Переход на вкладку, при необходимости сразу на нужный экран внутри неё */
  go: <K extends keyof Views>(tab: Tab, key?: K, view?: Views[K]) => void
  setView: <K extends keyof Views>(key: K, view: Views[K]) => void
  charges: Charge[]
  setCharge: (id: string, status: ChargeStatus) => void
  vote: Vote | null
  setVote: (v: Vote) => void
  requests: RRequest[]
  addRequest: (r: RRequest) => void
  patchRequest: (id: number, p: Partial<RRequest>) => void
  subscribed: number[]
  subscribe: (id: number) => void
}

const Ctx = createContext<Resident | null>(null)

export function ResidentProvider({ children, initialTab = 0, initialViews, initialVote = null }: {
  children: ReactNode; initialTab?: Tab; initialViews?: Partial<Views>; initialVote?: Vote | null
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [views, setViews] = useState<Views>({ home: 'main', req: { name: 'list' }, fin: 'house', more: 'menu', ...initialViews })
  const [charges, setCharges] = useState(initialCharges)
  const [vote, setVote] = useState<Vote | null>(initialVote)
  const [requests, setRequests] = useState(myRequests)
  const [subscribed, setSubscribed] = useState<number[]>([])

  const value: Resident = {
    tab,
    views,
    go: (t, key, view) => {
      setTab(t)
      if (key && view !== undefined) setViews((v) => ({ ...v, [key]: view }))
    },
    setView: (key, view) => setViews((v) => ({ ...v, [key]: view })),
    charges,
    setCharge: (id, status) => setCharges((l) => l.map((c) => (c.id === id ? { ...c, status } : c))),
    vote,
    setVote,
    requests,
    addRequest: (r) => setRequests((l) => [r, ...l]),
    patchRequest: (id, p) => setRequests((l) => l.map((r) => (r.id === id ? { ...r, ...p } : r))),
    subscribed,
    subscribe: (id) => setSubscribed((s) => (s.includes(id) ? s : [...s, id])),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useResident(): Resident {
  const r = useContext(Ctx)
  if (!r) throw new Error('useResident вызван вне ResidentProvider')
  return r
}

/* ───────────── общие части экранов ───────────── */

/** Шапка вкладки: дом мелко, заголовок крупно, справа номер квартиры или действие */
export function RHead({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <AppBar
      left={
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink-2">Асыл Арман, блок 3</p>
          <h1 className="mt-0.5 font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-ink">{title}</h1>
        </div>
      }
      right={right ?? (
        <span className="shrink-0 rounded-full bg-surface px-3 py-2 font-display text-[13px] font-bold text-brand-700">кв. {me.flat}</span>
      )}
    />
  )
}

export function BackBar({ label, onBack, right }: { label: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-1">
      <button onClick={onBack} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-surface pl-3 pr-4 text-[15px] font-semibold text-ink">
        <ArrowLeft size={18} strokeWidth={2.2} /> {label}
      </button>
      {right}
    </div>
  )
}
