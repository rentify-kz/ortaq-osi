import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { bulkAreasBody, updateUnitBody, type BulkAreasBody, type UpdateUnitBody } from '@ortaq/shared'
import { HouseScope, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { UnitsService } from './units.service'

/** Правка помещений, docs/03 §5. Площадь — вес голоса, поэтому step-up */
@Controller('houses/:houseId/units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @HouseScope('CHAIRMAN') @StepUp() @Post('bulk-areas') @HttpCode(200)
  bulkAreas(@Body(new ZodPipe(bulkAreasBody)) body: BulkAreasBody) {
    return this.units.bulkAreas(body)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Patch(':unitId')
  update(@Param('unitId', ParseUUIDPipe) unitId: string, @Body(new ZodPipe(updateUnitBody)) body: UpdateUnitBody) {
    return this.units.update(unitId, body)
  }
}
