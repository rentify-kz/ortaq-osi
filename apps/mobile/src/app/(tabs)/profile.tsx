import { Pressable, Switch, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Building2, LogOut, ShieldCheck } from 'lucide-react-native'
import type { NotificationCategory } from '@ortaq/shared'
import { api } from '../../lib/api'
import { formatPhone, initials } from '../../lib/format'
import { useHouse, useHouses, useMe, useMyPlace, useSession } from '../../lib/session'
import { color, radius, space, TAB_BAR_SPACE } from '../../theme'
import { Button, Card, ErrorNote, H2, Screen, Skeleton, T, Tag } from '../../ui/kit'

type Settings = { push: Record<NotificationCategory, boolean>; locked: NotificationCategory[] }

/** Категории, которые есть у жильца уже сейчас. Остальные появятся вместе с их разделами */
const CATEGORIES: { key: NotificationCategory; label: string; hint: string }[] = [
  { key: 'VOTES', label: 'Голосования', hint: 'Отключить нельзя: это юридически значимое извещение собственника' },
  { key: 'ANNOUNCEMENTS', label: 'Объявления', hint: 'Отключения, собрания, работы в доме' },
  { key: 'REQUESTS', label: 'Заявки', hint: 'Статус ваших обращений' },
  { key: 'PAYMENTS', label: 'Оплата', hint: 'Начисления и подтверждения оплат' },
  { key: 'MEMBERSHIP', label: 'Дом и доступ', hint: 'Решения председателя по вашему членству' },
]

export default function Profile() {
  const { signOut, setHouseId } = useSession()
  const qc = useQueryClient()
  const me = useMe()
  const houses = useHouses()
  const house = useHouse()
  const place = useMyPlace(house?.id)
  const settings = useQuery({ queryKey: ['notification-settings'], queryFn: () => api<Settings>('/me/notification-settings') })
  const toggle = useMutation({
    mutationFn: (patch: Partial<Record<NotificationCategory, boolean>>) => api<Settings>('/me/notification-settings', { method: 'PATCH', body: { push: patch } }),
    onSuccess: (s) => qc.setQueryData(['notification-settings'], s),
  })

  return (
    <Screen bottomInset={TAB_BAR_SPACE}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color.brand100, alignItems: 'center', justifyContent: 'center' }}>
          <T size={22} weight="display" tone="brand">{initials(me.data?.full_name ?? '')}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T size={20} weight="display">{me.data?.full_name}</T>
          <T tone="ink2">{formatPhone(me.data?.phone)}</T>
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {place.data?.identity_verified ? <BadgeCheck size={22} strokeWidth={2.1} color={color.brand600} /> : <ShieldCheck size={22} strokeWidth={2.1} color={color.ink3} />}
          <T weight="semibold" style={{ flex: 1 }}>{place.data?.identity_verified ? 'Личность подтверждена через eGov' : 'Личность не подтверждена'}</T>
        </View>
        {place.data && !place.data.identity_verified && place.data.role === 'RESIDENT' && (
          <Button variant="soft" onPress={() => router.push('/verify')}>Подтвердить</Button>
        )}
        {place.data?.units.map((u) => (
          <View key={u.number} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
            <T>кв. {u.number} · {u.relation === 'OWNER' ? 'собственник' : 'наниматель'}</T>
            <Tag tone={u.can_vote ? 'brand' : 'mute'}>{u.can_vote ? 'голосует' : 'без голоса'}</Tag>
          </View>
        ))}
      </Card>

      {houses.data && houses.data.length > 1 && (
        <Card>
          <H2>Мои дома</H2>
          {houses.data.map((h) => (
            <Pressable key={h.id} accessibilityRole="radio" accessibilityState={{ checked: h.id === house?.id }} onPress={() => setHouseId(h.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: h.id === house?.id ? color.brand50 : color.surface2 }}>
              <Building2 size={19} strokeWidth={2} color={h.id === house?.id ? color.brand700 : color.ink2} />
              <T weight={h.id === house?.id ? 'semibold' : 'body'} style={{ flex: 1 }}>{h.display_name}</T>
            </Pressable>
          ))}
        </Card>
      )}

      <Card>
        <H2>Уведомления</H2>
        {settings.isPending && <Skeleton rows={3} height={52} />}
        {settings.data && CATEGORIES.map((c) => {
          const locked = settings.data.locked.includes(c.key)
          return (
            <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 }}>
              <View style={{ flex: 1 }}>
                <T weight="medium">{c.label}</T>
                <T size={13} tone="ink2">{c.hint}</T>
              </View>
              <Switch
                accessibilityLabel={`Push: ${c.label}`}
                value={settings.data.push[c.key]}
                disabled={locked || toggle.isPending}
                onValueChange={(v) => toggle.mutate({ [c.key]: v })}
                trackColor={{ true: color.brand500, false: color.surface3 }}
                thumbColor={color.white}
              />
            </View>
          )
        })}
        <ErrorNote>{toggle.error?.message ?? settings.error?.message}</ErrorNote>
      </Card>

      <Button variant="soft" icon={LogOut} onPress={() => void signOut().then(() => router.replace('/sign-in'))}>Выйти</Button>
      <T size={12.5} tone="ink3" style={{ textAlign: 'center' }}>Данные хранятся в Казахстане</T>
    </Screen>
  )
}
