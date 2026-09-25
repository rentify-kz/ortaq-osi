import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';
import type { HouseRole } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

export interface Actor {
  userId: string;
  sessionId: string;
  client: 'WEB' | 'MOBILE';
  isPlatformAdmin: boolean;
  /** Как пришёл токен: cookie (веб) или Authorization: Bearer (мобильное). */
  via: 'cookie' | 'bearer';
}

export interface HouseScope {
  houseId: string;
  role: HouseRole;
}

export interface RequestContext {
  actor?: Actor;
  house?: HouseScope;
  ip?: string;
  userAgent?: string;
  /** Транзакция запроса с выставленными app.current_user_id / app.current_house_id. */
  tx?: Tx;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return requestContext.getStore();
}
