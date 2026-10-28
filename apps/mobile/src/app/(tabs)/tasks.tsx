import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, CloudOff, ListTodo, Repeat } from 'lucide-react-native'
import { api } from '../../lib/api'
import { when } from '../../lib/format'
import { TASK_STATUS } from '../../lib/labels'
import { useOutbox } from '../../lib/outbox'
import { useHouse } from '../../lib/session'
import { color, radius, space, TAB_BAR_SPACE } from '../../theme'
import { Card, Empty, ErrorNote, Screen, Skeleton, T, Tag, Title } from '../../ui/kit'

export type WorkerTask = {
  id: string; title: string; description: string | null; status: string; priority: string; due_at: string | null; requires_photo: boolean; recurring: boolean
  request: { id: string; number: number; title: string; description: string; location_label: string; location_detail: string | null; photo_file_ids: string[] } | null
  last_completion: { rejection_reason: string | null } | null
}

function isToday(iso: string | null) {
  return !!iso && new Date(iso).toDateString() === new Date().toDateString()
}

function TaskCard({ t, pending }: { t: WorkerTask; pending: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/task/[id]', params: { id: t.id } })}
      style={({ pressed }) => ({ borderRadius: radius.lg, backgroundColor: pressed ? color.surface2 : color.surface, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md })}>
      <View style={{ flex: 1, gap: 6 }}>
        <T weight="semibold" size={16}>{t.title}</T>
        {t.request && <T size={14} tone="ink2">{t.request.location_label} · заявка №{t.request.number}</T>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {t.priority === 'CRITICAL' && <Tag tone="warn">срочно</Tag>}
          {t.due_at && <Tag tone="mute">до {when(t.due_at)}</Tag>}
          {t.requires_photo && <Tag tone="mute">📷 нужно фото</Tag>}
          {t.recurring && <Tag tone="mute">по расписанию</Tag>}
          {(t.status === 'REJECTED' || (t.last_completion?.rejection_reason && t.status === 'IN_PROGRESS')) && <Tag tone="warn">вернули на доработку</Tag>}
          {pending ? <Tag tone="warn">ждёт сети</Tag> : t.status === 'SUBMITTED' ? <Tag tone="brand">{TASK_STATUS.SUBMITTED}</Tag> : null}
        </View>
      </View>
      <ChevronRight size={18} color={color.ink3} />
    </Pressable>
  )
}

/**
 * Главный экран работника (docs/07 §7.1): срочное → сегодня → рутина → остальное.
 * Открыл — и видна задача, с которой начать, а не список из пятнадцати.
 */
export default function Tasks() {
  const house = useHouse()
  const outbox = useOutbox()
  const q = useQuery({ queryKey: ['house', house?.id, 'my-tasks'], queryFn: () => api<WorkerTask[]>(`/houses/${house!.id}/my-tasks`), enabled: !!house, staleTime: 30_000 })
  const pendingIds = new Set(outbox.map((o) => o.taskId))
  const active = (q.data ?? []).filter((t) => t.status !== 'APPROVED' && t.status !== 'SUBMITTED' && !pendingIds.has(t.id))
  const groups = [
    { title: 'Срочно', items: active.filter((t) => t.priority === 'CRITICAL' || t.priority === 'HIGH') },
    { title: 'Сегодня', items: active.filter((t) => t.priority !== 'CRITICAL' && t.priority !== 'HIGH' && !t.recurring && isToday(t.due_at)) },
    { title: 'Рутина по расписанию', items: active.filter((t) => t.priority !== 'CRITICAL' && t.priority !== 'HIGH' && t.recurring) },
    { title: 'Ближайшее', items: active.filter((t) => t.priority !== 'CRITICAL' && t.priority !== 'HIGH' && !t.recurring && !isToday(t.due_at)) },
  ]
  const waiting = (q.data ?? []).filter((t) => t.status === 'SUBMITTED' || pendingIds.has(t.id))

  return (
    <Screen bottomInset={TAB_BAR_SPACE} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Title sub={house?.display_name}>Задачи</Title>
      {outbox.length > 0 && (
        <Card tone="warning" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <CloudOff size={20} color={color.warning} />
          <View style={{ flex: 1 }}>
            <T weight="semibold">Ждут отправки: {outbox.length}</T>
            <T size={13.5} tone="ink2">Отметки и фото уйдут сами, как только появится связь</T>
          </View>
        </Card>
      )}
      {q.isPending && <Skeleton rows={3} height={96} />}
      <ErrorNote>{q.isError && !q.data ? 'Нет связи — показываем то, что было загружено раньше' : null}</ErrorNote>
      {q.data && active.length === 0 && waiting.length === 0 && <Empty icon={ListTodo} title="Задач нет" text="Когда председатель назначит работу, она появится здесь и придёт уведомлением." />}
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <View key={g.title} style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {g.title === 'Рутина по расписанию' && <Repeat size={15} color={color.ink2} />}
            <T weight="semibold" tone="ink2">{g.title}</T>
          </View>
          {g.items.map((t) => <TaskCard key={t.id} t={t} pending={false} />)}
        </View>
      ))}
      {waiting.length > 0 && <T weight="semibold" tone="ink2">На проверке у председателя</T>}
      {waiting.map((t) => <TaskCard key={t.id} t={t} pending={pendingIds.has(t.id)} />)}
    </Screen>
  )
}
