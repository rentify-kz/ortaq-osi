import type { MeResponse } from '@ortaq/shared'

/** Куда вести после входа: админа — в админ-панель, председателя — в его дом */
export function homePath(me: MeResponse): string {
  if (me.is_platform_admin) return '/admin/houses'
  const managed = me.memberships.find((m) => m.role === 'CHAIRMAN' || m.role === 'ACCOUNTANT')
  return managed ? `/h/${managed.house_id}` : '/no-access'
}
