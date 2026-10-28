import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, ImagePlus, Send } from 'lucide-react-native'
import { MAX_REQUEST_PHOTOS, RequestCategory, type CreateRequestBody } from '@ortaq/shared'
import { api, ApiError } from '../../lib/api'
import { CATEGORY, PLACES } from '../../lib/labels'
import { useHouse } from '../../lib/session'
import { pickPhotos, takePhoto, uploadPhoto, type Picked } from '../../lib/upload'
import { color, font, radius, space, TOUCH } from '../../theme'
import { Button, Card, ErrorNote, Field, H2, noWebOutline, Screen, T, Title } from '../../ui/kit'
import { LocalPhotos } from '../../ui/photos'

type Created = { id: string; number: number; merged?: boolean; possible_duplicate: { id: string; number: number; title: string } | null }

function Chip({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? color.brand600 : color.surface2 }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14.5, color: on ? color.white : color.ink }}>{label}</Text>
    </Pressable>
  )
}

/** Новая заявка (docs/05 §5.2): где → что → описание → фото. Больше трёх шагов жилец не сделает */
export default function NewRequest() {
  const house = useHouse()
  const qc = useQueryClient()
  const [place, setPlace] = useState<CreateRequestBody['location_type'] | null>(null)
  const [entrance, setEntrance] = useState('')
  const [floor, setFloor] = useState('')
  const [category, setCategory] = useState<CreateRequestBody['category'] | null>(null)
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<Picked[]>([])

  const send = useMutation({
    mutationFn: async () => {
      const ids: string[] = []
      for (const p of photos) ids.push(await uploadPhoto(house!.id, p, 'REQUEST_PHOTO'))
      return api<Created>(`/houses/${house!.id}/requests`, {
        method: 'POST',
        body: {
          description, category: category!, location_type: place!, photo_file_ids: ids,
          location_entrance: entrance ? Number(entrance) : null, location_floor: floor ? Number(floor) : null,
        } satisfies CreateRequestBody,
      })
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['house', house?.id, 'requests'] })
      router.replace({ pathname: '/request/[id]', params: { id: r.id, fresh: r.merged ? 'merged' : '1' } })
    },
  })
  const fields = send.error instanceof ApiError ? send.error.fields : {}
  const needsEntrance = place === 'ENTRANCE' || place === 'BASEMENT' || place === 'FACADE'
  const ready = place && category && description.trim().length >= 5 && (place !== 'ENTRANCE' || entrance)

  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}><Button variant="soft" icon={ArrowLeft} onPress={() => router.back()}>Назад</Button></View>
      <Title sub="Председатель получит её сразу. Срочное — сверху">Сообщить о проблеме</Title>

      <Card>
        <H2>Где проблема?</H2>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {PLACES.map((p) => (
            <Pressable key={p.v} accessibilityRole="radio" accessibilityState={{ checked: place === p.v }} onPress={() => setPlace(p.v)}
              style={{ width: '31.5%', minHeight: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: space.sm, backgroundColor: place === p.v ? color.brand600 : color.surface2 }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 14, textAlign: 'center', color: place === p.v ? color.white : color.ink }}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        {place && place !== 'APARTMENT' && (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            {needsEntrance && (
              <View style={{ flex: 1 }}>
                <Field label={place === 'ENTRANCE' ? 'Подъезд' : 'Подъезд, если знаете'} value={entrance} onChangeText={(v) => setEntrance(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" error={fields.location_entrance} />
              </View>
            )}
            {place === 'ENTRANCE' && (
              <View style={{ flex: 1 }}><Field label="Этаж" value={floor} onChangeText={(v) => setFloor(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" /></View>
            )}
          </View>
        )}
        {place === 'APARTMENT' && <T size={13.5} tone="ink2">Заявка про вашу квартиру — её увидит только председатель, не соседи</T>}
      </Card>

      <Card>
        <H2>Что случилось?</H2>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {RequestCategory.map((c) => <Chip key={c} on={category === c} label={CATEGORY[c] ?? c} onPress={() => setCategory(c)} />)}
        </View>
        <View style={{ gap: 6 }}>
          <T size={13.5} weight="semibold">Описание</T>
          <TextInput
            accessibilityLabel="Описание проблемы" value={description} onChangeText={setDescription} multiline maxLength={2000}
            placeholder="Например: течёт труба под лестницей, вода на полу" placeholderTextColor={color.ink3}
            style={[{ minHeight: 120, borderRadius: radius.sm, backgroundColor: color.surface2, padding: space.lg, fontFamily: font.body, fontSize: 16, color: color.ink, textAlignVertical: 'top' }, noWebOutline]}
          />
        </View>
      </Card>

      <Card>
        <H2>Фото</H2>
        <T size={14} tone="ink2">Необязательно, но фото ускоряет решение: мастер сразу возьмёт нужный инструмент</T>
        <LocalPhotos uris={photos.map((p) => p.uri)} onRemove={(i) => setPhotos((list) => list.filter((_, j) => j !== i))} />
        {photos.length < MAX_REQUEST_PHOTOS && (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button variant="soft" icon={Camera} style={{ flex: 1 }} onPress={() => void takePhoto().then((p) => p && setPhotos((l) => [...l, p].slice(0, MAX_REQUEST_PHOTOS))).catch(() => undefined)}>Снять</Button>
            <Button variant="soft" icon={ImagePlus} style={{ flex: 1 }} onPress={() => void pickPhotos(MAX_REQUEST_PHOTOS - photos.length).then((p) => setPhotos((l) => [...l, ...p].slice(0, MAX_REQUEST_PHOTOS)))}>Из галереи</Button>
          </View>
        )}
      </Card>

      <ErrorNote>{send.error && !Object.keys(fields).length ? send.error.message : null}</ErrorNote>
      <Button icon={Send} loading={send.isPending} disabled={!ready} onPress={() => send.mutate()} style={{ minHeight: TOUCH + 4 }}>Отправить</Button>
    </Screen>
  )
}
