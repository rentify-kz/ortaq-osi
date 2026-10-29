import { ErrorCode } from '@ortaq/shared'
import { conflict } from '../../common/errors'
import type { Tx } from '../../infra/prisma.service'
import { monthName } from './charges.service'

/** Месяц закрыт, если отчёт за него подписан хотя бы одной подписью: подписанные цифры не меняются */
export async function isPeriodClosed(tx: Tx, period: string): Promise<boolean> {
  const r = await tx.report.findFirst({ where: { type: 'MONTHLY', period }, select: { status: true, chairmanSignatureId: true, accountantSignatureId: true } })
  return !!r && (r.status !== 'DRAFT' || !!r.chairmanSignatureId || !!r.accountantSignatureId)
}

export async function assertPeriodOpen(tx: Tx, period: string): Promise<void> {
  if (await isPeriodClosed(tx, period)) {
    throw conflict(ErrorCode.PERIOD_CLOSED, `Отчёт за ${monthName(period)} уже подписан: операции этого месяца не меняются. Внесите исправление текущим месяцем`)
  }
}

