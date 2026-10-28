import { describe, expect, it } from 'vitest'
import { endOfLocalDay, occurrences, parseRule } from './rrule'

// Алматы — UTC+5: 09:00 по Алматы = 04:00Z
const iso = (dates: Date[]) => dates.map((d) => d.toISOString())

describe('parseRule', () => {
  it('accepts calendar rules and defaults to 9 am', () => {
    expect(parseRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toMatchObject({ byhour: 9, byminute: 0 })
    expect(parseRule('RRULE:FREQ=MONTHLY;BYDAY=1MO;BYHOUR=10')).toMatchObject({ byhour: 10 })
  })

  it('refuses garbage and too frequent schedules', () => {
    expect(parseRule('every day please')).toBeNull()
    expect(parseRule('FREQ=HOURLY')).toBeNull()
    expect(parseRule('FREQ=MINUTELY;INTERVAL=5')).toBeNull()
    expect(parseRule('DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY')).toBeNull()
  })
})

describe('occurrences', () => {
  it('runs on local wall-clock time, weekdays only', () => {
    const rule = parseRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')!
    // Пятница 30 октября 2026 — суббота 31 — воскресенье 1 — понедельник 2 ноября
    const out = occurrences(rule, new Date('2026-10-30T00:00:00Z'), new Date('2026-11-03T00:00:00Z'))
    expect(iso(out)).toEqual(['2026-10-30T04:00:00.000Z', '2026-11-02T04:00:00.000Z'])
  })

  it('handles «first Monday of the month»', () => {
    const out = occurrences(parseRule('FREQ=MONTHLY;BYDAY=1MO')!, new Date('2026-11-01T00:00:00Z'), new Date('2026-12-31T00:00:00Z'))
    expect(iso(out)).toEqual(['2026-11-02T04:00:00.000Z', '2026-12-07T04:00:00.000Z'])
  })

  it('end of the local day is 23:59 in Almaty', () => {
    expect(endOfLocalDay(new Date('2026-10-30T04:00:00Z')).toISOString()).toBe('2026-10-30T18:59:00.000Z')
  })
})
