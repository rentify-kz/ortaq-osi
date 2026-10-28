import { Prisma } from '@prisma/client'
import { almatyOffsetMs } from '../notifications/schedule'

/** Дата без времени: в базе `date`, в API — `YYYY-MM-DD` */
export const toDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
export const dateStr = (d: Date): string => d.toISOString().slice(0, 10)

/** Сегодня по Алматы — от него считаются «будущие» операции и текущий месяц */
export function almatyToday(now = new Date()): string {
  return dateStr(new Date(now.getTime() + almatyOffsetMs(now)))
}

export const periodOf = (isoDate: string): string => isoDate.slice(0, 7)

/** Деньги наружу — числом с двумя знаками. Внутри суммы считает база в numeric, не JS */
export const num = (d: Prisma.Decimal | null | undefined): number => (d ? Number(d.toFixed(2)) : 0)
export const dec = (n: number): Prisma.Decimal => new Prisma.Decimal(n.toFixed(2))
