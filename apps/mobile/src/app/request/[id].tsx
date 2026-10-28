import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bell, Check, CircleCheck, Send, Star, X } from 'lucide-react-native'
import { api } from '../../lib/api'
import { when } from '../../lib/format'
import { REQUEST_STATUS, type RequestRow } from '../../lib/labels'
import { useHouse } from '../../lib/session'
import { color, font, radius, space } from '../../theme'
import { Button, Card, ErrorNote, Field, H2, Screen, Skeleton, T, Tag, Title } from '../../ui/kit'
import { PhotoStrip } from '../../ui/photos'

type Detail = RequestRow & {
  description: string; photo_file_ids: string[]; work_photo_file_ids: string[]
  stages: { id: string; title: string; status: string }[]
  possible_duplicate: { id: string; number: number; title: string } | null; duplicate_of: { id: string; number: number } | null
  is_following: boolean; rejection_reason: string | null; rating: number | null
}
type Event = { id: string; type: string; data: Record<string, unknown> | null; created_at: string; actor: { name: string } }

const TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  CREATED: () => 'Заявка подана',
  ACCEPTED: () => 'Председатель принял заявку',
  REJECTED: (d) => `Отклонена: ${String(d.reason ?? '')}`,
  PRIORITY_CHANGED: () => 'Изменён приоритет',
  STAGES_ADDED: (d) => `План работ: ${(d.titles as string[]).join(' → ')}`,
  STAGE_DONE: (d) => `Этап «${String(d.title)}» выполнен`,
  TASK_ASSIGNED: (d) => `Назначен исполнитель${d.assignee ? `: ${String(d.assignee)}` : ''}`,
  WORK_APPROVED: () => 'Работа выполнена и проверена председателем',
  COMMENT: (d) => String(d.text ?? ''),
  MERGED_INTO: (d) => `Объединена с заявкой №${String(d.number)}: об этом уже сообщили`,
  DUPLICATE_ADDED: () => 'Ещё один жилец сообщил о том же',
  DONE: () => 'Заявка выполнена',
  CANCELLED: () => 'Заявка отменена',
}

/** Отслеживание заявки (docs/05 §5.3): не «в работе», а конкретный этап и фото результата */
export default function RequestScreen() {
  const { id = '', fresh } = useLocalSearchParams<{ id: string; fresh?: string }>()
  const house = useHouse()
  const qc = useQueryClient()
  const [comment, setComment] = useState('')
  const base = `/houses/${house?.id}/requests/${id}`
  const q = useQuery({ queryKey: ['house', house?.id, 'request', id], queryFn: () => api<Detail>(base), enabled: !!house })
  const events = useQuery({ queryKey: ['house', house?.id, 'request', id, 'activity'], queryFn: () => api<Event[]>(`${base}/activity`), enabled: !!house })
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['house', house?.id, 'request', id] }), qc.invalidateQueries({ queryKey: ['house', house?.id, 'requests'] })])
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) => api(`${base}/${path}`, { method: 'POST', body }),
    onSuccess: async () => { setComment(''); await refresh() },
  })
  const follow = useMutation({
    mutationFn: (other: string) => api(`/houses/${house?.id}/requests/${other}/follow`, { method: 'POST' }),
    onSuccess: async (_, other) => {
      await api(`${base}/cancel`, { method: 'POST' }).catch(() => undefined)
      await refresh()
      router.replace({ pathname: '/request/[id]', params: { id: other } })
    },
  })

  if (!house || q.isPending) return <Screen><Skeleton rows={4} /></Screen>
  if (!q.data) return <Screen><ErrorNote>{q.error?.message}</ErrorNote></Screen>
  const r = q.data
  const open = !['DONE', 'REJECTED', 'CANCELLED'].includes(r.status)
  const stages = r.stages.filter((s) => s.status !== 'SKIPPED')

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void refresh()}>
      <View style={{ alignItems: 'flex-start' }}>
        <Button variant="soft" icon={ArrowLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/requests'))}>Назад</Button>
      </View>
      {fresh === '1' && r.status === 'TRIAGE' && (
        <Card tone="brand"><T weight="semibold">Заявка №{r.number} принята, проверяется</T><T size={14} tone="ink2">Председатель уже получил уведомление</T></Card>
      )}
      {fresh === 'merged' && <Card tone="brand"><T weight="semibold">Вы уже отправляли эту заявку</T><T size={14} tone="ink2">Новые фото добавлены к ней, вторую не создавали</T></Card>}
      {r.possible_duplicate && r.is_mine && open && (
        <Card tone="warning">
          <T weight="semibold">Похоже, об этом уже сообщили</T>
          <T size={14} tone="ink2">Заявка №{r.possible_duplicate.number} «{r.possible_duplicate.title}». Можно следить за ней вместо своей</T>
          <Button variant="soft" icon={Bell} loading={follow.isPending} onPress={() => follow.mutate(r.possible_duplicate!.id)}>Следить за №{r.possible_duplicate.number}</Button>
        </Card>
      )}

      <Title sub={`${r.location_label} · ${when(r.created_at)}`}>№{r.number} {r.title}</Title>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Tag tone={r.status === 'DONE' ? 'brand' : r.status === 'REJECTED' ? 'mute' : 'warn'}>{REQUEST_STATUS[r.status] ?? r.status}</Tag>
        {r.reports > 1 && <Tag tone="mute">обратились {r.reports} жильца</Tag>}
      </View>

      {stages.length > 0 && (
        <Card>
          <H2>Ход работ</H2>
          <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Выполнено этапов: ${r.progress.done} из ${r.progress.total}`}>
            {stages.map((s) => <View key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: s.status === 'DONE' ? color.brand500 : s.status === 'IN_PROGRESS' ? color.warning : color.surface3 }} />)}
          </View>
          {stages.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              {s.status === 'DONE' ? <CircleCheck size={18} color={color.brand600} /> : <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: s.status === 'IN_PROGRESS' ? color.warningSoft : color.surface3 }} />}
              <T size={14.5} tone={s.status === 'DONE' ? 'ink2' : 'ink'} weight={s.status === 'IN_PROGRESS' ? 'semibold' : 'body'}>{s.title}{s.status === 'IN_PROGRESS' ? ' — сейчас' : ''}</T>
            </View>
          ))}
          {r.assignee && <T size={13.5} tone="ink2">Исполнитель: {r.assignee}</T>}
        </Card>
      )}

      {r.work_photo_file_ids.length > 0 && (
        <Card tone="brand"><H2>Результат работы</H2><PhotoStrip houseId={house.id} ids={r.work_photo_file_ids} /></Card>
      )}

      <Card>
        <T size={15.5} style={{ lineHeight: 23 }}>{r.description}</T>
        <PhotoStrip houseId={house.id} ids={r.photo_file_ids} />
        {r.rejection_reason && <T size={14} tone="ink2">Причина отказа: {r.rejection_reason}</T>}
      </Card>

      {r.status === 'DONE' && r.is_mine && r.rating === null && (
        <Card>
          <H2>Как решили?</H2>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: space.sm }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} из 5`} onPress={() => act.mutate({ path: 'rate', body: { rating: n } })}
                style={{ flex: 1, minHeight: 52, borderRadius: radius.md, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Star size={22} color={color.warning} />
                <Text style={{ fontFamily: font.semibold, fontSize: 13, color: color.ink2 }}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      )}

      <H2>История</H2>
      {events.data?.map((e) => (
        <View key={e.id} style={{ borderLeftWidth: 2, borderLeftColor: color.brand100, paddingLeft: space.md, gap: 2 }}>
          <T size={12.5} tone="ink3">{when(e.created_at)} · {e.actor.name}</T>
          <T size={14.5}>{(TEXT[e.type] ?? (() => e.type))(e.data ?? {})}</T>
          {Array.isArray(e.data?.photo_file_ids) && <PhotoStrip houseId={house.id} ids={e.data.photo_file_ids as string[]} />}
        </View>
      ))}

      {open && (r.is_mine || r.is_following) && (
        <View style={{ gap: space.sm }}>
          <Field label="Комментарий" value={comment} onChangeText={setComment} placeholder="Что-то изменилось?" multiline />
          <Button variant="soft" icon={Send} disabled={!comment.trim()} loading={act.isPending && act.variables?.path === 'comments'} onPress={() => act.mutate({ path: 'comments', body: { text: comment } })}>Отправить</Button>
        </View>
      )}
      {open && !r.is_mine && !r.is_following && (
        <Button variant="soft" icon={Check} loading={act.isPending} onPress={() => act.mutate({ path: 'follow' })}>У меня то же самое — следить</Button>
      )}
      {open && r.is_mine && ['TRIAGE', 'ACCEPTED'].includes(r.status) && (
        <Button variant="ghost" icon={X} onPress={() => act.mutate({ path: 'cancel' })}>Отменить заявку</Button>
      )}
      <ErrorNote>{(act.error ?? follow.error)?.message}</ErrorNote>
    </Screen>
  )
}
