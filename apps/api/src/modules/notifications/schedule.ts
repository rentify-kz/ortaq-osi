/**
 * Правила отправки уведомлений (docs/08 §8.11). Чистые функции: время и каналы
 * считаются здесь, рассылкой занимается диспетчер.
 */
export type Priority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'
export type Channel = 'push' | 'sms'

const QUIET_FROM = 22
const QUIET_TO = 8

const almaty = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** Смещение Алматы от UTC в момент `at`, через базу часовых поясов, а не константой */
export function almatyOffsetMs(at: Date): number {
  const p = Object.fromEntries(almaty.formatToParts(at).map((x) => [x.type, Number(x.value)]))
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!)
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/**
 * Когда отправлять push. Тихие часы 22:00–08:00 по Алматы: обычные и несрочные ждут утра,
 * критические и важные уходят сразу — аварийная заявка ночью как раз тот случай, когда будить нужно.
 */
export function deliveryTime(now: Date, priority: Priority): Date {
  if (priority === 'CRITICAL' || priority === 'HIGH') return now
  const offset = almatyOffsetMs(now)
  const local = new Date(now.getTime() + offset)
  const hour = local.getUTCHours()
  if (hour >= QUIET_TO && hour < QUIET_FROM) return now
  const morning = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (hour >= QUIET_FROM ? 1 : 0), QUIET_TO)
  return new Date(morning - offset)
}

/** Каналы по приоритету с учётом настроек: без push остаётся лента в приложении */
export function channelsFor(priority: Priority, pushAllowed: boolean): Channel[] {
  const channels: Channel[] = []
  if (pushAllowed && priority !== 'LOW') channels.push('push')
  if (priority === 'CRITICAL') channels.push('sms')
  return channels
}
