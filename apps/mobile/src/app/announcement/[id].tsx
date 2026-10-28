import { useEffect } from 'react'
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pin } from 'lucide-react-native'
import { api } from '../../lib/api'
import { when } from '../../lib/format'
import { useHouse } from '../../lib/session'
import { color, space } from '../../theme'
import { Button, Card, Empty, Screen, Skeleton, T, Title } from '../../ui/kit'

type Announcement = { id: string; title: string; body: string; pinned: boolean; published_at: string; is_read: boolean }

/** Объявление целиком. Открытие = прочтение: из этого складывается статистика у председателя */
export default function AnnouncementScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const house = useHouse()
  const qc = useQueryClient()
  const key = ['house', house?.id, 'announcements']
  // Отдельного GET нет: лента обычно уже загружена, берём объявление из неё
  const feed = useQuery({ queryKey: key, queryFn: () => api<Announcement[]>(`/houses/${house!.id}/announcements`), enabled: !!house })
  const a = feed.data?.find((x) => x.id === id)
  const { mutate: markRead, isIdle } = useMutation({
    mutationFn: () => api(`/houses/${house!.id}/announcements/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.setQueryData<Announcement[]>(key, (list) => list?.map((x) => (x.id === id ? { ...x, is_read: true } : x))),
  })
  const unread = !!a && !a.is_read

  useEffect(() => {
    if (unread && isIdle) markRead()
  }, [unread, isIdle, markRead])

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}>
        <Button variant="soft" icon={ArrowLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}>Назад</Button>
      </View>
      {feed.isPending && <Skeleton rows={3} />}
      {feed.data && !a && <Empty icon={Pin} title="Объявление недоступно" text="Его удалили или оно адресовано не вам." />}
      {a && (
        <>
          <Title sub={when(a.published_at)}>{a.title}</Title>
          <Card><T size={16} style={{ lineHeight: 24 }}>{a.body}</T></Card>
          {a.pinned && (
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <Pin size={15} strokeWidth={2.2} color={color.brand700} />
              <T size={13.5} tone="brand">Закреплено председателем</T>
            </View>
          )}
        </>
      )}
    </Screen>
  )
}
