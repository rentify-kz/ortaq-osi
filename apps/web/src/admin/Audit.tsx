import { useState } from 'react'
import { ScrollText, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { api } from '../shared/api/client'
import { formatDateTime } from '../shared/lib/cn'
import { Btn, Card, Cell, Empty, ErrorNote, PageHead, Row, Segmented, Skeleton, Table, Td } from '../shared/ui/kit'
import { ACTION_LABELS, ROLE_LABELS, type AuditItem, type ChainCheck } from './types'

type Page = { items: AuditItem[]; next_cursor: string | null }

/**
 * Журнал аудита платформы. Каждая запись сцеплена хешем с предыдущей:
 * правка задним числом ломает цепочку, и проверка это покажет (docs/13 §5)
 */
export function Audit() {
  const [scope, setScope] = useState<'all' | 'global'>('all')
  const q = useInfiniteQuery({
    queryKey: ['admin', 'audit', scope],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' })
      if (scope === 'global') params.set('house_id', 'global')
      if (pageParam) params.set('cursor', pageParam)
      return api<Page>(`/admin/audit?${params}`)
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
  const verify = useMutation({ mutationFn: () => api<ChainCheck>('/admin/audit/verify?house_id=global') })
  const items = q.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <>
      <PageHead
        title="Журнал"
        sub="Кто, что и когда сделал. Записи только дописываются"
        actions={<Btn variant="soft" icon={ShieldCheck} loading={verify.isPending} onClick={() => verify.mutate()}>Проверить общую цепочку</Btn>}
      />
      {verify.data && (
        <p className={verify.data.valid
          ? 'flex items-center gap-2 rounded-[18px] bg-brand-50 px-5 py-4 text-[15px] text-brand-800'
          : 'flex items-center gap-2 rounded-[18px] bg-danger-soft px-5 py-4 text-[15px] text-danger'}>
          {verify.data.valid ? <ShieldCheck size={18} strokeWidth={2.2} /> : <ShieldAlert size={18} strokeWidth={2.2} />}
          {verify.data.valid
            ? `Цепочка цела: проверено записей ${verify.data.checked}`
            : `Цепочка нарушена на записи ${verify.data.broken_at}. Кто-то изменил историю в обход приложения`}
        </p>
      )}
      <Card>
        <div className="mb-3">
          <Segmented id="audit-scope" label="Какие записи" value={scope} onChange={setScope}
            options={[{ v: 'all', label: 'Все' }, { v: 'global', label: 'Вне домов' }]} />
        </div>
        {q.isPending && <Skeleton rows={6} />}
        {q.isError && <ErrorNote>{q.error.message}</ErrorNote>}
        {!q.isPending && items.length === 0 && <Empty icon={ScrollText} title="Записей нет" text="Здесь появятся входы, действия админа и председателей." />}
        {items.length > 0 && (
          <Table cols={[{ label: 'Когда' }, { label: 'Событие' }, { label: 'Кто' }, { label: 'IP', right: true }]} minW={720}>
            {items.map((r) => (
              <Row key={r.id}>
                <Td className="nums whitespace-nowrap text-ink-2">{formatDateTime(r.created_at)}</Td>
                <Td><Cell title={ACTION_LABELS[r.action] ?? r.action} sub={r.house_id ? 'в доме' : 'вне дома'} /></Td>
                <Td><Cell title={r.actor_name ?? 'система'} sub={r.actor_role ? ROLE_LABELS[r.actor_role] ?? r.actor_role : undefined} /></Td>
                <Td right className="nums text-ink-2">{r.ip ?? '—'}</Td>
              </Row>
            ))}
          </Table>
        )}
        {q.hasNextPage && (
          <div className="mt-3 flex justify-center">
            <Btn variant="soft" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Показать ещё</Btn>
          </div>
        )}
      </Card>
    </>
  )
}
