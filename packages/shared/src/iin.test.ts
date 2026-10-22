import { describe, expect, it } from 'vitest'
import { isValidIinBin } from './iin.js'

describe('isValidIinBin', () => {
  it('accepts numbers whose control digit matches the first weight pass', () => {
    expect(isValidIinBin('850523400125')).toBe(true)
    expect(isValidIinBin('040840000124')).toBe(true)
  })

  it('accepts numbers that need the second weight pass', () => {
    expect(isValidIinBin('100000000205')).toBe(true)
  })

  it('rejects a wrong control digit', () => {
    expect(isValidIinBin('850523400126')).toBe(false)
  })

  it('rejects wrong length and non-digits', () => {
    expect(isValidIinBin('85052340012')).toBe(false)
    expect(isValidIinBin('8505234001255')).toBe(false)
    expect(isValidIinBin('85052340012a')).toBe(false)
    expect(isValidIinBin('')).toBe(false)
  })
})
