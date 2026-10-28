import { Linking, Pressable, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Building2, Phone, UserRound } from 'lucide-react-native'
import { api } from '../../lib/api'
import { formatPhone } from '../../lib/format'
import { useHouse } from '../../lib/session'
import { color, radius, space, TAB_BAR_SPACE, TOUCH } from '../../theme'
import { Card, Empty, ErrorNote, H2, Screen, Skeleton, T, Tag, Title } from '../../ui/kit'

type Staff = { id: string; full_name: string; position: string; specializations: string[]; phone_public: string | null; work_schedule: string | null }
type Contractor = { id: string; name: string; specializations: string[]; contact_person: string | null; phone: string | null; contract_to: string | null }

const SPEC: Record<string, string> = {
  PLUMBER: 'сантехник', ELECTRICIAN: 'электрик', CLEANER: 'уборка', YARD_KEEPER: 'дворник',
  HANDYMAN: 'мастер', SECURITY: 'охрана', ELEVATOR: 'лифты', OTHER: 'другое',
}

function CallButton({ phone, who }: { phone: string; who: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Позвонить: ${who}`} onPress={() => void Linking.openURL(`tel:${phone}`)}
      style={({ pressed }) => ({ width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? color.brand100 : color.brand50 })}>
      <Phone size={19} strokeWidth={2.1} color={color.brand700} />
    </Pressable>
  )
}

/** Кто работает в доме (docs/06 §6.5): прозрачность для жильцов — без личных данных персонала */
export default function HouseTab() {
  const house = useHouse()
  const staff = useQuery({ queryKey: ['house', house?.id, 'staff'], queryFn: () => api<Staff[]>(`/houses/${house!.id}/staff`), enabled: !!house })
  const contractors = useQuery({ queryKey: ['house', house?.id, 'contractors'], queryFn: () => api<Contractor[]>(`/houses/${house!.id}/contractors`), enabled: !!house })

  return (
    <Screen bottomInset={TAB_BAR_SPACE} refreshing={staff.isRefetching} onRefresh={() => { void staff.refetch(); void contractors.refetch() }}>
      <Title sub="Кто обслуживает дом и как с ними связаться">Дом</Title>

      <H2>Персонал</H2>
      {staff.isPending && <Skeleton rows={2} />}
      <ErrorNote>{staff.error?.message}</ErrorNote>
      {staff.data?.length === 0 && <Empty icon={UserRound} title="Персонал не указан" text="Председатель ещё не добавил сотрудников дома." />}
      {staff.data?.map((s) => (
        <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T weight="semibold">{s.full_name}</T>
            <T size={14} tone="ink2">{[s.position, s.work_schedule].filter(Boolean).join(' · ')}</T>
            {s.specializations.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {s.specializations.map((x) => <Tag key={x} tone="mute">{SPEC[x] ?? x}</Tag>)}
              </View>
            )}
          </View>
          {s.phone_public && <CallButton phone={s.phone_public} who={s.full_name} />}
        </Card>
      ))}

      <H2>Подрядчики</H2>
      {contractors.isPending && <Skeleton rows={1} />}
      {contractors.data?.length === 0 && <Empty icon={Building2} title="Подрядчиков нет" text="Здесь появятся компании, с которыми у дома договоры." />}
      {contractors.data?.map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, backgroundColor: color.surface, padding: space.lg }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T weight="semibold">{c.name}</T>
            <T size={14} tone="ink2">
              {[c.specializations.map((x) => SPEC[x] ?? x).join(', '), c.contact_person, c.phone && formatPhone(c.phone)].filter(Boolean).join(' · ')}
            </T>
          </View>
          {c.phone && <CallButton phone={c.phone} who={c.name} />}
        </View>
      ))}
    </Screen>
  )
}
