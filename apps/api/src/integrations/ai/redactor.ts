import { isValidIinBin } from '@ortaq/shared'

/**
 * Обезличивание перед любым вызовом модели (docs/11 §2). Архитектурный инвариант, а не
 * настройка: провайдер получает текст только через redact(), поэтому новая функция
 * не может случайно отправить ФИО или ИИН наружу.
 */
export type Redaction = { text: string; map: Map<string, string> }

type Rule = { label: string; re: RegExp; accept?: (m: string) => boolean }

const RULES: Rule[] = [
  { label: 'EMAIL', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  // Карта: 13–19 цифр с разделителями
  { label: 'КАРТА', re: /\b(?:\d[ -]?){13,19}\b/g, accept: (m) => m.replace(/\D/g, '').length >= 13 },
  { label: 'ИИН', re: /\b\d{12}\b/g, accept: isValidIinBin },
  { label: 'ТЕЛЕФОН', re: /(?:\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g },
  { label: 'IBAN', re: /\bKZ\d{2}[A-Z0-9]{13}\b/gi },
  // «кв. 45», «квартира 45», «пәтер 45» — номер квартиры однозначно указывает на человека
  { label: 'КВАРТИРА', re: /(кв\.?|квартир[аеуы]?|пәтер)\s*№?\s*\d+[а-яa-z]?/giu },
]

export function redact(input: string, names: string[] = []): Redaction {
  const map = new Map<string, string>()
  const counters = new Map<string, number>()
  const placeholder = (label: string, value: string) => {
    for (const [k, v] of map) if (v.toLowerCase() === value.toLowerCase()) return k
    const n = (counters.get(label) ?? 0) + 1
    counters.set(label, n)
    const key = `[${label}_${n}]`
    map.set(key, value)
    return key
  }

  let text = input
  for (const rule of RULES) {
    text = text.replace(rule.re, (m) => (rule.accept && !rule.accept(m) ? m : placeholder(rule.label, m)))
  }
  // ФИО известных системе людей дома, во всех падежах: «Асанов», «Асанову», «Викторию»
  const parts = [...new Set(names.flatMap((n) => n.split(/\s+/)).filter((p) => p.length >= 3))].sort((a, b) => b.length - a.length)
  for (const part of parts) {
    const re = new RegExp(`(?<![\\p{L}])${escape(stem(part))}\\p{L}{0,3}(?![\\p{L}])`, 'giu')
    text = text.replace(re, (m) => placeholder('ЛИЦО', m))
  }
  return { text, map }
}

/** Обратная подстановка в ответ модели: председатель видит реальные значения, провайдер — нет */
export function restore(text: string, map: Map<string, string>): string {
  let out = text
  for (const [k, v] of map) out = out.split(k).join(v)
  return out
}

/** Основа для склонения: без конечной гласной или мягкого знака («Виктория» → «Виктори») */
function stem(word: string): string {
  return word.length > 3 ? word.replace(/[аяоеёиыуюьй]$/iu, '') : word
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
