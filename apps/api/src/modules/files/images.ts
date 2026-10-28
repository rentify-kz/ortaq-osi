import sharp from 'sharp'

/** Самая длинная сторона после обработки: детали трещины видны, а файл весит сотни килобайт, а не мегабайты */
const MAX_SIDE = 2560
const QUALITY = 82
/** Защита от «пиксельной бомбы»: 8 тысяч на 6 тысяч — больше, чем у любого телефона */
const MAX_PIXELS = 50_000_000

export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp'

/** Тип по сигнатуре содержимого. Расширению и Content-Type от клиента не доверяем (docs/13 §6) */
export function sniffImage(buf: Buffer): SniffedType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export type ProcessedImage = { body: Buffer; width: number; height: number }

/**
 * Перекодирование в JPEG. Заодно три вещи: EXIF с GPS-координатами квартиры жильца
 * не переживает перекодирование; поворот из EXIF применяется к пикселям, поэтому фото
 * не ляжет набок; в итоговом файле нет ничего, кроме растра, — встроенная нагрузка не проходит.
 */
export async function reencodeImage(buf: Buffer): Promise<ProcessedImage> {
  const { data, info } = await sharp(buf, { failOn: 'error', limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { body: data, width: info.width, height: info.height }
}
