import { ArrowRight, Link2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import type { ReadinessResponse } from '@ortaq/shared'
import { api } from '../shared/api/client'
import { Btn, Card, CardHead, ErrorNote, PageHead, Skeleton } from '../shared/ui/kit'
import { Readiness } from '../shared/ui/Readiness'

type House = { id: string; display_name: string; address: string; role: string }
type ChainCheck = { valid: boolean; checked: number; broken_at: string | null }

/**
 * Первый экран председателя (docs/04 §4): чек-лист готовности вместо пустого дашборда.
 * Дашборд с заявками и финансами появится вместе с ними, в следующих фазах.
 */
export function Home() {
  const { houseId = '' } = useParams()
  const navigate = useNavigate()
  const house = useQuery({ queryKey: ['house', houseId], queryFn: () => api<House>(`/houses/${houseId}`) })
  const readiness = useQuery({ queryKey: ['house', houseId, 'readiness'], queryFn: () => api<ReadinessResponse>(`/houses/${houseId}/readiness`) })
  const verify = useMutation({ mutationFn: () => api<ChainCheck>(`/houses/${houseId}/audit/verify`) })
  const chairman = house.data?.role === 'CHAIRMAN'

  return (
    <>
      <PageHead title={house.data?.display_name ?? 'Дом'} sub={house.data?.address} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {readiness.isPending ? <Skeleton rows={6} /> : readiness.isError ? <ErrorNote>{readiness.error.message}</ErrorNote> : <Readiness data={readiness.data} links={chairman ? { areas: `/h/${houseId}/areas`, registry: `/h/${houseId}/registry`, residents: `/h/${houseId}/residents` } : {}} />}
        <div className="flex flex-col gap-6">
          {chairman && (
            <Card>
              <CardHead icon={Link2} title="Пригласите жильцов" sub="Ссылка для чата дома: жилец переходит, регистрируется по телефону и подтверждает личность через eGov" />
              <Btn icon={ArrowRight} onClick={() => navigate(`/h/${houseId}/residents`)}>К жильцам и ссылкам</Btn>
            </Card>
          )}
          {chairman && (
            <Card>
              <CardHead icon={ShieldCheck} title="Журнал дома" sub="Каждое действие сцеплено хешем с предыдущим. Проверку можно показать недоверчивому жильцу" />
              {verify.data && (
                <p className={verify.data.valid
                  ? 'mb-4 flex items-center gap-2 rounded-[15px] bg-brand-50 px-4 py-3 text-[14px] text-brand-800'
                  : 'mb-4 flex items-center gap-2 rounded-[15px] bg-danger-soft px-4 py-3 text-[14px] text-danger'}>
                  {verify.data.valid ? <ShieldCheck size={17} strokeWidth={2.2} /> : <ShieldAlert size={17} strokeWidth={2.2} />}
                  {verify.data.valid ? `Цепочка цела, записей: ${verify.data.checked}` : 'Цепочка нарушена: историю меняли в обход приложения'}
                </p>
              )}
              <ErrorNote>{verify.error?.message}</ErrorNote>
              <Btn variant="soft" loading={verify.isPending} onClick={() => verify.mutate()}>Проверить журнал</Btn>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
