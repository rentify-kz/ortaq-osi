import { describe, expect, it } from 'vitest'
import { normalizeUnitNumber, parseRegistry } from './registry-parser'
import { parseCsv } from './table-reader'
import { zipLooksSafe } from './zip-guard'

// Валидные ИИН с контрольным разрядом; 050101500040 начинается с нуля
const IIN_A = '900101300126'
const IIN_B = '850615400016'
const IIN_ZERO = '050101500040'

const units = [
  { number: '1', area: null },
  { number: '2', area: '54.30' },
  { number: '12А', area: null },
]
const hash = (iin: string) => `h:${iin}`

describe('parseRegistry', () => {
  it('finds the header under a title, skips the row-number column and hashes IINs', () => {
    const table = [
      ['Реестр собственников ОСИ «Асыл Арман-3»'],
      ['№ п/п', 'Номер помещения', 'ФИО собственника', 'ИИН', 'Площадь, м²', 'Вид собственности'],
      ['1', '1', 'Асанов Данияр Айдарович', IIN_A, '45,6', 'частная'],
      ['2', 'кв. 12а', 'Ким  Виктория', IIN_B, '', 'частная'],
    ]
    const r = parseRegistry(table, units, hash)
    expect(r.issues).toEqual([])
    expect(r.rows).toEqual([
      { row: 3, unit_number: '1', full_name: 'Асанов Данияр Айдарович', iin_hash: `h:${IIN_A}`, area: '45.60' },
      { row: 4, unit_number: '12А', full_name: 'Ким Виктория', iin_hash: `h:${IIN_B}`, area: null },
    ])
    expect(r).toMatchObject({ rowsTotal: 2, unitsCovered: 2, unitsMissing: 1, areaConflicts: 0 })
  })

  it('restores the leading zero Excel drops from IINs of people born in the 2000s', () => {
    const table = [['Квартира', 'ФИО', 'ИИН'], ['1', 'Ли Артём', IIN_ZERO.slice(1)]]
    expect(parseRegistry(table, units, hash).rows[0]!.iin_hash).toBe(`h:${IIN_ZERO}`)
  })

  it('reports errors per row without echoing the IIN', () => {
    const table = [
      ['Номер помещения', 'ФИО', 'ИИН', 'Площадь'],
      ['99', 'Асанов Д.А.', IIN_A, '40'],
      ['1', '', IIN_A, '40'],
      ['1', 'Асанов Д.А.', '900101300125', '40'],
      ['1', 'Асанов Д.А.', IIN_A, 'сорок'],
      ['1', 'Асанов Д.А.', IIN_A, '40'],
      ['', '', '', ''],
    ]
    const r = parseRegistry(table, units, hash)
    expect(r.issues.map((i) => [i.row, i.severity, i.code])).toEqual([
      [2, 'error', 'UNIT_NOT_FOUND'],
      [3, 'error', 'NAME_MISSING'],
      [4, 'error', 'IIN_INVALID'],
      [5, 'warning', 'AREA_INVALID'],
      [6, 'error', 'DUPLICATE'],
    ])
    expect(JSON.stringify(r.issues)).not.toContain('900101300125')
    expect(r.rows).toHaveLength(1)
    expect(r.rowsTotal).toBe(5)
  })

  it('flags area conflicts with entered areas and between co-owners', () => {
    const table = [
      ['Номер помещения', 'ФИО', 'ИИН', 'Площадь'],
      ['2', 'Асанов Д.А.', IIN_A, '60'],
      ['2', 'Асанова Г.К.', IIN_B, '61'],
    ]
    const r = parseRegistry(table, units, hash)
    expect(r.issues.map((i) => i.code)).toEqual(['AREA_CONFLICT', 'AREA_MISMATCH'])
    expect(r.areaConflicts).toBe(1)
    expect(r.rows).toHaveLength(2)
  })

  it('refuses a file without the required columns', () => {
    expect(() => parseRegistry([['Квартира', 'Телефон']], units, hash)).toThrow('Не нашли заголовки')
  })

  it('reads Kazakh headers', () => {
    const table = [['Пәтер нөмірі', 'Иесінің аты-жөні', 'ЖСН', 'Аудан'], ['1', 'Әбілқайыр Ұлан', IIN_A, '45']]
    expect(parseRegistry(table, units, hash).rows).toHaveLength(1)
  })
})

describe('normalizeUnitNumber', () => {
  it('drops prefixes and spaces, uppercases letters', () => {
    expect(normalizeUnitNumber(' кв. 12а ')).toBe('12А')
    expect(normalizeUnitNumber('Помещение 3')).toBe('3')
  })
})

describe('parseCsv', () => {
  it('handles semicolons, quotes and CRLF', () => {
    expect(parseCsv('a;"b; c";"d ""e"""\r\n1;2;3\r\n')).toEqual([['a', 'b; c', 'd "e"'], ['1', '2', '3']])
  })

  it('detects commas', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('zipLooksSafe', () => {
  it('rejects data that is not a zip', () => {
    expect(zipLooksSafe(Buffer.from('not a zip at all, definitely not one'))).toBe(false)
  })

  it('rejects an archive that claims a huge uncompressed size', () => {
    const name = Buffer.from('a.xml')
    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt32LE(500 * 1024 * 1024, 24)
    central.writeUInt16LE(name.length, 28)
    name.copy(central, 46)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(central.length, 12)
    eocd.writeUInt32LE(0, 16)
    expect(zipLooksSafe(Buffer.concat([central, eocd]))).toBe(false)

    central.writeUInt32LE(1024, 24)
    expect(zipLooksSafe(Buffer.concat([central, eocd]))).toBe(true)
  })
})
