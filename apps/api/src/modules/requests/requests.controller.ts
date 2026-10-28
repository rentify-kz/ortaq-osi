import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import {
  createRequestBody, mergeRequestBody, rateRequestBody, rejectRequestBody, requestCommentBody, requestListQuery, updateRequestBody,
  type CreateRequestBody, type RequestCommentBody, type UpdateRequestBody,
} from '@ortaq/shared'
import type { z } from 'zod'
import { HouseScope } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { RequestActionsService } from './request-actions.service'
import { RequestsService } from './requests.service'

/** Заявки, docs/03 §8. Пути под домом: членство проверяется до обращения к заявке */
@Controller('houses/:houseId/requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly actions: RequestActionsService,
  ) {}

  @HouseScope() @Get()
  list(@Query(new ZodPipe(requestListQuery)) q: z.input<typeof requestListQuery>) {
    return this.requests.list(q)
  }

  /** Подают жильцы и правление. Работник сообщает о проблеме через председателя */
  @HouseScope('CHAIRMAN', 'ACCOUNTANT', 'RESIDENT') @Post()
  create(@Body(new ZodPipe(createRequestBody)) body: CreateRequestBody) {
    return this.requests.create(body)
  }

  @HouseScope() @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.requests.detail(id)
  }

  @HouseScope() @Get(':id/activity')
  activity(@Param('id', ParseUUIDPipe) id: string) {
    return this.requests.activity(id)
  }

  @HouseScope('CHAIRMAN') @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateRequestBody)) body: UpdateRequestBody) {
    return this.actions.update(id, body)
  }

  @HouseScope('CHAIRMAN') @Post(':id/accept') @HttpCode(200)
  accept(@Param('id', ParseUUIDPipe) id: string) {
    return this.actions.accept(id)
  }

  @HouseScope('CHAIRMAN') @Post(':id/reject') @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(rejectRequestBody)) body: z.infer<typeof rejectRequestBody>) {
    return this.actions.reject(id, body.reason)
  }

  @HouseScope('CHAIRMAN') @Post(':id/merge') @HttpCode(200)
  merge(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(mergeRequestBody)) body: z.infer<typeof mergeRequestBody>) {
    return this.actions.merge(id, body.into_request_id)
  }

  @HouseScope('CHAIRMAN') @Post(':id/close') @HttpCode(200)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.actions.close(id)
  }

  @HouseScope('CHAIRMAN') @Post(':id/ai/suggest') @HttpCode(200)
  suggest(@Param('id', ParseUUIDPipe) id: string) {
    return this.actions.suggest(id)
  }

  @HouseScope() @Post(':id/cancel') @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.actions.cancel(id)
  }

  @HouseScope('RESIDENT') @Post(':id/follow') @HttpCode(200)
  follow(@Param('id', ParseUUIDPipe) id: string) {
    return this.actions.follow(id)
  }

  @HouseScope() @Post(':id/comments')
  comment(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(requestCommentBody)) body: RequestCommentBody) {
    return this.actions.comment(id, body)
  }

  @HouseScope() @Post(':id/rate') @HttpCode(200)
  rate(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(rateRequestBody)) body: z.input<typeof rateRequestBody>) {
    return this.actions.rate(id, body)
  }
}
