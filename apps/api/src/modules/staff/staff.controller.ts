import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import {
  contractorBody, staffBody, updateContractorBody, updateStaffBody,
  type ContractorBody, type StaffBody, type UpdateContractorBody, type UpdateStaffBody,
} from '@ortaq/shared'
import { HouseScope } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { StaffService } from './staff.service'

/** Персонал и подрядчики, docs/03 §15. Читают все участники дома, правит председатель */
@Controller('houses/:houseId')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @HouseScope() @Get('staff')
  listStaff() {
    return this.staff.listStaff()
  }

  @HouseScope('CHAIRMAN') @Post('staff')
  createStaff(@Body(new ZodPipe(staffBody)) body: StaffBody) {
    return this.staff.createStaff(body)
  }

  @HouseScope('CHAIRMAN') @Patch('staff/:id')
  updateStaff(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateStaffBody)) body: UpdateStaffBody) {
    return this.staff.updateStaff(id, body)
  }

  @HouseScope() @Get('contractors')
  listContractors() {
    return this.staff.listContractors()
  }

  @HouseScope('CHAIRMAN') @Post('contractors')
  createContractor(@Body(new ZodPipe(contractorBody)) body: ContractorBody) {
    return this.staff.createContractor(body)
  }

  @HouseScope('CHAIRMAN') @Patch('contractors/:id')
  updateContractor(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateContractorBody)) body: UpdateContractorBody) {
    return this.staff.updateContractor(id, body)
  }
}
