import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Megaphone, Pin, ShieldCheck, Vote } from 'lucide-react-native'
import type { VoteListItem } from '@ortaq/shared'
import { api } from '../../lib/api'
import { when } from '../../lib/format'
import { useHouse, useMyPlace } from '../../lib/session'
import { color, radius, space, TAB_BAR_SPACE } from '../../theme'
import { Button, Card, Empty, ErrorNote, H2, IconBadge, Screen, Skeleton, T, Tag, Title } from '../../ui/kit'
import { VoteRow } from '../../ui/votes'

export type Announcement = { id: string; title: string; body: string; pinned: boolean; published_at: string; is_read: boolean }

/** Главная жильца: право голоса, что сейчас решается в доме и что нового */
export default function Home() {
  const house = useHouse()
  const place = useMyPlace(house?.id)
  const feed = useQuery({
    queryKey: ['house', house?.id, 'announcements'],
    queryFn: () => api<Announcement[]>(`/houses/${house!.id}/announcements`),
    enabled: !!house,
  })
  const votes = useQuery({ queryKey: ['house', house?.id, 'votes'], queryFn: () => api<VoteListItem[]>(`/houses/${house!.id}/votes`), enabled: !!house })
  // «Сейчас решается»: идущие и объявленные голосования; завершённые — во вкладке «Дом»
  const deciding = votes.data?.filter((v) => v.status === 'ACTIVE' || v.status === 'NOTICE_SENT') ?? []
  const canVote = place.data?.units.some((u) => u.can_vote) ?? false
  const resident = place.data?.role === 'RESIDENT'

  return (
    <Screen bottomInset={TAB_BAR_SPACE} refreshing={feed.isRefetching} onRefresh={() => { void feed.refetch(); void place.refetch(); void votes.refetch() }}>
      <Title sub={house?.address}>{house?.display_name ?? 'Дом'}</Title>

      {resident && place.data && !place.data.identity_verified && (
        <Card tone="brand">
          <IconBadge icon={ShieldCheck} tone="brand" />
          <H2>Подтвердите личность</H2>
          <T size={14.5} tone="ink2">Чтобы голосовать на собраниях, подпишите согласие в eGov mobile. Это займёт минуту</T>
          <Button onPress={() => router.push('/verify')}>Подтвердить через eGov</Button>
        </Card>
      )}

      {resident && place.data && place.data.identity_verified && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <IconBadge icon={Vote} tone={canVote ? 'brand' : 'surface'} />
            <View style={{ flex: 1 }}>
              <T weight="semibold">{canVote ? 'Вы можете голосовать' : 'Собственность на проверке'}</T>
              <T size={13.5} tone="ink2">
                {canVote ? 'Личность и собственность подтверждены' : 'Председатель подтвердит помещение — тогда появится право голоса'}
              </T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {place.data.units.map((u) => (
              <Tag key={u.number} tone={u.verification === 'VERIFIED' ? 'brand' : u.verification === 'PENDING' ? 'warn' : 'mute'}>
                кв. {u.number}{u.verification === 'VERIFIED' ? ', подтверждена' : u.verification === 'PENDING' ? ', на проверке' : ', отклонена'}
              </Tag>
            ))}
          </View>
        </Card>
      )}

      {deciding.length > 0 && (
        <>
          <H2>Сейчас решается</H2>
          <View style={{ gap: space.sm }}>{deciding.map((v) => <VoteRow key={v.id} v={v} />)}</View>
        </>
      )}

      <H2>Объявления</H2>
      {feed.isPending && <Skeleton rows={3} height={84} />}
      <ErrorNote>{feed.error?.message}</ErrorNote>
      {feed.data?.length === 0 && <Empty icon={Megaphone} title="Объявлений пока нет" text="Председатель публикует здесь новости дома: отключения, собрания, работы." />}
      <View style={{ gap: space.sm }}>
        {feed.data?.map((a) => (
          <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`${a.title}${a.is_read ? '' : ', не прочитано'}`}
            onPress={() => router.push({ pathname: '/announcement/[id]', params: { id: a.id } })}
            style={({ pressed }) => ({ borderRadius: radius.lg, backgroundColor: pressed ? color.surface2 : color.surface, padding: space.lg, gap: 6, flexDirection: 'row', alignItems: 'center' })}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                {!a.is_read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.brand500 }} />}
                {a.pinned && <Pin size={14} strokeWidth={2.2} color={color.brand700} />}
                <T weight="semibold" numberOfLines={2} style={{ flex: 1 }}>{a.title}</T>
              </View>
              <T size={14} tone="ink2" numberOfLines={2}>{a.body}</T>
              <T size={12.5} tone="ink3">{when(a.published_at)}</T>
            </View>
            <ChevronRight size={18} strokeWidth={2.2} color={color.ink3} />
          </Pressable>
        ))}
      </View>
    </Screen>
  )
}
