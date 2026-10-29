import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import { overviewQuery, remindDebtorsBody, type OverviewQuery, type RemindDebtorsBody } from '@ortaq/shared'
import { HouseScope } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { DebtorsService } from './debtors.service'
import { OverviewService } from './overview.service'

/** Дашборд и должники, docs/03 §12–13 */
@Controller('houses/:houseId')
export class OverviewController {
  constructor(
    private readonly overview: OverviewService,
    private readonly debtors: DebtorsService,
  ) {}

  /** Одна структура для всех: жилец видит те же суммы, что правление */
  @HouseScope('CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT') @Get('finance/overview')
  get(@Query(new ZodPipe(overviewQuery)) q: OverviewQuery) {
    return this.overview.overview(q)
  }

  /** Поимённо — только правлению; жилец получает 403, просмотр пишется в аудит */
  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Get('debtors')
  list() {
    return this.debtors.list()
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Post('debtors/remind') @HttpCode(200)
  remind(@Body(new ZodPipe(remindDebtorsBody)) body: RemindDebtorsBody) {
    return this.debtors.remind(body)
  }
}
