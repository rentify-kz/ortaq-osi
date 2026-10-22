import { SetMetadata } from '@nestjs/common'
import type { HouseRole } from '@ortaq/shared'

/* Декларативные требования к эндпоинту. Проверяют их глобальные гарды в common/guards.ts */

export const PUBLIC = 'ortaq:public'
/** Без аутентификации */
export const Public = () => SetMetadata(PUBLIC, true)

export const HOUSE_ROLES = 'ortaq:house-roles'
/**
 * Скоуп `house`: дом из параметра :houseId, у вызывающего должно быть активное членство
 * с одной из ролей. Нет членства — 404, роль не та — 403.
 */
export const HouseScope = (...roles: HouseRole[]) => SetMetadata(HOUSE_ROLES, roles)

export const ADMIN = 'ortaq:admin'
/** Админ-панель: только PLATFORM_ADMIN и только из веба (cookie, не Bearer) */
export const AdminOnly = () => SetMetadata(ADMIN, true)

export const STEP_UP = 'ortaq:step-up'
/** Опасное действие: нужен свежий X-Step-Up-Token, иначе 428 */
export const StepUp = () => SetMetadata(STEP_UP, true)

export type RateClass = 'auth' | 'write' | 'read'
export const RATE = 'ortaq:rate'
/** Класс лимита из docs/03 §1. По умолчанию GET — read, остальное — write */
export const Rate = (cls: RateClass) => SetMetadata(RATE, cls)
