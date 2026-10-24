import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { startVerificationBody, type StartVerificationBody } from '@ortaq/shared'
import { Rate } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { VerificationService } from './verification.service'

/** Подтверждение личности, docs/03 §7. Только свои процедуры */
@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Rate('auth') @Post('start')
  start(@Body(new ZodPipe(startVerificationBody)) body: StartVerificationBody) {
    return this.verification.start(body)
  }

  @Get(':id/status')
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.verification.status(id)
  }

  @Rate('auth') @Post(':id/complete') @HttpCode(200)
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.verification.complete(id)
  }
}
