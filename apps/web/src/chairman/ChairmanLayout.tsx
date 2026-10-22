import { Outlet, useParams } from 'react-router'
import { ClipboardCheck, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { MeResponse } from '@ortaq/shared'
import { api } from '../shared/api/client'
import { Shell } from '../shared/ui/Shell'

type JoinRequestLite = { id: string }

export function ChairmanLayout({ me }: { me: MeResponse }) {
  const { houseId = '' } = useParams()
  const membership = me.memberships.find((m) => m.house_id === houseId)
  // Счётчик на вкладке: заявки на вступление ждут решения председателя
  const pending = useQuery({
    queryKey: ['house', houseId, 'join-requests', 'PENDING'],
    queryFn: () => api<JoinRequestLite[]>(`/houses/${houseId}/join-requests?status=PENDING`),
    enabled: membership?.role === 'CHAIRMAN',
  })

  return (
    <Shell
      id="chairman"
      caption={membership?.house_display_name ?? ''}
      user={{ name: me.full_name, role: membership?.role === 'ACCOUNTANT' ? 'бухгалтер' : 'председатель' }}
      items={[
        { to: `/h/${houseId}`, label: 'Подготовка', icon: ClipboardCheck, end: true },
        { to: `/h/${houseId}/residents`, label: 'Жильцы', icon: Users, badge: pending.data?.length },
      ]}
    >
      <Outlet />
    </Shell>
  )
}
