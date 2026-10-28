import { useState } from 'react'
import { Image, Modal, Pressable, ScrollView, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { ImageOff, X } from 'lucide-react-native'
import { api } from '../lib/api'
import { color, radius, space } from '../theme'

const SIZE = 88

/** Ссылка на фото живёт 5 минут, выдаётся после проверки прав — перезапрашиваем заранее */
function Thumb({ houseId, id, onOpen }: { houseId: string; id: string; onOpen: (url: string) => void }) {
  const q = useQuery({
    queryKey: ['file', houseId, id],
    queryFn: () => api<{ url: string }>(`/houses/${houseId}/files/${id}/download-url`),
    staleTime: 4 * 60_000,
  })
  const box = { width: SIZE, height: SIZE, borderRadius: radius.sm, backgroundColor: color.surface3, overflow: 'hidden' as const }
  if (!q.data) return <View style={[box, { alignItems: 'center', justifyContent: 'center' }]}>{q.isError && <ImageOff size={18} color={color.ink3} />}</View>
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel="Открыть фото" onPress={() => onOpen(q.data.url)} style={box}>
      <Image source={{ uri: q.data.url }} style={{ width: SIZE, height: SIZE }} />
    </Pressable>
  )
}

export function PhotoStrip({ houseId, ids }: { houseId: string; ids: string[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (ids.length === 0) return null
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {ids.map((id) => <Thumb key={id} houseId={houseId} id={id} onOpen={setOpen} />)}
      </ScrollView>
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable onPress={() => setOpen(null)} accessibilityLabel="Закрыть фото" style={{ flex: 1, backgroundColor: 'rgba(15,23,17,0.92)', alignItems: 'center', justifyContent: 'center', padding: space.lg }}>
          {open && <Image source={{ uri: open }} resizeMode="contain" style={{ width: '100%', height: '80%' }} />}
          <View style={{ position: 'absolute', top: 48, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color={color.white} />
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

/** Выбранные, но ещё не отправленные фото: локальные превью с кнопкой убрать */
export function LocalPhotos({ uris, onRemove }: { uris: string[]; onRemove: (i: number) => void }) {
  if (uris.length === 0) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {uris.map((uri, i) => (
        <View key={uri} style={{ width: SIZE, height: SIZE, borderRadius: radius.sm, overflow: 'hidden' }}>
          <Image source={{ uri }} style={{ width: SIZE, height: SIZE }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Убрать фото" onPress={() => onRemove(i)}
            style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(15,23,17,0.7)', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} color={color.white} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  )
}
