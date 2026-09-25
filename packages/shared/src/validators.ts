import { z } from 'zod';

/** БИН/ИИН: 12 цифр с контрольным разрядом (алгоритм общий для ИИН и БИН). */
export function isValidKzIdNumber(value: string): boolean {
  if (!/^\d{12}$/.test(value)) return false;
  const d = value.split('').map(Number);
  const weights1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const weights2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  let sum = weights1.reduce((acc, w, i) => acc + w * d[i]!, 0);
  let control = sum % 11;
  if (control === 10) {
    sum = weights2.reduce((acc, w, i) => acc + w * d[i]!, 0);
    control = sum % 11;
    if (control === 10) return false;
  }
  return control === d[11];
}

export const Bin = z.string().refine(isValidKzIdNumber, { message: 'Некорректный БИН' });
export const Email = z.string().trim().toLowerCase().email().max(254);
export const Password = z.string().min(12, 'Минимум 12 символов').max(256);
export const TotpCode = z.string().regex(/^\d{6}$/, '6 цифр');
export const Uuid = z.string().uuid();
