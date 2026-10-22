import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { z } from 'zod'
import {
  assignChairmanBody, createHouseBody, createOrganizationBody, generateUnitsBody, updateHouseBody, updateOrganizationBody,
  type AssignChairmanBody, type CreateHouseBody, type CreateOrganizationBody, type GenerateUnitsBody,
  type UpdateHouseBody, type UpdateOrganizationBody,
} from '@ortaq/shared'
import { AdminOnly, StepUp } from '../../common/decorators'
import { ZodPipe } from '../../common/zod.pipe'
import { AdminService } from './admin.service'

const auditQuery = z.object({
  house_id: z.union([z.uuid(), z.literal('global')]).optional(),
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const verifyQuery = z.object({ house_id: z.union([z.uuid(), z.literal('global')]) })

const uuid = new ParseUUIDPipe({ version: '7', errorHttpStatusCode: 404 })

/** Админ-панель платформы, docs/03 §4. Изменения — со step-up, как в контракте */
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('organizations')
  organizations() {
    return this.admin.listOrganizations()
  }

  @StepUp() @Post('organizations')
  createOrganization(@Body(new ZodPipe(createOrganizationBody)) body: CreateOrganizationBody) {
    return this.admin.createOrganization(body)
  }

  @StepUp() @Patch('organizations/:id')
  updateOrganization(@Param('id', uuid) id: string, @Body(new ZodPipe(updateOrganizationBody)) body: UpdateOrganizationBody) {
    return this.admin.updateOrganization(id, body)
  }

  @Get('houses')
  houses() {
    return this.admin.listHouses()
  }

  @StepUp() @Post('houses')
  createHouse(@Body(new ZodPipe(createHouseBody)) body: CreateHouseBody) {
    return this.admin.createHouse(body)
  }

  @Get('houses/:id')
  house(@Param('id', uuid) id: string) {
    return this.admin.getHouse(id)
  }

  @StepUp() @Patch('houses/:id')
  updateHouse(@Param('id', uuid) id: string, @Body(new ZodPipe(updateHouseBody)) body: UpdateHouseBody) {
    return this.admin.updateHouse(id, body)
  }

  @Get('houses/:id/units')
  units(@Param('id', uuid) id: string) {
    return this.admin.listUnits(id)
  }

  @StepUp() @Post('houses/:id/generate-units')
  generateUnits(@Param('id', uuid) id: string, @Body(new ZodPipe(generateUnitsBody)) body: GenerateUnitsBody) {
    return this.admin.regenerateUnits(id, body)
  }

  @Get('houses/:id/readiness')
  async readiness(@Param('id', uuid) id: string) {
    return (await this.admin.getHouse(id)).readiness
  }

  @StepUp() @Post('houses/:id/chairman')
  assignChairman(@Param('id', uuid) id: string, @Body(new ZodPipe(assignChairmanBody)) body: AssignChairmanBody) {
    return this.admin.assignChairman(id, body)
  }

  @StepUp() @Delete('houses/:id/chairman')
  revokeChairman(@Param('id', uuid) id: string) {
    return this.admin.revokeChairman(id)
  }

  @Get('audit')
  audit(@Query(new ZodPipe(auditQuery)) q: z.infer<typeof auditQuery>) {
    return this.admin.listAudit({ houseId: q.house_id, cursor: q.cursor, limit: q.limit })
  }

  @Get('audit/verify')
  verify(@Query(new ZodPipe(verifyQuery)) q: z.infer<typeof verifyQuery>) {
    return this.admin.verifyAudit(q.house_id === 'global' ? null : q.house_id)
  }
}
