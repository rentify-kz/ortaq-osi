import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { HouseRole } from '@prisma/client';
import type { Request } from 'express';
import type { Actor, HouseScope } from '../../infra/db/request-context.js';

export const META = {
  public: 'ortaq:public',
  adminOnly: 'ortaq:adminOnly',
  houseRoles: 'ortaq:houseRoles',
  stepUp: 'ortaq:stepUp',
  rateClass: 'ortaq:rateClass',
  noRequestTx: 'ortaq:noRequestTx',
} as const;

/** Без аутентификации. */
export const Public = () => SetMetadata(META.public, true);

/** Только PLATFORM_ADMIN, только веб-сессия через cookie (docs/spec/03-api-contract.md §4). */
export const AdminOnly = () => SetMetadata(META.adminOnly, true);

/**
 * Скоуп дома: `:houseId` из пути + активное членство с одной из ролей.
 * Нет членства или роль не подходит → 404 (не 403), чтобы не раскрывать существование дома.
 * Пустой список — любой член дома.
 */
export const HouseScoped = (...roles: HouseRole[]) => SetMetadata(META.houseRoles, roles);

/** Опасное действие: нужен X-Step-Up-Token, иначе 428 (docs/spec/13-security.md §2). */
export const StepUp = () => SetMetadata(META.stepUp, true);

export type RateClass = 'auth' | 'write' | 'read' | 'ai' | 'upload';
export const RateLimit = (cls: RateClass) => SetMetadata(META.rateClass, cls);

/** Маршрут управляет транзакциями сам (auth: записи о неудачах не должны откатываться). */
export const NoRequestTx = () => SetMetadata(META.noRequestTx, true);

export interface AuthedRequest extends Request {
  actor?: Actor;
  house?: HouseScope;
}

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<AuthedRequest>().actor;
  if (!actor) throw new Error('CurrentActor used on a public route');
  return actor;
});

export const CurrentHouse = createParamDecorator((_: unknown, ctx: ExecutionContext): HouseScope => {
  const house = ctx.switchToHttp().getRequest<AuthedRequest>().house;
  if (!house) throw new Error('CurrentHouse used on a route without @HouseScoped');
  return house;
});
