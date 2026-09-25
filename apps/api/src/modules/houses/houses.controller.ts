import { Controller, Get, Query } from '@nestjs/common';
import { type HouseDetails, type MyHouse, type Page, PageQuery, type Unit } from '@ortaq/shared';
import { CurrentActor, CurrentHouse, HouseScoped } from '../../common/auth/decorators.js';
import { AppError } from '../../common/errors/app-error.js';
import { ZodPipe } from '../../common/http/zod.pipe.js';
import { DbService } from '../../infra/db/db.service.js';
import type { Actor, HouseScope } from '../../infra/db/request-context.js';
import { paginate } from '../admin/admin.service.js';
import { toUnit } from '../admin/mappers.js';

/**
 * docs/spec/03-api-contract.md §5. Все запросы идут через db.tx: транзакция уже несёт скоуп дома,
 * и RLS не вернёт строки другого дома, даже если фильтр по house_id забыт.
 */
@Controller('houses')
export class HousesController {
  constructor(private readonly db: DbService) {}

  /** Дома, где у пользователя активное членство. Источник для переключателя домов. */
  @Get()
  async myHouses(@CurrentActor() actor: Actor): Promise<MyHouse[]> {
    const rows = await this.db.tx.houseMembership.findMany({
      where: { user_id: actor.userId, status: 'ACTIVE' },
      select: { role: true, house: { select: { id: true, display_name: true, address: true } } },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((m) => ({
      id: m.house.id,
      display_name: m.house.display_name,
      address: m.house.address,
      role: m.role,
    }));
  }

  @Get(':houseId')
  @HouseScoped()
  async house(@CurrentHouse() scope: HouseScope): Promise<HouseDetails> {
    const [h, areasTotal, areasFilled] = await Promise.all([
      this.db.tx.house.findUnique({ where: { id: scope.houseId } }),
      this.db.tx.unit.count({ where: { is_excluded_from_voting: false } }),
      this.db.tx.unit.count({ where: { is_excluded_from_voting: false, area: { not: null } } }),
    ]);
    if (!h) throw AppError.notFound();
    return {
      id: h.id,
      display_name: h.display_name,
      address: h.address,
      entrance_count: h.entrance_count,
      unit_count: h.unit_count,
      floor_count: h.floor_count,
      is_voting_ready: h.is_voting_ready,
      areas_filled: areasFilled,
      areas_total: areasTotal,
      registry_uploaded: h.registry_uploaded_at !== null,
      my_role: scope.role,
    };
  }

  @Get(':houseId/units')
  @HouseScoped('CHAIRMAN', 'ACCOUNTANT')
  async units(@Query(new ZodPipe(PageQuery)) q: PageQuery): Promise<Page<Unit>> {
    // Фильтра по дому здесь намеренно нет: его обеспечивает RLS. Тест изоляции это проверяет.
    const rows = await this.db.tx.unit.findMany({
      where: q.cursor ? { id: { gt: q.cursor } } : {},
      orderBy: { id: 'asc' },
      take: q.limit + 1,
    });
    return paginate(rows, q.limit, toUnit);
  }
}
