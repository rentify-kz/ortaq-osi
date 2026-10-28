import type { Prisma } from '@prisma/client'

export const isBoardRole = (role: string | undefined) => role === 'CHAIRMAN' || role === 'ACCOUNTANT'

/**
 * Кто какие заявки видит (docs/03 §8, docs/07 §7.6). Жилец — свои, те, к которым присоединился,
 * и все по общему имуществу; заявки соседей про их квартиры — личное. Работник — только те,
 * по которым у него задача. Правление — все. Одно правило для списка, карточки и файлов.
 */
export function visibleRequestsWhere(userId: string, role: string | undefined): Prisma.RequestWhereInput {
  const alive: Prisma.RequestWhereInput = { deletedAt: null }
  if (isBoardRole(role)) return alive
  if (role === 'WORKER') return { ...alive, tasks: { some: { assigneeId: userId } } }
  return {
    ...alive,
    OR: [
      { authorId: userId },
      { followers: { some: { userId } } },
      { locationType: { not: 'APARTMENT' } },
    ],
  }
}
