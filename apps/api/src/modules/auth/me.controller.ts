import { Body, Controller, Get, Patch } from '@nestjs/common';
import { type MeResponse, PatchMeRequest } from '@ortaq/shared';
import { CurrentActor } from '../../common/auth/decorators.js';
import { AppError } from '../../common/errors/app-error.js';
import { ZodPipe } from '../../common/http/zod.pipe.js';
import { DbService } from '../../infra/db/db.service.js';
import type { Actor } from '../../infra/db/request-context.js';
import { AuditService } from '../audit/audit.service.js';

@Controller('me')
export class MeController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async me(@CurrentActor() actor: Actor): Promise<MeResponse> {
    const user = await this.db.tx.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        phone: true,
        full_name: true,
        locale: true,
        is_platform_admin: true,
        memberships: {
          where: { status: 'ACTIVE' },
          select: { house_id: true, role: true, house: { select: { display_name: true } } },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!user) throw AppError.unauthenticated();
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      full_name: user.full_name,
      locale: user.locale,
      is_platform_admin: user.is_platform_admin,
      memberships: user.memberships.map((m) => ({
        house_id: m.house_id,
        house_display_name: m.house.display_name,
        role: m.role,
      })),
    };
  }

  @Patch()
  async patch(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(PatchMeRequest)) body: PatchMeRequest,
  ): Promise<MeResponse> {
    await this.db.tx.user.update({ where: { id: actor.userId }, data: body });
    await this.audit.record({
      action: 'user.update_self',
      entity_type: 'user',
      entity_id: actor.userId,
      house_id: null,
      after: { locale: body.locale },
    });
    return this.me(actor);
  }
}
