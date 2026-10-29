import { Outlet, useParams } from 'react-router'
import { ClipboardCheck, ClipboardList, FileSpreadsheet, ListTodo, Megaphone, Ruler, UserRound, Users, Vote, Wallet } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { MeResponse } from '@ortaq/shared'
import { api } from '../shared/api/client'
import { Shell } from '../shared/ui/Shell'

type JoinRequestLite = { id: string }
type PendingLite = { id: string }

export function ChairmanLayout({ me }: { me: MeResponse }) {
  const { houseId = '' } = useParams()
  const membership = me.memberships.find((m) => m.house_id === houseId)
  // Счётчик на вкладке: заявки на вступление ждут решения председателя
  const pending = useQuery({
    queryKey: ['house', houseId, 'join-requests', 'PENDING'],
    queryFn: () => api<JoinRequestLite[]>(`/houses/${houseId}/join-requests?status=PENDING`),
    enabled: membership?.role === 'CHAIRMAN',
  })
  const ownerships = useQuery({
    queryKey: ['house', houseId, 'ownerships', 'pending'],
    queryFn: () => api<PendingLite[]>(`/houses/${houseId}/ownerships/pending`),
    enabled: membership?.role === 'CHAIRMAN',
  })
  // Счётчик на «Заявках»: новые, которые ждут решения председателя
  const triage = useQuery({
    queryKey: ['house', houseId, 'requests', 'all'],
    queryFn: () => api<{ status: string }[]>(`/houses/${houseId}/requests?status=open`),
    enabled: membership?.role === 'CHAIRMAN',
  })
  const chairman = membership?.role === 'CHAIRMAN'
  const waiting = (pending.data?.length ?? 0) + (ownerships.data?.length ?? 0)
  // Бухгалтер не управляет жильцами, реестром и объявлениями (docs/06 §6.12): лишнего в меню не показываем
  const items = [
    { to: `/h/${houseId}`, label: 'Подготовка', icon: ClipboardCheck, end: true },
    ...(chairman ? [
      { to: `/h/${houseId}/requests`, label: 'Заявки', icon: ClipboardList, badge: triage.data?.filter((r) => r.status === 'TRIAGE').length || undefined },
      { to: `/h/${houseId}/tasks`, label: 'Задачи', icon: ListTodo },
      { to: `/h/${houseId}/residents`, label: 'Жильцы', icon: Users, badge: waiting || undefined },
      { to: `/h/${houseId}/registry`, label: 'Реестр', icon: FileSpreadsheet },
      { to: `/h/${houseId}/areas`, label: 'Площади', icon: Ruler },
      { to: `/h/${houseId}/announcements`, label: 'Объявления', icon: Megaphone },
    ] : []),
    { to: `/h/${houseId}/votes`, label: 'Голосования', icon: Vote },
    { to: `/h/${houseId}/finance`, label: 'Финансы', icon: Wallet },
    { to: `/h/${houseId}/staff`, label: 'Персонал', icon: UserRound },
  ]

  return (
    <Shell
      id="chairman"
      caption={membership?.house_display_name ?? ''}
      user={{ name: me.full_name, role: membership?.role === 'ACCOUNTANT' ? 'бухгалтер' : 'председатель' }}
      items={items}
    >
      <Outlet />
    </Shell>
  )
}
