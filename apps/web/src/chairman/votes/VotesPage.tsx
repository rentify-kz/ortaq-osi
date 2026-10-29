import { Plus, Vote } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { DECISION_LABEL, THRESHOLD_LABEL, type VoteListItem } from '@ortaq/shared'
import { api } from '../../shared/api/client'
import { useMe } from '../../shared/hooks'
import { formatDate } from '../../shared/lib/cn'
import { Btn, Card, CardHead, Empty, ErrorNote, PageHead, Skeleton, Tag } from '../../shared/ui/kit'
import { pct, PROTOCOL_STATUS, VOTE_STATUS } from '../labels'

export const voteTone = (s: string) => (s === 'ACTIVE' ? 'solid' : s === 'CLOSED' ? 'brand' : s === 'CANCELLED' ? 'crit' : 'mute') as 'solid' | 'brand' | 'crit' | 'mute'

/** Голосования дома (docs/06 §6.6): черновики, идущие и завершённые с протоколами */
export function VotesPage() {
  const { houseId = '' } = useParams()
  const navigate = useNavigate()
  const me = useMe()
  const chairman = me.data?.memberships.find((m) => m.house_id === houseId)?.role === 'CHAIRMAN'
  const q = useQuery({ queryKey: ['house', houseId, 'votes'], queryFn: () => api<VoteListItem[]>(`/houses/${houseId}/votes`) })
  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Голосования" sub="Общее собрание собственников: электронно через ЭЦП или письменным опросом"
        actions={chairman ? <Btn icon={Plus} onClick={() => navigate(`/h/${houseId}/votes/new`)}>Новое голосование</Btn> : undefined} />
      <Card>
        <CardHead icon={Vote} title="Все голосования" sub="Порог решения система выводит из типа вопроса, кворум — более 50% площади" />
        <ErrorNote>{q.error?.message}</ErrorNote>
        {q.isPending ? <Skeleton rows={3} /> : (q.data?.length ?? 0) === 0 ? (
          <Empty icon={Vote} title="Голосований пока не было" text="Создайте голосование: система подскажет порог, проверит срок уведомления и сама сформирует протокол."
            action={chairman ? <Btn icon={Plus} onClick={() => navigate(`/h/${houseId}/votes/new`)}>Новое голосование</Btn> : undefined} />
        ) : (
          <ul className="flex flex-col gap-2">
            {q.data!.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => navigate(`/h/${houseId}/votes/${v.id}`)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] bg-surface-2 px-5 py-3.5 text-left transition-colors hover:bg-surface-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-ink">{v.title}</span>
                    <span className="block text-[12.5px] text-ink-2">
                      {DECISION_LABEL[v.decision_type]} · {THRESHOLD_LABEL[v.threshold]}
                      {v.starts_at && v.ends_at ? ` · ${formatDate(v.starts_at)} — ${formatDate(v.ends_at)}` : ''}
                    </span>
                  </span>
                  {v.turnout_percent !== null && v.status === 'ACTIVE' && <span className="text-[13.5px] tabular-nums text-ink-2">явка {pct(v.turnout_percent)}</span>}
                  {v.protocol && <Tag tone={v.protocol.status === 'PUBLISHED' ? 'brand' : 'warn'}>Протокол №{v.protocol.number}: {PROTOCOL_STATUS[v.protocol.status]!.toLowerCase()}</Tag>}
                  <Tag tone={voteTone(v.status)}>{VOTE_STATUS[v.status]}</Tag>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
