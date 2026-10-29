import { describe, expect, it } from 'vitest'
import { parseReceipt, sameRecipient } from './receipt-parser'

describe('parseReceipt', () => {
  it('reads a Kaspi transfer receipt', () => {
    const { fields, confidence } = parseReceipt('Платёж успешно совершён\nСумма 11 025 ₸\nПолучатель ОСИ «Асыл Арман»\n№ квитанции QR8800123456\nДата и время 28.10.2026 14:22')
    expect(fields).toEqual({ amount: 11025, ref: 'QR8800123456', recipient: 'ОСИ «Асыл Арман»', date: '2026-10-28T14:22:00+05:00' })
    expect(confidence).toBe(1)
  })

  it('handles non-breaking spaces, tiyn and alternative labels', () => {
    const { fields } = parseReceipt('Итого: 6 000,50 тг\nНомер операции: 5521-77A\n01.11.2026')
    expect(fields).toMatchObject({ amount: 6000.5, ref: '5521-77A', date: '2026-11-01T00:00:00+05:00', recipient: null })
  })

  it('returns nulls and zero confidence for unrelated text', () => {
    const { fields, confidence } = parseReceipt('Спасибо за покупку')
    expect(fields).toEqual({ amount: null, date: null, ref: null, recipient: null })
    expect(confidence).toBe(0)
  })
})

describe('sameRecipient', () => {
  it('ignores case, quotes and legal form', () => {
    expect(sameRecipient('ОСИ "Асыл Арман"', 'оси асыл арман')).toBe(true)
    expect(sameRecipient('ОСИ «Асыл Арман»', 'Асыл Арман')).toBe(true)
    expect(sameRecipient('ИП Иванов', 'ОСИ Асыл Арман')).toBe(false)
  })
})
