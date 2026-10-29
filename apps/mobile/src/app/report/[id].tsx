import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck } from 'lucide-react-native'
import type { ReportView } from '@ortaq/shared'
import { api } from '../../lib/api'
import { when } from '../../lib/format'
import { money, month } from '../../lib/labels'
import { useHouse } from '../../lib/session'
import { color, space } from '../../theme'
import { Button, Card, ErrorNote, H2, Screen, Skeleton, T, Title } from '../../ui/kit'
import { PhotoStrip } from '../../ui/photos'

/** Опубликованный отчёт (docs/10 §7): те же строки формы, что подписали председатель и бухгалтер */
export default function Report() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const house = useHouse()
  const q = useQuery({ queryKey: ['house', house?.id, 'report', id], queryFn: () => api<ReportView>(`/houses/${house!.id}/reports/${id}`), enabled: !!house })
  if (!house || q.isPending) return <Screen><Skeleton rows={6} /></Screen>
  if (!q.data) return <Screen><ErrorNote>{q.error?.message}</ErrorNote></Screen>
  const r = q.data
  const signed = [r.signatures.chairman && `председатель ${r.signatures.chairman.name}`, r.signatures.accountant && `бухгалтер ${r.signatures.accountant.name}`].filter(Boolean).join(', ')
  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}><Button variant="soft" icon={ArrowLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/payments'))}>Назад</Button></View>
      <Title sub={r.header.address}>Отчёт за {month(r.period)}</Title>
      <Card tone="brand" style={{ flexDirection: 'row', alignItems: 'center' }}>
        <BadgeCheck size={20} color={color.brand600} />
        <T size={14} style={{ flex: 1 }}>Подписан ЭЦП: {signed}{r.published_at ? `. Опубликован ${when(r.published_at)}` : ''}</T>
      </Card>
      <Card>
        {r.rows.filter((row) => row.amount !== 0 || row.level === 0).map((row) => (
          <View key={row.code} style={{ gap: 2, paddingLeft: row.level * 12 }}>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <T size={13.5} tone={row.level === 0 ? 'ink' : 'ink2'} weight={row.level === 0 ? 'semibold' : 'body'} style={{ flex: 1 }}>{row.code}. {row.label}</T>
              <T size={13.5} weight={row.level === 0 ? 'semibold' : 'body'}>{money(row.amount)}</T>
            </View>
            {row.lines?.map((l, i) => <T key={i} size={12.5} tone="ink3">«{l.payee}»: {money(l.amount)}</T>)}
          </View>
        ))}
      </Card>
      {r.work.length > 0 && <H2>Выполненные работы</H2>}
      {r.work.map((w) => (
        <Card key={w.task_id}>
          <T weight="semibold">{w.title}</T>
          <PhotoStrip houseId={house.id} ids={w.photo_file_ids} />
        </Card>
      ))}
      <T size={12} tone="ink3">{r.legal_source}</T>
    </Screen>
  )
}
