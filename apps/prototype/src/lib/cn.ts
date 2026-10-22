import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/** 1840000 → "1 840 000" (неразрывные пробелы) */
export const money = (n: number) =>
  n.toLocaleString('ru-RU').replace(/\s/g, ' ')

export const ease = [0.22, 1, 0.36, 1] as const
export const spring = { type: 'spring', stiffness: 400, damping: 32 } as const

/** plural(5, ['месяц', 'месяца', 'месяцев']) → 'месяцев' */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
