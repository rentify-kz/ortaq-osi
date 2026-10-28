import { useState } from 'react'
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, Play, Send, TriangleAlert } from 'lucide-react-native'
import { MAX_TASK_PHOTOS } from '@ortaq/shared'
import { api } from '../../lib/api'
import { when } from '../../lib/format'
import { PRIORITY, TASK_STATUS } from '../../lib/labels'
import { enqueueCompletion } from '../../lib/outbox'
import { useHouse } from '../../lib/session'
import { takePhoto, type Picked } from '../../lib/upload'
import { color, space } from '../../theme'
import { Button, Card, ErrorNote, Field, H2, Screen, Skeleton, T, Tag, Title } from '../../ui/kit'
import { LocalPhotos, PhotoStrip } from '../../ui/photos'
import type { WorkerTask } from '../(tabs)/tasks'

/**
 * Задача работника (docs/07 §7.2): фото от жильца до выезда, «Начать», затем фото и
 * «Отправить». Отправка идёт через офлайн-очередь — в подвале без связи работа не теряется.
 */
export default function TaskScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const house = useHouse()
  const qc = useQueryClient()
  const [finishing, setFinishing] = useState(false)
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<Picked[]>([])
  const [sent, setSent] = useState(false)
  const list = qc.getQueryData<WorkerTask[]>(['house', house?.id, 'my-tasks'])
  const q = useQuery({
    queryKey: ['house', house?.id, 'task', id],
    queryFn: () => api<WorkerTask>(`/houses/${house!.id}/tasks/${id}`),
    enabled: !!house,
    // Без сети — из уже загруженного списка задач
    placeholderData: list?.find((t) => t.id === id),
  })
  const start = useMutation({
    mutationFn: () => api(`/houses/${house!.id}/tasks/${id}/start`, { method: 'POST' }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['house', house?.id, 'task', id] }), qc.invalidateQueries({ queryKey: ['house', house?.id, 'my-tasks'] })]),
  })
  const shot = useMutation({ mutationFn: takePhoto, onSuccess: (p) => p && setPhotos((l) => [...l, p].slice(0, MAX_TASK_PHOTOS)) })

  if (!house || (q.isPending && !q.data)) return <Screen><Skeleton rows={4} /></Screen>
  const t = q.data
  if (!t) return <Screen><ErrorNote>{q.error?.message}</ErrorNote></Screen>

  const send = async () => {
    await enqueueCompletion({ houseId: house.id, taskId: t.id, taskTitle: t.title, note: note.trim() || null, photos })
    await qc.invalidateQueries({ queryKey: ['house', house.id, 'my-tasks'] })
    setSent(true)
  }

  if (sent) {
    return (
      <Screen>
        <Title sub="Председатель подтвердит выполнение. После этого жильцы увидят результат">Отправлено на проверку</Title>
        <Button onPress={() => router.replace('/tasks')}>К задачам</Button>
      </Screen>
    )
  }

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}><Button variant="soft" icon={ArrowLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/tasks'))}>Назад</Button></View>
      <Title sub={t.request ? `${t.request.location_label}${t.request.location_detail ? `, ${t.request.location_detail}` : ''}` : undefined}>{t.title}</Title>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Tag tone="mute">{TASK_STATUS[t.status] ?? t.status}</Tag>
        {t.priority !== 'NORMAL' && <Tag tone="warn">{PRIORITY[t.priority]}</Tag>}
        {t.due_at && <Tag tone="mute">срок {when(t.due_at)}</Tag>}
      </View>
      {t.last_completion?.rejection_reason && t.status !== 'SUBMITTED' && (
        <Card tone="warning"><T weight="semibold">Вернули на доработку</T><T size={14.5}>{t.last_completion.rejection_reason}</T></Card>
      )}
      {(t.description || t.request) && (
        <Card>
          {t.request && <T size={13.5} tone="ink2">Заявка №{t.request.number}</T>}
          <T size={15.5} style={{ lineHeight: 23 }}>{t.description ?? t.request?.description}</T>
          {t.request && t.request.photo_file_ids.length > 0 && (
            <View style={{ gap: space.sm }}><T size={13.5} weight="semibold">Фото от жильца</T><PhotoStrip houseId={house.id} ids={t.request.photo_file_ids} /></View>
          )}
        </Card>
      )}

      {['ASSIGNED', 'REJECTED'].includes(t.status) && !finishing && (
        <Button icon={Play} loading={start.isPending} onPress={() => start.mutate()}>Начать работу</Button>
      )}
      {['ASSIGNED', 'IN_PROGRESS', 'REJECTED'].includes(t.status) && !finishing && (
        <Button variant={t.status === 'IN_PROGRESS' ? 'solid' : 'soft'} icon={Camera} onPress={() => setFinishing(true)}>Завершить</Button>
      )}

      {finishing && (
        <Card>
          <H2>Завершить задачу</H2>
          <T size={14} tone="ink2">{t.requires_photo ? 'Фотофиксация обязательна' : 'Фото по желанию — с ним председатель примет работу быстрее'}</T>
          <LocalPhotos uris={photos.map((p) => p.uri)} onRemove={(i) => setPhotos((l) => l.filter((_, j) => j !== i))} />
          {photos.length < MAX_TASK_PHOTOS && <Button variant="soft" icon={Camera} loading={shot.isPending} onPress={() => shot.mutate()}>Сфотографировать</Button>}
          <Field label="Комментарий" value={note} onChangeText={setNote} placeholder="Что сделано" multiline />
          {/* Предупреждение до отправки: снимок для жильцов, а не только для отчётности (docs/07 §7.2) */}
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
            <TriangleAlert size={17} color={color.warning} />
            <T size={13.5} tone="ink2" style={{ flex: 1 }}>Фото увидят жильцы после подтверждения председателем</T>
          </View>
          <ErrorNote>{shot.error?.message}</ErrorNote>
          <Button icon={Send} disabled={t.requires_photo && photos.length === 0} onPress={() => void send()}>Отправить</Button>
        </Card>
      )}
      <ErrorNote>{start.error?.message}</ErrorNote>
    </Screen>
  )
}
