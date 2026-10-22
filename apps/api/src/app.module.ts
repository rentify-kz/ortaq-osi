import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { env } from './config/env'
import { AdminGuard, AuthGuard, HouseGuard, RateLimitGuard, RateLimiter, StepUpGuard } from './common/guards'
import { CryptoService } from './infra/crypto.service'
import { MailerService } from './infra/mailer.service'
import { PrismaService } from './infra/prisma.service'
import { AdminController } from './modules/admin/admin.controller'
import { AdminService } from './modules/admin/admin.service'
import { AuditService } from './modules/audit/audit.service'
import { AuthController } from './modules/auth/auth.controller'
import { AuthService } from './modules/auth/auth.service'
import { PasswordService } from './modules/auth/password.service'
import { SessionsService } from './modules/auth/sessions.service'
import { TokensService } from './modules/auth/tokens.service'
import { TotpService } from './modules/auth/totp.service'
import { HousesController } from './modules/houses/houses.controller'
import { ReadinessService } from './modules/houses/readiness.service'
import { MembershipsController } from './modules/memberships/memberships.controller'
import { MembershipsService } from './modules/memberships/memberships.service'

@Module({
  imports: [
    JwtModule.register({
      secret: env().JWT_SECRET,
      signOptions: { algorithm: 'HS256', issuer: 'ortaq' },
      verifyOptions: { algorithms: ['HS256'], issuer: 'ortaq' },
    }),
  ],
  controllers: [AuthController, AdminController, HousesController, MembershipsController],
  providers: [
    PrismaService, CryptoService, MailerService, RateLimiter,
    AuditService, TokensService, PasswordService, TotpService, SessionsService, AuthService,
    ReadinessService, AdminService, MembershipsService,
    // Порядок = порядок проверки: кто ты → не превысил ли лимит → админ-панель → дом → step-up
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AdminGuard },
    { provide: APP_GUARD, useClass: HouseGuard },
    { provide: APP_GUARD, useClass: StepUpGuard },
  ],
})
export class AppModule {}
