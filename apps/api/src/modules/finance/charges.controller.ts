import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  cancelChargeBody, chargeListQuery, collectionBody, generateChargesBody, period, tariffBody, updateChargeBody,
  type CancelChargeBody, type ChargeListQuery, type CollectionBody, type GenerateChargesBody, type TariffBody, type UpdateChargeBody,
} from '@ortaq/shared'
import { z } from 'zod'
import { HouseScope, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { ChargesService } from './charges.service'

const summaryQuery = z.object({ period })

/** Тарифы и начисления, docs/03 §13. Всё, что меняет суммы к оплате, — председатель и step-up */
@Controller('houses/:houseId')
export class ChargesController {
  constructor(private readonly charges: ChargesService) {}

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Get('tariffs')
  tariffs() {
    return this.charges.tariffs()
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('tariffs')
  createTariff(@Body(new ZodPipe(tariffBody)) body: TariffBody) {
    return this.charges.createTariff(body)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Get('charges')
  list(@Query(new ZodPipe(chargeListQuery)) q: ChargeListQuery) {
    return this.charges.list(q)
  }

  @HouseScope('CHAIRMAN', 'ACCOUNTANT') @Get('charges/summary')
  summary(@Query(new ZodPipe(summaryQuery)) q: z.infer<typeof summaryQuery>) {
    return this.charges.summary(q.period)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('charges/generate') @HttpCode(200)
  generate(@Body(new ZodPipe(generateChargesBody)) body: GenerateChargesBody) {
    return this.charges.generate(body)
  }

  /** Целевой сбор: по решению собрания, начисления сразу по всем подходящим помещениям */
  @HouseScope('CHAIRMAN') @StepUp() @Post('charge-collections')
  createCollection(@Body(new ZodPipe(collectionBody)) body: CollectionBody) {
    return this.charges.createCollection(body)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Patch('charges/:chargeId')
  update(@Param('chargeId', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateChargeBody)) body: UpdateChargeBody) {
    return this.charges.update(id, body)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('charges/:chargeId/cancel') @HttpCode(200)
  cancel(@Param('chargeId', ParseUUIDPipe) id: string, @Body(new ZodPipe(cancelChargeBody)) body: CancelChargeBody) {
    return this.charges.cancel(id, body)
  }

  /** Свои начисления: по помещениям с подтверждённой собственностью. Любая роль — у работника тоже может быть квартира */
  @HouseScope('CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT') @Get('my-charges')
  mine() {
    return this.charges.mine()
  }
}
