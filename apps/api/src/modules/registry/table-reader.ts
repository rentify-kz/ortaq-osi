import ExcelJS from 'exceljs'
import { ErrorCode } from '@ortaq/shared'
import { unprocessable } from '../../common/errors'
import { zipLooksSafe } from './zip-guard'

const invalid = (message: string) => unprocessable(ErrorCode.REGISTRY_INVALID, message)

/** Таблица из файла реестра как строки ячеек. Первый лист XLSX или весь CSV */
export async function readTable(buf: Buffer, fileName: string): Promise<string[][]> {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'csv') return parseCsv(decodeText(buf))
  if (ext === 'xlsx') return readXlsx(buf)
  if (ext === 'xls') throw invalid('Старый формат XLS не поддерживается. Сохраните файл как XLSX или CSV')
  throw invalid('Поддерживаются файлы XLSX и CSV')
}

async function readXlsx(buf: Buffer): Promise<string[][]> {
  if (!zipLooksSafe(buf)) throw invalid('Файл повреждён или это не XLSX')
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buf as unknown as ArrayBuffer)
  } catch {
    throw invalid('Файл повреждён или это не XLSX')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw invalid('В файле нет листов')
  const rows: string[][] = []
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell.value)
    })
    rows.push(Array.from(cells, (c) => c ?? ''))
  })
  return rows
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isInteger(value) ? value.toFixed(0) : String(value)
  if (typeof value === 'string' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if ('richText' in value) return value.richText.map((r) => r.text).join('')
  if ('result' in value) return cellText(value.result as ExcelJS.CellValue)
  if ('text' in value) return String(value.text)
  return ''
}

/** Excel в русской локали сохраняет CSV в Windows-1251. UTF-8 пробуем первым и строго */
function decodeText(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1251').decode(buf)
  }
}

/** CSV по RFC 4180 с кавычками. Разделитель угадываем по первой строке: в русской локали это «;» */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [';', ',', '\t'].reduce((best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best), ';')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function count(s: string, ch: string): number {
  return s.split(ch).length - 1
}
