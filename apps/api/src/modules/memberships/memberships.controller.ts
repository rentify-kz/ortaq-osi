import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { z } from 'zod'
import { createInviteBody, JoinRequestStatus, rejectJoinRequestBody, type CreateInviteBody, type RejectJoinRequestBody } from '@ortaq/shared'
import { HouseScope, Public, Rate, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { MembershipsService } from './memberships.service'

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 })
const joinQuery = z.object({ status: z.enum(JoinRequestStatus).default('PENDING') })

/**
 * Онбординг жильцов, docs/03 §6. Отклонение от контракта: отзыв и перевыпуск ссылки
 * идут по пути с :houseId, чтобы дом, как везде, брался из пути и проверялся гардом.
 */
@Controller()
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @HouseScope('CHAIRMAN') @Post('houses/:houseId/invites')
  createInvite(@Body(new ZodPipe(createInviteBody)) body: CreateInviteBody) {
    return this.memberships.createInvite(body)
  }

  @HouseScope('CHAIRMAN') @Get('houses/:houseId/invites')
  invites() {
    return this.memberships.listInvites()
  }

  @HouseScope('CHAIRMAN') @Delete('houses/:houseId/invites/:inviteId')
  revokeInvite(@Param('inviteId', uuid) inviteId: string) {
    return this.memberships.revokeInvite(inviteId)
  }

  @HouseScope('CHAIRMAN') @Post('houses/:houseId/invites/:inviteId/reissue')
  reissueInvite(@Param('inviteId', uuid) inviteId: string) {
    return this.memberships.reissueInvite(inviteId)
  }

  @Public() @Rate('auth') @Get('invites/resolve/:token')
  resolve(@Param('token') token: string) {
    return this.memberships.resolveInvite(token.slice(0, 200))
  }

  @HouseScope('CHAIRMAN') @Get('houses/:houseId/join-requests')
  joinRequests(@Query(new ZodPipe(joinQuery)) q: z.infer<typeof joinQuery>) {
    return this.memberships.listJoinRequests(q.status)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Post('houses/:houseId/join-requests/:requestId/approve') @HttpCode(200)
  approve(@Param('requestId', uuid) requestId: string) {
    return this.memberships.approveJoinRequest(requestId)
  }

  @HouseScope('CHAIRMAN') @Post('houses/:houseId/join-requests/:requestId/reject') @HttpCode(200)
  reject(@Param('requestId', uuid) requestId: string, @Body(new ZodPipe(rejectJoinRequestBody)) body: RejectJoinRequestBody) {
    return this.memberships.rejectJoinRequest(requestId, body.reason)
  }
}
