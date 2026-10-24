import { describe, expect, it } from 'vitest'
import { channelsFor, deliveryTime } from './schedule'

// Алматы — UTC+5: 17:00Z = 22:00 по Алматы, 03:00Z = 08:00
const at = (iso: string) => new Date(iso)

describe('deliveryTime', () => {
  it('sends during the day right away', () => {
    expect(deliveryTime(at('2026-10-24T06:00:00Z'), 'NORMAL')).toEqual(at('2026-10-24T06:00:00Z'))
  })

  it('holds normal and low priority until 08:00 Almaty', () => {
    expect(deliveryTime(at('2026-10-24T17:30:00Z'), 'NORMAL')).toEqual(at('2026-10-25T03:00:00Z'))
    expect(deliveryTime(at('2026-10-24T20:00:00Z'), 'LOW')).toEqual(at('2026-10-25T03:00:00Z'))
    expect(deliveryTime(at('2026-10-24T01:00:00Z'), 'NORMAL')).toEqual(at('2026-10-24T03:00:00Z'))
  })

  it('treats 22:00 as quiet and 08:00 as awake', () => {
    expect(deliveryTime(at('2026-10-24T17:00:00Z'), 'NORMAL')).toEqual(at('2026-10-25T03:00:00Z'))
    expect(deliveryTime(at('2026-10-24T03:00:00Z'), 'NORMAL')).toEqual(at('2026-10-24T03:00:00Z'))
  })

  it('wakes people for critical and high priority', () => {
    expect(deliveryTime(at('2026-10-24T20:00:00Z'), 'CRITICAL')).toEqual(at('2026-10-24T20:00:00Z'))
    expect(deliveryTime(at('2026-10-24T20:00:00Z'), 'HIGH')).toEqual(at('2026-10-24T20:00:00Z'))
  })
})

describe('channelsFor', () => {
  it('maps priority to channels', () => {
    expect(channelsFor('CRITICAL', true)).toEqual(['push', 'sms'])
    expect(channelsFor('HIGH', true)).toEqual(['push'])
    expect(channelsFor('NORMAL', true)).toEqual(['push'])
    expect(channelsFor('LOW', true)).toEqual([])
  })

  it('drops push when the user turned it off, but critical SMS still goes', () => {
    expect(channelsFor('NORMAL', false)).toEqual([])
    expect(channelsFor('CRITICAL', false)).toEqual(['sms'])
  })
})
