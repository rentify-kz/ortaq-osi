import { ErrorCode } from '@ortaq/shared'
import { conflict } from '../../common/errors'
import type { Tx } from '../../infra/prisma.service'
import { monthName } from './charges.service'

/** Месяц закрыт, если отчёт за него подписан хотя бы одной подписью: подписанные цифры не меняются */
export async function isPeriodClosed(tx: Tx, period: string): Promise<boolean> {
  // FOR SHARE: запись в месяц и первая подпись (FOR UPDATE той же строки) не проскакивают одновременно
  const rows = await tx.$queryRaw<{ status: string; chairman_signature_id: string | null; accountant_signature_id: string | null }[]>`
    SELECT status, chairman_signature_id, accountant_signature_id FROM reports WHERE type = 'MONTHLY' AND period = ${period} FOR SHARE`
  const r = rows[0]
  return !!r && (r.status !== 'DRAFT' || !!r.chairman_signature_id || !!r.accountant_signature_id)
}

export async function assertPeriodOpen(tx: Tx, period: string): Promise<void> {
  if (await isPeriodClosed(tx, period)) {
    throw conflict(ErrorCode.PERIOD_CLOSED, `Отчёт за ${monthName(period)} уже подписан: операции этого месяца не меняются. Внесите исправление текущим месяцем`)
  }
}

