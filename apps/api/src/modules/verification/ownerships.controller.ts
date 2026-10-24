import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { rejectOwnershipBody, type RejectOwnershipBody } from '@ortaq/shared'
import { HouseScope, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { OwnershipsService } from './ownerships.service'

/** Очередь ручного подтверждения собственности. Решение меняет право голоса, поэтому step-up */
@Controller('houses/:houseId/ownerships')
export class OwnershipsController {
  constructor(private readonly ownerships: OwnershipsService) {}

  @HouseScope('CHAIRMAN') @Get('pending')
  pending() {
    return this.ownerships.pending()
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post(':id/verify') @HttpCode(200)
  verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.ownerships.verify(id)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post(':id/reject') @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(rejectOwnershipBody)) body: RejectOwnershipBody) {
    return this.ownerships.reject(id, body.reason)
  }
}
