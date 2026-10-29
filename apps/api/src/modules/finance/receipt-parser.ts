import type { ReceiptFields } from '@ortaq/shared'

const SPACES = /[\s\u00a0\u202f]+/g
const LEGAL_FORMS = new Set(['оси', 'тоо', 'ип', 'ао', 'пт'])
const toAmount = (s: string) => Number(s.replace(SPACES, '').replace(',', '.'))

/**
 * Поля чека из распознанного текста: сумма, дата, номер операции, получатель. Шаблоны —
 * под чеки Kaspi и банковские квитанции; чего не нашли, то null, и это видно председателю.
 */
export function parseReceipt(text: string): { fields: ReceiptFields; confidence: number } {
  const t = text.replace(/\r/g, '')
  const amountMatch =
    t.match(/(?:Сумма(?: платежа| перевода)?|Итого|Оплачено)[^\d\n]{0,20}(\d[\d\s\u00a0\u202f]*(?:[.,]\d{1,2})?)\s*(?:₸|тг|тенге|KZT)/i) ??
    t.match(/(\d[\d\s\u00a0\u202f]*(?:[.,]\d{1,2})?)\s*(?:₸|KZT)/)
  const refMatch = t.match(/(?:№\s*(?:квитанции|чека|операции|транзакции)|Квитанция|Номер (?:операции|чека|квитанции)|ID (?:операции|транзакции))\s*(?:№)?\s*[:#]?\s*([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9\-_/]{3,63})/i)
  const dateMatch = t.match(/(\d{2})\.(\d{2})\.(\d{4})(?:[,\s]+(\d{2}):(\d{2}))?/)
  const recipientMatch = t.match(/(?:Получатель|Продавец|Кому)\s*[:\-—]?\s*([^\n]{2,120})/i)

  const amount = amountMatch ? toAmount(amountMatch[1]!) : null
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T${dateMatch[4] ?? '00'}:${dateMatch[5] ?? '00'}:00+05:00` : null
  const fields: ReceiptFields = {
    amount: amount !== null && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null,
    date,
    ref: refMatch?.[1] ?? null,
    recipient: recipientMatch?.[1]?.trim() ?? null,
  }
  const found = Object.values(fields).filter((v) => v !== null).length
  return { fields, confidence: Math.round((found / 4) * 100) / 100 }
}

/** Сравнение получателя без регистра, кавычек и форм собственности: «ОСИ "Асыл Арман"» ≈ «осы асыл арман» */
export function sameRecipient(a: string, b: string): boolean {
  // \b в JS не видит границ кириллических слов, поэтому формы собственности убираем по словам
  const norm = (s: string) => s.toLowerCase().replace(/["«»'.,]/g, ' ').split(SPACES).filter((w) => w && !LEGAL_FORMS.has(w)).join(' ')
  const x = norm(a)
  const y = norm(b)
  return !!x && !!y && (x.includes(y) || y.includes(x))
}
