import { ErrorCode, isValidIinBin, MAX_AREA, MAX_UNITS, type RegistryIssue } from '@ortaq/shared'
import { unprocessable } from '../../common/errors'

/** Строка реестра после разбора. ИИН уже заменён хешем: в базу и в превью сам номер не попадает */
export type RegistryRow = { row: number; unit_number: string; full_name: string; iin_hash: string; area: string | null }

export type ParsedRegistry = {
  rows: RegistryRow[]
  issues: RegistryIssue[]
  rowsTotal: number
  unitsCovered: number
  unitsMissing: number
  areaConflicts: number
}

type Column = 'unit' | 'name' | 'iin' | 'area'

/** Заголовки, как их пишут в реальных реестрах, по-русски и по-казахски */
const IIN_HEADER = /иин|жсн|iin/i
const AREA_HEADER = /площад|аудан|м2|м²/i
const NAME_HEADER = /фио|ф\.\s*и\.\s*о|собственник|владел|аты-жөні|иесі/i
/** «Номер помещения» точнее, чем просто «№»: первый столбец «№ п/п» — это порядковый номер строки */
const UNIT_HEADER = /помещ|квартир|пәтер|^кв\.?(\s|$)/i
const UNIT_HEADER_WEAK = /номер|№/i
const ROW_NUMBER_HEADER = /п\s*\/\s*п/i

const MAX_ROWS = MAX_UNITS * 3
const HEADER_SCAN = 10

export function normalizeUnitNumber(value: string): string {
  return value.trim().replace(/^(квартира|кв\.?|помещение|пом\.?)\s*/i, '').replace(/\s+/g, '').toUpperCase()
}

function findHeader(table: string[][]): { at: number; cols: Record<Column, number> } {
  for (let at = 0; at < Math.min(HEADER_SCAN, table.length); at++) {
    const cols: Partial<Record<Column, number>> = {}
    let exactUnit = false
    table[at]!.forEach((raw, i) => {
      const cell = raw.trim()
      if (!cell || ROW_NUMBER_HEADER.test(cell)) return
      if (cols.iin === undefined && IIN_HEADER.test(cell)) cols.iin = i
      else if (cols.area === undefined && AREA_HEADER.test(cell)) cols.area = i
      else if (cols.name === undefined && NAME_HEADER.test(cell)) cols.name = i
      else if (!exactUnit && UNIT_HEADER.test(cell)) {
        cols.unit = i
        exactUnit = true
      } else if (cols.unit === undefined && UNIT_HEADER_WEAK.test(cell)) cols.unit = i
    })
    if (cols.unit !== undefined && cols.name !== undefined && cols.iin !== undefined) {
      return { at, cols: { area: -1, ...cols } as Record<Column, number> }
    }
  }
  throw unprocessable(ErrorCode.REGISTRY_INVALID, 'Не нашли заголовки столбцов: нужны «Номер помещения», «ФИО» и «ИИН»')
}

/** Excel хранит ИИН числом и теряет ведущий ноль у родившихся в 2000-х */
function normalizeIin(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 && isValidIinBin(`0${digits}`) ? `0${digits}` : digits
}

function parseArea(value: string): string | null | 'invalid' {
  if (value.trim() === '') return null
  const n = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n <= MAX_AREA ? n.toFixed(2) : 'invalid'
}

/**
 * Превью реестра до применения (docs/04 §4.2): несуществующие помещения, некорректные ИИН,
 * дубликаты, расхождения площадей. Ошибка исключает строку, предупреждение — нет.
 */
export function parseRegistry(
  table: string[][],
  units: { number: string; area: string | null }[],
  hashIin: (iin: string) => string,
): ParsedRegistry {
  const { at, cols } = findHeader(table)
  const known = new Map(units.map((u) => [normalizeUnitNumber(u.number), u]))
  const rows: RegistryRow[] = []
  const issues: RegistryIssue[] = []
  const seen = new Set<string>()
  const areaByUnit = new Map<string, string>()
  let rowsTotal = 0
  let areaConflicts = 0

  const data = table.slice(at + 1)
  if (data.length > MAX_ROWS) throw unprocessable(ErrorCode.REGISTRY_INVALID, `В файле больше ${MAX_ROWS} строк`)

  data.forEach((cells, i) => {
    const row = at + i + 2 // номер строки, как его видит человек в Excel
    if (cells.every((c) => c.trim() === '')) return
    rowsTotal++
    const issue = (severity: RegistryIssue['severity'], code: RegistryIssue['code'], message: string) => issues.push({ row, severity, code, message })

    const unitRaw = cells[cols.unit] ?? ''
    const unit = known.get(normalizeUnitNumber(unitRaw))
    const fullName = (cells[cols.name] ?? '').trim().replace(/\s+/g, ' ')
    const iin = normalizeIin(cells[cols.iin] ?? '')

    let failed = false
    if (!unit) {
      issue('error', 'UNIT_NOT_FOUND', unitRaw.trim() ? `Помещения №${unitRaw.trim()} в доме нет` : 'Не указан номер помещения')
      failed = true
    }
    if (!fullName) {
      issue('error', 'NAME_MISSING', 'Не указано ФИО')
      failed = true
    }
    // Сам ИИН в сообщение не попадает: превью хранится в базе
    if (!isValidIinBin(iin)) {
      issue('error', 'IIN_INVALID', 'Некорректный ИИН: нужно 12 цифр с верным контрольным разрядом')
      failed = true
    }
    if (failed || !unit) return

    const key = `${unit.number}|${iin}`
    if (seen.has(key)) {
      issue('error', 'DUPLICATE', `Повтор: этот собственник помещения №${unit.number} уже есть выше`)
      return
    }
    seen.add(key)

    let area = cols.area >= 0 ? parseArea(cells[cols.area] ?? '') : null
    if (area === 'invalid') {
      issue('warning', 'AREA_INVALID', 'Площадь не распознана, строка загрузится без неё')
      area = null
    }
    if (area) {
      const sibling = areaByUnit.get(unit.number)
      if (sibling && sibling !== area) {
        issue('warning', 'AREA_MISMATCH', `У совладельцев помещения №${unit.number} разные площади: ${sibling} и ${area} м²`)
      } else if (!sibling) {
        areaByUnit.set(unit.number, area)
        if (unit.area && Number(unit.area) !== Number(area)) {
          areaConflicts++
          issue('warning', 'AREA_CONFLICT', `Площадь помещения №${unit.number} в реестре ${area} м², уже введено ${Number(unit.area).toFixed(2)} м²`)
        }
      }
    }
    rows.push({ row, unit_number: unit.number, full_name: fullName, iin_hash: hashIin(iin), area })
  })

  const unitsCovered = new Set(rows.map((r) => r.unit_number)).size
  return { rows, issues, rowsTotal, unitsCovered, unitsMissing: units.length - unitsCovered, areaConflicts }
}
