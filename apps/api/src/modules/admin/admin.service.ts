import { Injectable } from '@nestjs/common';
import { Prisma, type UnitType } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import {
  type CreateHouseRequest,
  type CreateOrganizationRequest,
  type EntranceLayout,
  ErrorCode,
  type House,
  type HouseReadiness,
  type Organization,
  type Page,
  type Unit,
  type UpdateHouseRequest,
  type UpdateOrganizationRequest,
} from '@ortaq/shared';
import { AppError } from '../../common/errors/app-error.js';
import { DbService } from '../../infra/db/db.service.js';
import type { Tx } from '../../infra/db/request-context.js';
import { AuditService } from '../audit/audit.service.js';
import { toHouse, toOrganization, toUnit } from './mappers.js';
import { planUnits } from './unit-layout.js';

/**
 * Провижининг ОСИ и домов админом платформы (docs/spec/04-flows-admin-onboarding.md §2).
 * Работает в транзакции app_admin, открытой интерцептором для /admin/*.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Организации ----------

  async listOrganizations(q: { cursor?: string; limit: number; search?: string }): Promise<Page<Organization>> {
    const rows = await this.db.tx.organization.findMany({
      where: {
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { bin: { startsWith: q.search } }] } : {}),
      },
      include: { _count: { select: { houses: true } } },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
    });
    return paginate(rows, q.limit, toOrganization);
  }

  async createOrganization(input: CreateOrganizationRequest): Promise<Organization> {
    try {
      const org = await this.db.tx.organization.create({
        data: { ...input, bank_details: input.bank_details ?? Prisma.DbNull },
        include: { _count: { select: { houses: true } } },
      });
      await this.audit.record({ action: 'organization.create', entity_type: 'organization', entity_id: org.id, house_id: null, after: { name: org.name, bin: org.bin } });
      return toOrganization(org);
    } catch (e) {
      if (isUniqueViolation(e)) throw AppError.conflict(ErrorCode.ORGANIZATION_BIN_TAKEN, 'Организация с таким БИН уже заведена');
      throw e;
    }
  }

  async updateOrganization(id: string, input: UpdateOrganizationRequest): Promise<Organization> {
    const before = await this.db.tx.organization.findUnique({ where: { id } });
    if (!before) throw AppError.notFound();
    try {
      const org = await this.db.tx.organization.update({
        where: { id },
        data: { ...input, bank_details: input.bank_details === undefined ? undefined : input.bank_details },
        include: { _count: { select: { houses: true } } },
      });
      await this.audit.record({
        action: 'organization.update',
        entity_type: 'organization',
        entity_id: id,
        house_id: null,
        before: pick(before, Object.keys(input)),
        after: pick(org, Object.keys(input)),
      });
      return toOrganization(org);
    } catch (e) {
      if (isUniqueViolation(e)) throw AppError.conflict(ErrorCode.ORGANIZATION_BIN_TAKEN, 'Организация с таким БИН уже заведена');
      throw e;
    }
  }

  // ---------- Дома ----------

  async listHouses(q: { cursor?: string; limit: number; organization_id?: string; search?: string }): Promise<Page<House>> {
    const rows = await this.db.tx.house.findMany({
      where: {
        ...(q.cursor ? { id: { lt: q.cursor } } : {}),
        ...(q.organization_id ? { organization_id: q.organization_id } : {}),
        ...(q.search
          ? { OR: [{ display_name: { contains: q.search, mode: 'insensitive' } }, { address: { contains: q.search, mode: 'insensitive' } }] }
          : {}),
      },
      include: { organization: { select: { name: true } } },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
    });
    return paginate(rows, q.limit, toHouse);
  }

  async getHouse(id: string): Promise<House> {
    const house = await this.db.tx.house.findUnique({ where: { id }, include: { organization: { select: { name: true } } } });
    if (!house) throw AppError.notFound();
    return toHouse(house);
  }

  /** Создание дома сразу генерирует помещения: без них председателю нечего настраивать. */
  async createHouse(input: CreateHouseRequest): Promise<House> {
    const org = await this.db.tx.organization.findUnique({ where: { id: input.organization_id }, select: { id: true } });
    if (!org) throw AppError.notFound('Организация не найдена');

    const plan = planUnits(input);
    if (!plan.ok) throw AppError.unprocessable(ErrorCode.UNIT_LAYOUT_INVALID, plan.reason);

    const house = await this.db.tx.house.create({ data: input, include: { organization: { select: { name: true } } } });
    await this.insertUnits(this.db.tx, house.id, plan.units, 'APARTMENT');
    await this.audit.record({
      action: 'house.create',
      entity_type: 'house',
      entity_id: house.id,
      house_id: house.id,
      after: { organization_id: house.organization_id, display_name: house.display_name, unit_count: house.unit_count },
    });
    return this.getHouse(house.id);
  }

  async updateHouse(id: string, input: UpdateHouseRequest): Promise<House> {
    const before = await this.db.tx.house.findUnique({ where: { id } });
    if (!before) throw AppError.notFound();
    if (input.organization_id && input.organization_id !== before.organization_id) {
      const org = await this.db.tx.organization.findUnique({ where: { id: input.organization_id }, select: { id: true } });
      if (!org) throw AppError.notFound('Организация не найдена');
    }
    await this.db.tx.house.update({ where: { id }, data: input });
    const after = await this.getHouse(id);
    await this.audit.record({
      action: 'house.update',
      entity_type: 'house',
      entity_id: id,
      house_id: id,
      before: pick(before, Object.keys(input)),
      after: pick(after, Object.keys(input)),
    });
    return after;
  }

  /**
   * Перегенерация помещений. Запрещена, если председатель уже ввёл площади: перегенерация их сотрёт.
   * TODO(фазы 1, 3, 4): также запрещать при наличии собственников, начислений и голосований.
   */
  async regenerateUnits(id: string, layout: EntranceLayout[] | undefined, unitType: UnitType): Promise<House> {
    const house = await this.db.tx.house.findUnique({ where: { id } });
    if (!house) throw AppError.notFound();
    const filled = await this.db.tx.unit.count({ where: { house_id: id, area: { not: null } } });
    if (filled > 0) {
      throw AppError.conflict(ErrorCode.UNITS_LOCKED, 'У помещений уже заполнены площади — перегенерация их сотрёт', {
        units_with_area: filled,
      });
    }
    const plan = planUnits(house, layout);
    if (!plan.ok) throw AppError.unprocessable(ErrorCode.UNIT_LAYOUT_INVALID, plan.reason);

    await this.db.tx.unit.deleteMany({ where: { house_id: id } });
    await this.insertUnits(this.db.tx, id, plan.units, unitType);
    const entrances = new Set(plan.units.map((u) => u.entrance)).size;
    await this.db.tx.house.update({ where: { id }, data: { unit_count: plan.units.length, entrance_count: entrances } });
    await this.audit.record({
      action: 'house.units.regenerate',
      entity_type: 'house',
      entity_id: id,
      house_id: id,
      before: { unit_count: house.unit_count, entrance_count: house.entrance_count },
      after: { unit_count: plan.units.length, entrance_count: entrances },
    });
    return this.getHouse(id);
  }

  async listUnits(houseId: string, q: { cursor?: string; limit: number }): Promise<Page<Unit>> {
    const exists = await this.db.tx.house.count({ where: { id: houseId } });
    if (!exists) throw AppError.notFound();
    const rows = await this.db.tx.unit.findMany({
      where: { house_id: houseId, ...(q.cursor ? { id: { gt: q.cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: q.limit + 1,
    });
    return paginate(rows, q.limit, toUnit);
  }

  async readiness(houseId: string): Promise<HouseReadiness> {
    const house = await this.db.tx.house.findUnique({
      where: { id: houseId },
      select: { is_voting_ready: true, registry_uploaded_at: true },
    });
    if (!house) throw AppError.notFound();
    const [areasTotal, areasFilled, chairman] = await Promise.all([
      this.db.tx.unit.count({ where: { house_id: houseId, is_excluded_from_voting: false } }),
      this.db.tx.unit.count({ where: { house_id: houseId, is_excluded_from_voting: false, area: { not: null } } }),
      this.db.tx.houseMembership.findFirst({
        where: { house_id: houseId, role: 'CHAIRMAN', status: 'ACTIVE' },
        select: { user: { select: { status: true } } },
      }),
    ]);

    const issues: string[] = [];
    if (areasTotal === 0) issues.push('Помещения не созданы');
    if (areasTotal > areasFilled) issues.push(`${areasTotal - areasFilled} помещений без указанной площади`);
    if (!chairman) issues.push('Председатель не назначен');
    else if (chairman.user.status !== 'ACTIVE') issues.push('Председатель ещё не активировал учётную запись');

    return {
      units_generated: areasTotal > 0,
      areas_filled: areasFilled,
      areas_total: areasTotal,
      is_voting_ready: house.is_voting_ready,
      registry_uploaded: house.registry_uploaded_at !== null,
      chairman_assigned: chairman !== null,
      chairman_activated: chairman?.user.status === 'ACTIVE',
      // Верификация жильцов появится в фазе 1.
      residents_verified: 0,
      blocking_issues: issues,
    };
  }

  private async insertUnits(tx: Tx, houseId: string, units: { number: string; entrance: number; floor: number | null }[], type: UnitType) {
    // Монотонный генератор UUIDv7: порядок id совпадает с порядком нумерации, на нём строится курсор.
    const rows = units.map((u) => ({ id: uuidv7(), house_id: houseId, number: u.number, entrance: u.entrance, floor: u.floor, type }));
    for (let i = 0; i < rows.length; i += 500) {
      await tx.unit.createMany({ data: rows.slice(i, i + 500) });
    }
  }
}

export function paginate<R extends { id: string }, T>(rows: R[], limit: number, map: (r: R) => T): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items: items.map(map), next_cursor: hasMore ? items[items.length - 1]!.id : null };
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function pick(obj: object, keys: string[]): Record<string, unknown> {
  const src = obj as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => k in src).map((k) => [k, src[k]]));
}
