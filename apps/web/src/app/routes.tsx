import type { ReactNode } from 'react'
import { Navigate, Outlet, useParams } from 'react-router'
import { Smartphone } from 'lucide-react'
import type { MeResponse } from '@ortaq/shared'
import { AdminLayout } from '../admin/AdminLayout'
import { AuthLayout, AuthTitle } from '../auth/AuthLayout'
import { homePath } from '../auth/home-path'
import { ChairmanLayout } from '../chairman/ChairmanLayout'
import { useMe, useSignOut } from '../shared/hooks'
import { SignedOutWatcher, StepUpGate } from '../shared/session'
import { Btn, ErrorNote } from '../shared/ui/kit'

/* Корневой каркас и охрана маршрутов. Права проверяет API; здесь лишь не показываем лишнего */

export function Root() {
  return (
    <>
      <SignedOutWatcher />
      <StepUpGate />
      <Outlet />
    </>
  )
}

/** Только для вошедших. Права проверяет API; здесь лишь не показываем лишнего */
function RequireMe({ children }: { children: (me: MeResponse) => ReactNode }) {
  const me = useMe()
  if (me.isPending) return <div className="grid min-h-[100dvh] place-items-center" aria-busy="true"><span className="size-10 animate-pulse rounded-full bg-surface" /></div>
  if (me.isError) return <div className="mx-auto max-w-[480px] p-8"><ErrorNote>{me.error.message}</ErrorNote></div>
  if (!me.data) return <Navigate to="/login" replace />
  return <>{children(me.data)}</>
}

export function HomeRedirect() {
  return <RequireMe>{(me) => <Navigate to={homePath(me)} replace />}</RequireMe>
}

export function AdminRoute() {
  return <RequireMe>{(me) => (me.is_platform_admin ? <AdminLayout me={me} /> : <Navigate to={homePath(me)} replace />)}</RequireMe>
}

export function HouseRoute() {
  const { houseId } = useParams()
  return (
    <RequireMe>
      {(me) => {
        const m = me.memberships.find((x) => x.house_id === houseId)
        return m && (m.role === 'CHAIRMAN' || m.role === 'ACCOUNTANT') ? <ChairmanLayout me={me} /> : <Navigate to={homePath(me)} replace />
      }}
    </RequireMe>
  )
}

/** Жильцы и работники работают в мобильном приложении, веб-кабинет им не нужен */
export function NoAccess() {
  const signOut = useSignOut()
  return (
    <AuthLayout>
      <span className="grid size-12 place-items-center rounded-full bg-surface text-ink-2"><Smartphone size={22} strokeWidth={2} /></span>
      <AuthTitle title="Кабинет для правления дома" sub="Жильцы и работники пользуются мобильным приложением Ortaq. Если вас назначили председателем, вход откроется после письма от администратора." />
      <Btn variant="soft" onClick={() => void signOut()}>Выйти</Btn>
    </AuthLayout>
  )
}
