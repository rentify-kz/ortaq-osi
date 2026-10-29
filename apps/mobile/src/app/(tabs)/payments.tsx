import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Wallet } from 'lucide-react-native'
import type { ChargeView, FinanceOverview, PaymentView, ReportListItem } from '@ortaq/shared'
import { api } from '../../lib/api'
import { CHARGE_STATUS, CHARGE_TYPE, money, month, PAYMENT_STATUS } from '../../lib/labels'
import { useHouse } from '../../lib/session'
import { color, radius, space, TAB_BAR_SPACE } from '../../theme'
import { Card, Empty, ErrorNote, H2, Screen, Skeleton, T, Tag, Title } from '../../ui/kit'

type Mine = { charges: ChargeView[]; due: number; overdue: number }
const OPEN = ['PENDING', 'PARTIALLY_PAID', 'OVERDUE']

function Row({ title, sub, right, tag, onPress }: { title: string; sub: string; right?: string; tag?: { text: string; tone: 'brand' | 'warn' | 'mute' }; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => ({ borderRadius: radius.lg, backgroundColor: pressed ? color.surface2 : color.surface, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md })}>
      <View style={{ flex: 1, gap: 4 }}>
        <T weight="semibold">{title}</T>
        <T size={13.5} tone="ink2">{sub}</T>
        {tag && <View style={{ flexDirection: 'row' }}><Tag tone={tag.tone}>{tag.text}</Tag></View>}
      </View>
      {right && <T weight="semibold">{right}</T>}
      {onPress && <ChevronRight size={18} color={color.ink3} />}
    </Pressable>
  )
}

function Line({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <T size={small ? 13.5 : 15} tone="ink2" style={{ flex: 1 }}>{label}</T>
      <T size={small ? 13.5 : 15} weight={small ? 'body' : 'semibold'}>{value}</T>
    </View>
  )
}

/**
 * Оплата и деньги дома (docs/05, docs/10 §5, §8): свои начисления с оплатой через Kaspi,
 * история оплат и та же картина по дому, что видит председатель, — без поимённых должников.
 */
export default function Payments() {
  const house = useHouse()
  const id = house?.id
  const mine = useQuery({ queryKey: ['house', id, 'my-charges'], queryFn: () => api<Mine>(`/houses/${id}/my-charges`), enabled: !!id })
  const payments = useQuery({ queryKey: ['house', id, 'my-payments'], queryFn: () => api<PaymentView[]>(`/houses/${id}/my-payments`), enabled: !!id })
  const overview = useQuery({ queryKey: ['house', id, 'finance-overview'], queryFn: () => api<FinanceOverview>(`/houses/${id}/finance/overview`), enabled: !!id })
  const reports = useQuery({ queryKey: ['house', id, 'reports'], queryFn: () => api<ReportListItem[]>(`/houses/${id}/reports`), enabled: !!id })
  const refresh = () => void Promise.all([mine.refetch(), payments.refetch(), overview.refetch(), reports.refetch()])
  const open = mine.data?.charges.filter((c) => OPEN.includes(c.status)) ?? []
  const o = overview.data

  return (
    <Screen bottomInset={TAB_BAR_SPACE} refreshing={mine.isRefetching} onRefresh={refresh}>
      <Title sub={house?.display_name}>Оплата</Title>
      {mine.isPending && <Skeleton rows={2} height={88} />}
      <ErrorNote>{mine.error?.message}</ErrorNote>
      {mine.data && mine.data.charges.length > 0 && (
        <Card tone={mine.data.overdue > 0 ? 'warning' : mine.data.due > 0 ? 'surface' : 'brand'}>
          <T size={13.5} tone="ink2">К оплате</T>
          <T size={30} weight="display">{money(mine.data.due)}</T>
          <T size={13.5} tone="ink2">{mine.data.overdue > 0 ? `Из них просрочено ${money(mine.data.overdue)}` : mine.data.due > 0 ? 'Срок — до конца месяца' : 'Всё оплачено'}</T>
        </Card>
      )}
      {mine.data && mine.data.charges.length === 0 && (
        <Empty icon={Wallet} title="Начислений нет" text="Начисления появятся, когда председатель подтвердит вашу собственность и начислит месяц." />
      )}
      {open.map((c) => (
        <Row key={c.id} title={CHARGE_TYPE[c.type] ?? c.title} sub={`${month(c.period)} · №${c.unit.number}`} right={money(c.amount - c.paid_amount)}
          tag={{ text: CHARGE_STATUS[c.status]!, tone: c.status === 'OVERDUE' ? 'warn' : 'mute' }}
          onPress={() => router.push({ pathname: '/pay/[id]', params: { id: c.id } })} />
      ))}

      {(payments.data?.length ?? 0) > 0 && <H2>Мои оплаты</H2>}
      {payments.data?.slice(0, 6).map((p) => (
        <Row key={p.id} title={p.charge.title} sub={p.rejection_reason ? `Не принято: ${p.rejection_reason}` : `№${p.unit.number}`}
          right={money(p.confirmed_amount ?? p.amount)} tag={{ text: PAYMENT_STATUS[p.status]!, tone: p.status === 'CONFIRMED' ? 'brand' : p.status === 'REJECTED' ? 'warn' : 'mute' }} />
      ))}

      {o && (
        <>
          <H2>Деньги дома за {month(o.period)}</H2>
          <Card>
            {o.accounts.map((a) => <Line key={a.type} label={a.type === 'CURRENT' ? 'Текущий счёт' : 'Накопления на капремонт'} value={money(a.balance)} />)}
            <Line label="Поступило" value={money(o.income_total)} />
            <Line label="Потрачено" value={money(o.expense_total)} />
            {o.collection_rate !== null && <Line label="Собрано взносов" value={`${o.collection_rate}%`} />}
            {o.expense_by_category.map((c) => <Line key={c.code} small label={`${c.code} ${c.name}`} value={money(c.amount)} />)}
          </Card>
        </>
      )}

      {(reports.data?.length ?? 0) > 0 && <H2>Отчёты председателя</H2>}
      {reports.data?.map((r) => (
        <Row key={r.id} title={`Отчёт за ${month(r.period)}`} sub="Подписан ЭЦП и опубликован"
          onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })} />
      ))}
    </Screen>
  )
}
