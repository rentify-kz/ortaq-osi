import { inflateSync } from 'node:zlib'

/**
 * Распознавание чеков (docs/10 §5, docs/11). В продакшене за интерфейсом — модель с
 * распознаванием изображений; разбор полей из текста общий (receipt-parser.ts).
 */
export const OCR_PROVIDER = Symbol('OCR_PROVIDER')

export type OcrResult = { text: string }

export interface OcrProvider {
  /** null — распознать не удалось или провайдер не умеет этот формат: поля введёт человек */
  read(body: Buffer, mimeType: string): Promise<OcrResult | null>
}

/**
 * Заглушка для разработки: читает текстовый слой PDF (чек из Kaspi, сохранённый файлом,
 * его обычно содержит). Фото чека она не распознаёт — тогда сумму и номер вводит жилец.
 */
export class TextLayerOcrProvider implements OcrProvider {
  async read(body: Buffer, mimeType: string): Promise<OcrResult | null> {
    if (mimeType !== 'application/pdf') return null
    const raw = body.toString('latin1')
    const chunks = [raw]
    for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      try {
        chunks.push(inflateSync(Buffer.from(m[1]!, 'latin1')).toString('latin1'))
      } catch {
        // Несжатый или не FlateDecode поток уже есть в raw
      }
    }
    const lines: string[] = []
    for (const chunk of chunks) {
      for (const m of chunk.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|<FEFF([0-9A-Fa-f]+)>\s*Tj/g)) {
        lines.push(m[1] !== undefined ? literal(m[1]) : Buffer.from(m[2]!, 'hex').swap16().toString('utf16le'))
      }
    }
    const text = lines.join('\n').trim()
    return text ? { text } : null
  }
}

/** Строковый литерал PDF: экранирование и байты UTF-8 */
function literal(s: string): string {
  const unescaped = s.replace(/\\([nrt()\\]|[0-7]{1,3})/g, (_, c: string) =>
    /^[0-7]+$/.test(c) ? String.fromCharCode(parseInt(c, 8)) : ({ n: '\n', r: '\r', t: '\t' } as Record<string, string>)[c] ?? c)
  return Buffer.from(unescaped, 'latin1').toString('utf8')
}
