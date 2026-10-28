import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, Plus } from 'lucide-react-native'
import { api } from '../../lib/api'
import { when } from '../../lib/format'
import { REQUEST_STATUS, type RequestRow } from '../../lib/labels'
import { useHouse } from '../../lib/session'
import { color, radius, space, TAB_BAR_SPACE } from '../../theme'
import { Button, Empty, ErrorNote, Screen, Skeleton, T, Tag, Title } from '../../ui/kit'

export function RequestCard({ r }: { r: RequestRow }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Заявка ${r.number}: ${r.title}`} onPress={() => router.push({ pathname: '/request/[id]', params: { id: r.id } })}
      style={({ pressed }) => ({ borderRadius: radius.lg, backgroundColor: pressed ? color.surface2 : color.surface, padding: space.lg, gap: 6, flexDirection: 'row', alignItems: 'center' })}>
      <View style={{ flex: 1, gap: 6 }}>
        <T weight="semibold" numberOfLines={2}>№{r.number} {r.title}</T>
        <T size={13.5} tone="ink2">{r.location_label} · {when(r.created_at)}</T>
        {r.progress.total > 0 && (
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {Array.from({ length: r.progress.total }, (_, i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < r.progress.done ? color.brand500 : color.surface3 }} />)}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Tag tone={r.status === 'DONE' ? 'brand' : 'mute'}>{r.progress.current_stage ?? REQUEST_STATUS[r.status] ?? r.status}</Tag>
          {r.is_mine && <Tag tone="mute">моя</Tag>}
        </View>
      </View>
      <ChevronRight size={18} color={color.ink3} />
    </Pressable>
  )
}

/** Заявки дома глазами жильца: свои и все по общему имуществу — что сейчас решается */
export default function Requests() {
  const house = useHouse()
  const q = useQuery({
    queryKey: ['house', house?.id, 'requests', 'resident'],
    queryFn: () => api<RequestRow[]>(`/houses/${house!.id}/requests?status=all`),
    enabled: !!house,
  })
  const open = q.data?.filter((r) => !['DONE', 'REJECTED', 'CANCELLED'].includes(r.status)) ?? []
  const closed = q.data?.filter((r) => ['DONE', 'REJECTED', 'CANCELLED'].includes(r.status) && r.is_mine) ?? []
  return (
    <Screen bottomInset={TAB_BAR_SPACE} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Title sub="Сообщите о проблеме — председатель получит её сразу">Заявки</Title>
      <Button icon={Plus} onPress={() => router.push('/request/new')}>Сообщить о проблеме</Button>
      {q.isPending && <Skeleton rows={3} height={96} />}
      <ErrorNote>{q.error?.message}</ErrorNote>
      {q.data && open.length === 0 && closed.length === 0 && <Empty icon={ClipboardList} title="Заявок пока нет" text="Здесь будут ваши заявки и всё, что решается по дому." />}
      {open.length > 0 && <T weight="semibold" tone="ink2">Сейчас решается</T>}
      {open.map((r) => <RequestCard key={r.id} r={r} />)}
      {closed.length > 0 && <T weight="semibold" tone="ink2">Мои закрытые</T>}
      {closed.map((r) => <RequestCard key={r.id} r={r} />)}
    </Screen>
  )
}
