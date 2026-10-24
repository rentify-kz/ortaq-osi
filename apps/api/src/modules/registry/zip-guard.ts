/**
 * XLSX — это zip. Разбор целиком распаковывает его в память, а 5 МБ архива могут
 * развернуться в гигабайты. До разбора читаем центральный каталог архива и сверяем
 * заявленные размеры с лимитом. Распаковщик exceljs при этом своих лимитов не имеет.
 */
const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const MAX_ENTRIES = 2000
const MAX_UNCOMPRESSED = 100 * 1024 * 1024

export function zipLooksSafe(buf: Buffer): boolean {
  // Конец центрального каталога: последние 22 байта плюс комментарий до 64 КБ
  const from = Math.max(0, buf.length - 22 - 0xffff)
  let eocd = -1
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return false

  const entries = buf.readUInt16LE(eocd + 10)
  const offset = buf.readUInt32LE(eocd + 16)
  // 0xFFFF и 0xFFFFFFFF — признаки zip64: таблице реестра он не нужен
  if (entries === 0xffff || offset === 0xffffffff || entries > MAX_ENTRIES || offset >= buf.length) return false

  let total = 0
  let p = offset
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) return false
    const size = buf.readUInt32LE(p + 24)
    if (size === 0xffffffff) return false
    total += size
    if (total > MAX_UNCOMPRESSED) return false
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
  return true
}
