/* eslint-disable react-refresh/only-export-components -- провайдер и хук живут вместе */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { units, NO_AREA, type Unit } from '../../data/chairman'

/** Площади из реестра для помещений, где их не ввели вручную */
const REGISTRY_AREAS: Record<number, number> = { 17: 62.4, 33: 62.4, 48: 55.3, 64: 55.3, 81: 62.4, 97: 62.4, 105: 62.4, 122: 48.7 }

type House = {
  /** Помещения с учётом площадей, внесённых в этой сессии */
  units: Unit[]
  /** Сколько помещений без площади: пока больше нуля, голосования не рассылаются */
  missing: number
  setArea: (flat: number, area: number) => void
  /** Загрузка реестра собственников: площади приходят вместе с ФИО */
  loadRegistry: () => number
}

const Ctx = createContext<House | null>(null)

export function HouseProvider({ children }: { children: ReactNode }) {
  const [areas, setAreas] = useState<Record<number, number>>({})
  const list = units.map((u) => ({ ...u, area: areas[u.flat] ?? u.area }))
  const missing = list.filter((u) => u.area === null).length

  const value: House = {
    units: list,
    missing,
    setArea: (flat, area) => setAreas((a) => ({ ...a, [flat]: area })),
    loadRegistry: () => {
      const filled = NO_AREA.filter((f) => areas[f] === undefined)
      setAreas((a) => ({ ...REGISTRY_AREAS, ...a }))
      return filled.length
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useHouse(): House {
  const house = useContext(Ctx)
  if (!house) throw new Error('useHouse вызван вне HouseProvider')
  return house
}
