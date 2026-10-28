import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Link2Off } from 'lucide-react-native'
import { api } from '../../lib/api'
import { useSession } from '../../lib/session'
import { color, font, radius, space } from '../../theme'
import { Button, Card, CheckRow, Empty, ErrorNote, Field, IconBadge, Screen, Segmented, Skeleton, T, Title } from '../../ui/kit'

type Resolved = { valid: false } | { valid: true; house_display_name: string; target_role: 'RESIDENT' | 'WORKER' }
type Unit = { number: string; entrance: number | null }
type Accepted = { house_id: string; house_display_name: string; role: 'RESIDENT' | 'WORKER' }

const MAX_SHOWN = 60

/** Ссылку открыли до входа: запоминаем её и ведём на вход по номеру, потом вернёмся сюда */
function RememberAndSignIn({ token }: { token: string }) {
  const { setPendingInvite } = useSession()
  useEffect(() => {
    setPendingInvite(token)
    router.replace('/sign-in')
  }, [token, setPendingInvite])
  return null
}

/**
 * Вступление по ссылке (docs/04 §5.3). Дом зашит в ссылку — жилец выбирает только своё помещение.
 * Голос это не даёт: право голоса появится после подтверждения личности через eGov.
 */
export default function JoinByInvite() {
  const { token = '' } = useLocalSearchParams<{ token: string }>()
  const { status } = useSession()
  if (status === 'signedOut') return <RememberAndSignIn token={token} />
  return <InviteForm token={token} />
}

function InviteForm({ token }: { token: string }) {
  const { setPendingInvite, setHouseId } = useSession()
  const qc = useQueryClient()
  const [unit, setUnit] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [relation, setRelation] = useState<'OWNER' | 'TENANT'>('OWNER')
  const [terms, setTerms] = useState(false)
  const [notifications, setNotifications] = useState(true)

  const resolved = useQuery({ queryKey: ['invite', token], queryFn: () => api<Resolved>(`/invites/resolve/${encodeURIComponent(token)}`) })
  const worker = resolved.data?.valid === true && resolved.data.target_role === 'WORKER'
  const units = useQuery({
    queryKey: ['invite', token, 'units'],
    queryFn: () => api<Unit[]>(`/invites/${encodeURIComponent(token)}/units`),
    enabled: resolved.data?.valid === true && !worker,
  })
  const shown = useMemo(
    () => (units.data ?? []).filter((u) => !query || u.number.toLowerCase().startsWith(query.trim().toLowerCase())).slice(0, MAX_SHOWN),
    [units.data, query],
  )

  const accept = useMutation({
    mutationFn: () => api<Accepted>(`/invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: worker ? { accept_terms: true, notifications } : { unit_number: unit, relation, accept_terms: true, notifications },
    }),
    onSuccess: async (r) => {
      setPendingInvite(null)
      setHouseId(r.house_id)
      await qc.invalidateQueries({ queryKey: ['houses'] })
      router.replace(r.role === 'RESIDENT' ? '/verify' : '/home')
    },
  })

  if (resolved.isPending) return <Screen><Skeleton rows={4} /></Screen>
  if (!resolved.data?.valid) {
    return (
      <Screen>
        <Empty icon={Link2Off} title="Ссылка не работает" text="Её отозвали, у неё истёк срок или закончились активации. Попросите председателя прислать новую." />
        <Button variant="soft" onPress={() => { setPendingInvite(null); router.replace('/join') }}>Найти дом по адресу</Button>
      </Screen>
    )
  }

  const ready = terms && (worker || unit !== null)
  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <IconBadge icon={Building2} tone="brand" />
        <T size={14} tone="ink2" style={{ flex: 1 }}>{worker ? 'Приглашение для персонала' : 'Приглашение в дом'}</T>
      </View>
      <Title sub={worker ? 'Вас добавят в персонал дома: задачи от председателя будут приходить сюда' : 'Выберите своё помещение. Дом уже определён ссылкой'}>
        {resolved.data.house_display_name}
      </Title>

      {!worker && (
        <Card>
          <Field label="Номер помещения" value={query} onChangeText={setQuery} placeholder="Например, 45" />
          {units.isPending ? <Skeleton rows={2} height={48} /> : (
            <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Помещение">
              {shown.map((u) => {
                const on = u.number === unit
                return (
                  <Pressable key={u.number} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Помещение ${u.number}`}
                    onPress={() => setUnit(u.number)} style={[styles.unit, on && { backgroundColor: color.brand600 }]}>
                    <Text style={[styles.unitText, on && { color: color.white }]}>{u.number}</Text>
                  </Pressable>
                )
              })}
              {shown.length === 0 && <T tone="ink2">Такого номера в доме нет</T>}
            </View>
          )}
          <View style={{ gap: 6 }}>
            <T size={13.5} weight="semibold">Кем вы являетесь</T>
            <Segmented label="Кем вы являетесь" value={relation} onChange={setRelation} options={[{ v: 'OWNER', label: 'Собственник' }, { v: 'TENANT', label: 'Наниматель' }]} />
            {relation === 'TENANT' && <T size={13} tone="ink2">Наниматель видит объявления и подаёт заявки, но не голосует: голос принадлежит собственнику</T>}
          </View>
        </Card>
      )}

      <View>
        <CheckRow checked={terms} onChange={setTerms}>
          <T size={14.5}>Принимаю правила сервиса Ortaq</T>
          <T size={13} tone="ink2">Обязательно для вступления в дом</T>
        </CheckRow>
        <CheckRow checked={notifications} onChange={setNotifications}>
          <T size={14.5}>Присылать уведомления</T>
          <T size={13} tone="ink2">Объявления, заявки, оплата. О голосованиях сообщим в любом случае — это требование закона</T>
        </CheckRow>
      </View>

      <ErrorNote>{accept.error?.message}</ErrorNote>
      <Button loading={accept.isPending} disabled={!ready} onPress={() => accept.mutate()}>
        {worker ? 'Присоединиться' : unit ? `Присоединиться, кв. ${unit}` : 'Выберите помещение'}
      </Button>
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  unit: { minWidth: 56, height: 48, paddingHorizontal: space.md, borderRadius: radius.sm, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontFamily: font.displayBold, fontSize: 16, color: color.ink },
})
