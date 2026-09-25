import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AccessGuard } from './common/auth/access.guard.js';
import { TokenService } from './common/auth/token.service.js';
import { CryptoService } from './common/crypto/crypto.service.js';
import { ErrorFilter } from './common/errors/error.filter.js';
import { RequestTxInterceptor } from './common/http/request-tx.interceptor.js';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { DbModule } from './infra/db/db.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { HousesModule } from './modules/houses/houses.module.js';

@Global()
@Module({})
class CoreModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: CoreModule,
      providers: [{ provide: APP_CONFIG, useValue: config }, CryptoService, TokenService],
      exports: [APP_CONFIG, CryptoService, TokenService],
    };
  }
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.forRoot(config), DbModule, AuditModule, IntegrationsModule, AuthModule, AdminModule, HousesModule],
      controllers: [HealthController],
      providers: [
        // Порядок важен: сначала лимиты (до дорогой проверки токена), затем доступ.
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_INTERCEPTOR, useClass: RequestTxInterceptor },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    };
  }
}
