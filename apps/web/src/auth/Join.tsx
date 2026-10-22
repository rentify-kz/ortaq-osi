import { useQuery } from '@tanstack/react-query'
import { Smartphone, Link2Off } from 'lucide-react'
import { api } from '../shared/api/client'
import { Skeleton } from '../shared/ui/kit'
import { AuthLayout, AuthTitle } from './AuthLayout'

type Resolved = { valid: false } | { valid: true; house_display_name: string; target_role: 'RESIDENT' | 'WORKER' }

/**
 * Переход по ссылке-приглашению. До входа показываем минимум — только название дома,
 * docs/04 §5.2: ссылка лежит в общем чате, и переслать её могли кому угодно.
 */
export function Join() {
  const token = window.location.hash.slice(1)
  const q = useQuery({
    queryKey: ['invite', token],
    queryFn: () => (token ? api<Resolved>(`/invites/resolve/${encodeURIComponent(token)}`) : Promise.resolve<Resolved>({ valid: false })),
    retry: false,
  })

  return (
    <AuthLayout>
      {q.isPending && <Skeleton rows={2} />}
      {q.data?.valid === false && (
        <>
          <span className="grid size-12 place-items-center rounded-full bg-surface text-ink-2"><Link2Off size={22} strokeWidth={2} /></span>
          <AuthTitle title="Ссылка не работает" sub="Её отозвали, у неё истёк срок или закончились активации. Попросите председателя прислать новую." />
        </>
      )}
      {q.data?.valid && (
        <>
          <p className="text-[15px] text-ink-2">Приглашение в дом</p>
          <AuthTitle title={q.data.house_display_name} sub={q.data.target_role === 'WORKER' ? 'Присоединиться как работник' : 'Присоединиться как жилец'} />
          <div className="flex items-start gap-3 rounded-[20px] bg-surface p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Smartphone size={19} strokeWidth={2} /></span>
            <p className="text-[14px] leading-relaxed text-ink-2">
              Регистрация жильцов — по номеру телефона в мобильном приложении Ortaq. Оно появится в следующей версии; ссылка сохранит силу до своего срока.
            </p>
          </div>
        </>
      )}
      {q.isError && <AuthTitle title="Нет связи с сервером" sub="Проверьте интернет и обновите страницу." />}
    </AuthLayout>
  )
}
