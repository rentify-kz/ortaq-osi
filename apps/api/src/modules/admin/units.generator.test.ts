import { describe, expect, it } from 'vitest'
import { defaultLayout, generateUnits, UnitsLayoutError } from './units.generator'

describe('defaultLayout', () => {
  it('splits units evenly across entrances with sequential numbering', () => {
    const layout = defaultLayout({ entranceCount: 4, unitCount: 128, floorCount: 9 })
    expect(layout).toEqual([
      { entrance: 1, from: 1, to: 32, floors: 9 },
      { entrance: 2, from: 33, to: 64, floors: 9 },
      { entrance: 3, from: 65, to: 96, floors: 9 },
      { entrance: 4, from: 97, to: 128, floors: 9 },
    ])
  })

  it('gives the remainder to the first entrances', () => {
    const layout = defaultLayout({ entranceCount: 3, unitCount: 10, floorCount: null })
    expect(layout.map((e) => e.to - e.from + 1)).toEqual([4, 3, 3])
    expect(layout[2]).toMatchObject({ from: 8, to: 10 })
  })
})

describe('generateUnits', () => {
  it('assigns floors bottom-up with an equal number of units per floor', () => {
    const units = generateUnits([{ entrance: 1, from: 1, to: 36, floors: 9 }])
    expect(units).toHaveLength(36)
    expect(units[0]).toEqual({ number: '1', entrance: 1, floor: 1, type: 'APARTMENT' })
    expect(units[3]).toMatchObject({ number: '4', floor: 1 })
    expect(units[4]).toMatchObject({ number: '5', floor: 2 })
    expect(units[35]).toMatchObject({ number: '36', floor: 9 })
  })

  it('uses every floor up to the top when units do not divide evenly', () => {
    const units = generateUnits([{ entrance: 1, from: 1, to: 32, floors: 9 }])
    const floors = new Set(units.map((u) => u.floor))
    expect([...floors].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('keeps the unit type from the entrance', () => {
    const units = generateUnits([{ entrance: 1, from: 1, to: 2, floors: 1, type: 'COMMERCIAL' }])
    expect(units.every((u) => u.type === 'COMMERCIAL')).toBe(true)
  })

  it('rejects overlapping ranges', () => {
    expect(() =>
      generateUnits([
        { entrance: 1, from: 1, to: 32, floors: 9 },
        { entrance: 2, from: 30, to: 64, floors: 9 },
      ]),
    ).toThrow(UnitsLayoutError)
  })

  it('rejects an inverted range and a repeated entrance', () => {
    expect(() => generateUnits([{ entrance: 1, from: 10, to: 1, floors: 9 }])).toThrow(UnitsLayoutError)
    expect(() =>
      generateUnits([
        { entrance: 1, from: 1, to: 5, floors: 2 },
        { entrance: 1, from: 6, to: 9, floors: 2 },
      ]),
    ).toThrow(UnitsLayoutError)
  })

  it('rejects more units than the platform limit', () => {
    expect(() => generateUnits([{ entrance: 1, from: 1, to: 2001, floors: 9 }])).toThrow(UnitsLayoutError)
  })
})
