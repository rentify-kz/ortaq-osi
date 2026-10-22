/**
 * Проверка контрольного разряда ИИН и БИН (12 цифр, общий алгоритм).
 * Первый проход — веса 1..11; если остаток 10, второй проход — веса 3..11, 1, 2.
 * Остаток 10 и во втором проходе означает, что такой номер не выдаётся.
 */
const FIRST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const SECOND = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]

function weighted(digits: number[], weights: number[]): number {
  return weights.reduce((sum, w, i) => sum + w * (digits[i] ?? 0), 0) % 11
}

export function isValidIinBin(value: string): boolean {
  if (!/^\d{12}$/.test(value)) return false
  const digits = [...value].map(Number)
  let control = weighted(digits, FIRST)
  if (control === 10) control = weighted(digits, SECOND)
  if (control === 10) return false
  return control === digits[11]
}
