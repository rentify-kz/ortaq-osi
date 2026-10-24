import { describe, expect, it } from 'vitest'
import { normalizeKzPhone } from './schemas.js'

describe('normalizeKzPhone', () => {
  it('normalizes the ways people write a Kazakh mobile number', () => {
    expect(normalizeKzPhone('+7 (707) 123-45-32')).toBe('+77071234532')
    expect(normalizeKzPhone('8 707 123 45 32')).toBe('+77071234532')
    expect(normalizeKzPhone('77071234532')).toBe('+77071234532')
    expect(normalizeKzPhone('7071234532')).toBe('+77071234532')
  })

  it('rejects landlines, foreign and incomplete numbers', () => {
    expect(normalizeKzPhone('+7 727 123 45 67')).toBeNull()
    expect(normalizeKzPhone('+7 916 123 45 67')).toBeNull()
    expect(normalizeKzPhone('+7 707 123 45')).toBeNull()
    expect(normalizeKzPhone('')).toBeNull()
  })
})
