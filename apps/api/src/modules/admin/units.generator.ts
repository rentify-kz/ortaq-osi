import { MAX_UNITS, type GenerateUnitsBody, type UnitType } from '@ortaq/shared'

export type EntranceLayout = GenerateUnitsBody['entrances'][number]
export type GeneratedUnit = { number: string; entrance: number; floor: number | null; type: UnitType }

export class UnitsLayoutError extends Error {}

/**
 * Разбивка по умолчанию из «N подъездов, M квартир»: сквозная нумерация,
 * остаток достаётся первым подъездам. Это заготовка, а не истина, docs/04 §2.3:
 * реальный дом почти никогда не делится ровно, и админ правит результат.
 */
export function defaultLayout(house: { entranceCount: number; unitCount: number; floorCount: number | null }): EntranceLayout[] {
  const base = Math.floor(house.unitCount / house.entranceCount)
  const extra = house.unitCount % house.entranceCount
  const layout: EntranceLayout[] = []
  let next = 1
  for (let e = 1; e <= house.entranceCount; e++) {
    const size = base + (e <= extra ? 1 : 0)
    if (size === 0) continue
    layout.push({ entrance: e, from: next, to: next + size - 1, floors: house.floorCount ?? 1 })
    next += size
  }
  return layout
}

/** Помещения по разбивке. Этаж — снизу вверх, квартиры распределены по всем этажам равномерно */
export function generateUnits(entrances: EntranceLayout[]): GeneratedUnit[] {
  const seen = new Set<number>()
  const sorted = [...entrances].sort((a, b) => a.from - b.from)
  let total = 0
  sorted.forEach((e, i) => {
    if (e.to < e.from) throw new UnitsLayoutError(`Подъезд ${e.entrance}: номер «до» меньше номера «от»`)
    if (seen.has(e.entrance)) throw new UnitsLayoutError(`Подъезд ${e.entrance} указан дважды`)
    seen.add(e.entrance)
    const prev = sorted[i - 1]
    if (prev && e.from <= prev.to) {
      throw new UnitsLayoutError(`Номера подъездов ${prev.entrance} и ${e.entrance} пересекаются`)
    }
    total += e.to - e.from + 1
  })
  if (total > MAX_UNITS) throw new UnitsLayoutError(`Больше ${MAX_UNITS} помещений в одном доме`)

  return sorted.flatMap((e) => {
    const count = e.to - e.from + 1
    return Array.from({ length: count }, (_, i) => ({
      number: String(e.from + i),
      entrance: e.entrance,
      // 32 квартиры на 9 этажей — по 3–4 на этаж, верхний этаж не пустует
      floor: Math.floor((i * e.floors) / count) + 1,
      type: e.type ?? 'APARTMENT',
    }))
  })
}
