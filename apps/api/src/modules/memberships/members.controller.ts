import { Body, Controller, Delete, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { addMemberBody, type AddMemberBody } from '@ortaq/shared'
import { HouseScope, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { MembersService } from './members.service'

/** Управление ролями, docs/03 §6. Список участников — в HousesController */
@Controller('houses/:houseId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @HouseScope('CHAIRMAN') @StepUp() @Post()
  add(@Body(new ZodPipe(addMemberBody)) body: AddMemberBody) {
    return this.members.addAccountant(body)
  }

  @HouseScope('CHAIRMAN') @StepUp() @Delete(':userId')
  revoke(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.members.revoke(userId)
  }
}
