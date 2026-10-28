import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { recurringTemplateBody, updateRecurringTemplateBody, type RecurringTemplateBody, type UpdateRecurringTemplateBody } from '@ortaq/shared'
import { z } from 'zod'
import { HouseScope } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { RecurringService } from './recurring.service'

const previewBody = z.object({ rrule: z.string().trim().min(8).max(300) })

/** Шаблоны рутины, docs/03 §9. Создаёт председатель, работник видит только порождённые задачи */
@Controller('houses/:houseId/recurring')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @HouseScope('CHAIRMAN') @Get()
  list() {
    return this.recurring.list()
  }

  /** Ближайшие даты по расписанию — председатель видит, что выбрал, до сохранения */
  @HouseScope('CHAIRMAN') @Post('preview') @HttpCode(200)
  preview(@Body(new ZodPipe(previewBody)) body: z.infer<typeof previewBody>) {
    return this.recurring.preview(body.rrule)
  }

  @HouseScope('CHAIRMAN') @Post()
  create(@Body(new ZodPipe(recurringTemplateBody)) body: RecurringTemplateBody) {
    return this.recurring.create(body)
  }

  @HouseScope('CHAIRMAN') @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateRecurringTemplateBody)) body: UpdateRecurringTemplateBody) {
    return this.recurring.update(id, body)
  }
}
