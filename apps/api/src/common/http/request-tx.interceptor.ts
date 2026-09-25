import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom, Observable } from 'rxjs';
import { META, type AuthedRequest } from '../auth/decorators.js';
import { DbService } from '../../infra/db/db.service.js';
import { requestContext, type RequestContext } from '../../infra/db/request-context.js';

/**
 * Оборачивает обработчик в транзакцию с выставленным скоупом (app.current_user_id, app.current_house_id).
 * Все запросы сервиса идут через `db.tx` — RLS отфильтрует чужие дома даже при ошибке в коде.
 * Маршруты /admin/* используют роль app_admin.
 */
@Injectable()
export class RequestTxInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
    const store: RequestContext = {
      actor: req.actor,
      house: req.house,
      ip: req.ip,
      userAgent: req.header('user-agent')?.slice(0, 500),
    };

    if (meta<boolean>(META.noRequestTx)) {
      return new Observable((sub) => requestContext.run(store, () => next.handle().subscribe(sub)));
    }

    const run = (tx: RequestContext['tx']) => {
      store.tx = tx;
      return requestContext.run(store, () => lastValueFrom(next.handle(), { defaultValue: undefined }));
    };
    const userId = req.actor?.userId;
    return from(
      meta<boolean>(META.adminOnly)
        ? this.db.adminTx(userId, run)
        : this.db.scoped({ userId, houseId: req.house?.houseId }, run),
    );
  }
}
