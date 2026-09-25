import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  AssignChairmanRequest,
  type AuditEntry,
  CreateHouseRequest,
  CreateOrganizationRequest,
  GenerateUnitsRequest,
  type House,
  type HouseReadiness,
  type Organization,
  type Page,
  PageQuery,
  type Unit,
  UpdateHouseRequest,
  UpdateOrganizationRequest,
} from '@ortaq/shared';
import { z } from 'zod';
import { AdminOnly, CurrentActor, StepUp } from '../../common/auth/decorators.js';
import { AppError } from '../../common/errors/app-error.js';
import { ZodPipe } from '../../common/http/zod.pipe.js';
import { DbService } from '../../infra/db/db.service.js';
import type { Actor } from '../../infra/db/request-context.js';
import { AdminService, paginate } from './admin.service.js';
import { ChairmanService } from './chairman.service.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => AppError.notFound() });
const ListQuery = PageQuery.extend({ search: z.string().trim().max(100).optional() });
const HouseListQuery = ListQuery.extend({ organization_id: z.string().uuid().optional() });
const AuditQuery = PageQuery.extend({ house_id: z.string().uuid().optional(), cursor: z.string().regex(/^\d+$/).optional() });

/** docs/spec/03-api-contract.md §4. Только PLATFORM_ADMIN, только веб. Изменения — со step-up. */
@Controller('admin')
@AdminOnly()
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly chairman: ChairmanService,
    private readonly db: DbService,
  ) {}

  @Get('organizations')
  listOrganizations(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>): Promise<Page<Organization>> {
    return this.admin.listOrganizations(q);
  }

  @Post('organizations')
  @StepUp()
  createOrganization(@Body(new ZodPipe(CreateOrganizationRequest)) body: CreateOrganizationRequest): Promise<Organization> {
    return this.admin.createOrganization(body);
  }

  @Patch('organizations/:id')
  @StepUp()
  updateOrganization(
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(UpdateOrganizationRequest)) body: UpdateOrganizationRequest,
  ): Promise<Organization> {
    return this.admin.updateOrganization(id, body);
  }

  @Get('houses')
  listHouses(@Query(new ZodPipe(HouseListQuery)) q: z.infer<typeof HouseListQuery>): Promise<Page<House>> {
    return this.admin.listHouses(q);
  }

  @Post('houses')
  @StepUp()
  createHouse(@Body(new ZodPipe(CreateHouseRequest)) body: CreateHouseRequest): Promise<House> {
    return this.admin.createHouse(body);
  }

  @Get('houses/:id')
  getHouse(@Param('id', uuid) id: string): Promise<House> {
    return this.admin.getHouse(id);
  }

  @Patch('houses/:id')
  @StepUp()
  updateHouse(@Param('id', uuid) id: string, @Body(new ZodPipe(UpdateHouseRequest)) body: UpdateHouseRequest): Promise<House> {
    return this.admin.updateHouse(id, body);
  }

  @Post('houses/:id/generate-units')
  @StepUp()
  @HttpCode(200)
  generateUnits(@Param('id', uuid) id: string, @Body(new ZodPipe(GenerateUnitsRequest)) body: GenerateUnitsRequest): Promise<House> {
    return this.admin.regenerateUnits(id, body.entrances, body.unit_type);
  }

  @Get('houses/:id/units')
  listUnits(@Param('id', uuid) id: string, @Query(new ZodPipe(PageQuery)) q: PageQuery): Promise<Page<Unit>> {
    return this.admin.listUnits(id, q);
  }

  @Get('houses/:id/readiness')
  readiness(@Param('id', uuid) id: string): Promise<HouseReadiness> {
    return this.admin.readiness(id);
  }

  @Post('houses/:id/chairman')
  @StepUp()
  assignChairman(
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(AssignChairmanRequest)) body: AssignChairmanRequest,
    @CurrentActor() actor: Actor,
  ): Promise<{ user_id: string; invite_sent: boolean }> {
    return this.chairman.assign(id, body, actor.userId);
  }

  @Post('houses/:id/chairman/resend-invite')
  @StepUp()
  @HttpCode(204)
  resendChairmanInvite(@Param('id', uuid) id: string): Promise<void> {
    return this.chairman.resendInvite(id);
  }

  @Delete('houses/:id/chairman')
  @StepUp()
  @HttpCode(204)
  revokeChairman(@Param('id', uuid) id: string): Promise<void> {
    return this.chairman.revoke(id);
  }

  /** Журнал аудита. Курсор — seq (порядок цепочки). */
  @Get('audit')
  async audit(@Query(new ZodPipe(AuditQuery)) q: z.infer<typeof AuditQuery>): Promise<Page<AuditEntry>> {
    const rows = await this.db.tx.auditLog.findMany({
      where: { ...(q.house_id ? { house_id: q.house_id } : {}), ...(q.cursor ? { seq: { lt: BigInt(q.cursor) } } : {}) },
      orderBy: { seq: 'desc' },
      take: q.limit + 1,
      select: { id: true, seq: true, house_id: true, actor_id: true, actor_role: true, action: true, entity_type: true, entity_id: true, created_at: true },
    });
    const page = paginate(rows, q.limit, (r) => ({ ...r, seq: r.seq.toString(), created_at: r.created_at.toISOString() }));
    return { items: page.items, next_cursor: page.next_cursor ? page.items[page.items.length - 1]!.seq : null };
  }

  /** Проверка хеш-цепочки. Пустой список — журнал цел. */
  @Get('audit/verify')
  async verifyAudit(): Promise<{ intact: boolean; broken: { house_id: string | null; seq: string }[] }> {
    const rows = await this.db.tx.$queryRaw<{ house_id: string | null; bad_seq: bigint }[]>`SELECT * FROM audit_verify_chain()`;
    return { intact: rows.length === 0, broken: rows.map((r) => ({ house_id: r.house_id, seq: r.bad_seq.toString() })) };
  }
}
