import { Outlet } from 'react-router'
import { Building, Landmark, ScrollText } from 'lucide-react'
import type { MeResponse } from '@ortaq/shared'
import { Shell } from '../shared/ui/Shell'

export function AdminLayout({ me }: { me: MeResponse }) {
  return (
    <Shell
      id="admin"
      caption="Админ-панель"
      user={{ name: me.full_name, role: 'админ платформы' }}
      items={[
        { to: '/admin/houses', label: 'Дома', icon: Building },
        { to: '/admin/organizations', label: 'Организации', icon: Landmark },
        { to: '/admin/audit', label: 'Журнал', icon: ScrollText },
      ]}
    >
      <Outlet />
    </Shell>
  )
}
