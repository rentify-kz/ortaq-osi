import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { generateReportBody, type GenerateReportBody } from '@ortaq/shared'
import { HouseScope, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { ReportsService } from './reports.service'

/** Отчёты, docs/03 §16. Жильцам — только опубликованные; сборка, подпись и публикация — со step-up */
@Controller('houses/:houseId')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @HouseScope('CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT') @Get('reports')
  list() {
    return this.reports.list()
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT') @Get('reports/:reportId')
  detail(@Param('reportId', ParseUUIDPipe) id: string) {
    return this.reports.detail(id)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @StepUp() @Post('reports/generate') @HttpCode(200)
  generate(@Body(new ZodPipe(generateReportBody)) body: GenerateReportBody) {
    return this.reports.generate(body)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @StepUp() @Post('reports/:reportId/sign')
  startSigning(@Param('reportId', ParseUUIDPipe) id: string) {
    return this.reports.startSigning(id)
  }

  /** Без step-up: подпись ЭЦП сама по себе сильнее кода из приложения, а начать её без step-up нельзя */
  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Post('reports/:reportId/sign/complete') @HttpCode(200)
  completeSigning(@Param('reportId', ParseUUIDPipe) id: string) {
    return this.reports.completeSigning(id)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('reports/:reportId/publish') @HttpCode(200)
  publish(@Param('reportId', ParseUUIDPipe) id: string) {
    return this.reports.publish(id)
  }
}
