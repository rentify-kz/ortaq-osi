import { RRule, type Options } from 'rrule'
import { almatyOffsetMs } from '../notifications/schedule'

/** Чаще раза в день рутина не бывает: почасовое расписание забило бы экран работника */
const ALLOWED_FREQ = new Set([RRule.YEARLY, RRule.MONTHLY, RRule.WEEKLY, RRule.DAILY])
const DEFAULT_HOUR = 9

export type ParsedRule = Partial<Options>

/** null — правило некорректно или слишком частое. Час по умолчанию — 9 утра */
export function parseRule(rule: string): ParsedRule | null {
  let opts: Partial<Options>
  try {
    opts = RRule.parseString(rule.replace(/^RRULE:/i, ''))
  } catch {
    return null
  }
  if (opts.freq === undefined || !ALLOWED_FREQ.has(opts.freq) || opts.dtstart) return null
  return { byhour: DEFAULT_HOUR, byminute: 0, bysecond: 0, ...opts }
}

/**
 * Вхождения расписания между from и to. Правило задано в местном времени дома («каждый будний
 * день в 9:00» — это 9:00 по Алматы), поэтому считаем в «плавающем» времени: часы на стенке
 * кодируются как UTC, а на выходе переводятся в настоящие моменты времени.
 */
export function occurrences(rule: ParsedRule, from: Date, to: Date): Date[] {
  const shift = (d: Date) => new Date(d.getTime() + almatyOffsetMs(d))
  const floatFrom = shift(from)
  const start = new Date(Date.UTC(floatFrom.getUTCFullYear(), floatFrom.getUTCMonth(), floatFrom.getUTCDate() - 1))
  return new RRule({ ...rule, dtstart: start, tzid: null })
    .between(floatFrom, shift(to), true)
    .map((floating) => new Date(floating.getTime() - almatyOffsetMs(floating)))
}

/** Конец местного дня вхождения: рутину «на сегодня» можно сделать до вечера */
export function endOfLocalDay(at: Date): Date {
  const offset = almatyOffsetMs(at)
  const local = new Date(at.getTime() + offset)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 0) - offset)
}
