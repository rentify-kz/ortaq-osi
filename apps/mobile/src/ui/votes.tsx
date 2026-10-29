import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { ChevronRight, Vote } from 'lucide-react-native'
import type { VoteListItem } from '@ortaq/shared'
import { when } from '../lib/format'
import { color, radius, space } from '../theme'
import { T, Tag } from './kit'

export const VOTE_STATUS: Record<string, string> = {
  NOTICE_SENT: 'скоро начнётся', ACTIVE: 'идёт', CLOSED: 'завершено', CANCELLED: 'отменено', DRAFT: 'черновик',
}

export const pct = (p: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(p)}%`
export const m2 = (a: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(a)} м²`

/** До окончания: «3 дн. 4 ч» или «5 ч» */
export function left(iso: string): string {
  const ms = Date.parse(iso) - Date.now()
  if (ms <= 0) return 'срок истёк'
  const h = Math.floor(ms / 3_600_000)
  const d = Math.floor(h / 24)
  return d > 0 ? `${d} дн. ${h % 24} ч` : h > 0 ? `${h} ч` : `${Math.max(1, Math.floor(ms / 60_000))} мин`
}

export function VoteRow({ v }: { v: VoteListItem }) {
  const sub = v.status === 'ACTIVE' && v.ends_at ? `До конца ${left(v.ends_at)}${v.turnout_percent !== null ? ` · явка ${pct(v.turnout_percent)}` : ''}`
    : v.status === 'NOTICE_SENT' && v.starts_at ? `Начнётся ${when(v.starts_at)}`
      : v.protocol?.status === 'PUBLISHED' ? `Протокол №${v.protocol.number} опубликован` : VOTE_STATUS[v.status]!
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={v.title} onPress={() => router.push({ pathname: '/vote/[id]', params: { id: v.id } })}
      style={({ pressed }) => ({ borderRadius: radius.lg, backgroundColor: pressed ? color.surface2 : color.surface, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md })}>
      <Vote size={22} strokeWidth={2} color={v.awaiting_my_ballot ? color.brand600 : color.ink3} />
      <View style={{ flex: 1, gap: 4 }}>
        <T weight="semibold" numberOfLines={2}>{v.title}</T>
        <T size={13.5} tone="ink2">{sub}</T>
        {v.awaiting_my_ballot && <View style={{ flexDirection: 'row' }}><Tag>Ждёт вашего голоса</Tag></View>}
      </View>
      <ChevronRight size={18} strokeWidth={2.2} color={color.ink3} />
    </Pressable>
  )
}
