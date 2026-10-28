import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { env, storageProvider } from './config/env'
import { AdminGuard, AuthGuard, HouseGuard, RateLimitGuard, RateLimiter, StepUpGuard } from './common/guards'
import { CryptoService } from './infra/crypto.service'
import { MailerService } from './infra/mailer.service'
import { SmsService } from './infra/sms.service'
import { PrismaService } from './infra/prisma.service'
import { AdminController } from './modules/admin/admin.controller'
import { AdminService } from './modules/admin/admin.service'
import { AuditService } from './modules/audit/audit.service'
import { AuthController } from './modules/auth/auth.controller'
import { AuthService } from './modules/auth/auth.service'
import { OtpService } from './modules/auth/otp.service'
import { PasswordService } from './modules/auth/password.service'
import { SessionsService } from './modules/auth/sessions.service'
import { TokensService } from './modules/auth/tokens.service'
import { TotpService } from './modules/auth/totp.service'
import { HousesController } from './modules/houses/houses.controller'
import { ReadinessService } from './modules/houses/readiness.service'
import { MembershipsController } from './modules/memberships/memberships.controller'
import { MembershipsService } from './modules/memberships/memberships.service'
import { DevEgovController } from './integrations/signature/dev-egov.controller'
import { DevSignatureProvider } from './integrations/signature/dev-signature.provider'
import { SIGNATURE_PROVIDER, type SignatureProvider } from './integrations/signature/signature.provider'
import { OwnershipsController } from './modules/verification/ownerships.controller'
import { OwnershipsService } from './modules/verification/ownerships.service'
import { VerificationController } from './modules/verification/verification.controller'
import { VerificationService } from './modules/verification/verification.service'
import { RegistryMatcher } from './modules/verification/registry-matcher'
import { RegistryController } from './modules/registry/registry.controller'
import { RegistryService } from './modules/registry/registry.service'
import { UnitsController } from './modules/houses/units.controller'
import { UnitsService } from './modules/houses/units.service'
import { MembersController } from './modules/memberships/members.controller'
import { MembersService } from './modules/memberships/members.service'
import { StaffController } from './modules/staff/staff.controller'
import { StaffService } from './modules/staff/staff.service'
import { PushService } from './infra/push.service'
import { AnnouncementsController } from './modules/announcements/announcements.controller'
import { AnnouncementsService } from './modules/announcements/announcements.service'
import { NotificationsController } from './modules/notifications/notifications.controller'
import { NotificationsDispatcher } from './modules/notifications/notifications.dispatcher'
import { NotificationsService } from './modules/notifications/notifications.service'
import { FilesController } from './modules/files/files.controller'
import { FilesService } from './modules/files/files.service'
import { MemoryStorageProvider } from './integrations/storage/memory-storage.provider'
import { S3StorageProvider } from './integrations/storage/s3-storage.provider'
import { STORAGE_PROVIDER, type StorageProvider } from './integrations/storage/storage.provider'
import { DevStorageBootstrap } from './integrations/storage/dev-storage.bootstrap'

/** Провайдер подписи по конфигурации. Адаптер SIGEX появится вместе с договором и тестовым контуром */
function signatureProvider(): SignatureProvider {
  if (env().SIGNATURE_PROVIDER === 'dev') return new DevSignatureProvider()
  throw new Error('SIGNATURE_PROVIDER=sigex: адаптер SIGEX ещё не подключён')
}
const devStandIns = env().SIGNATURE_PROVIDER === 'dev'

function storageProviderFactory(): StorageProvider {
  return storageProvider(env()) === 'memory' ? new MemoryStorageProvider() : new S3StorageProvider(env())
}

@Module({
  imports: [
    JwtModule.register({
      secret: env().JWT_SECRET,
      signOptions: { algorithm: 'HS256', issuer: 'ortaq' },
      verifyOptions: { algorithms: ['HS256'], issuer: 'ortaq' },
    }),
  ],
  controllers: [
    AuthController, AdminController, HousesController, MembershipsController, VerificationController, OwnershipsController,
    UnitsController, RegistryController, MembersController, StaffController,
    AnnouncementsController, NotificationsController, FilesController,
    ...(devStandIns ? [DevEgovController] : []),
  ],
  providers: [
    PrismaService, CryptoService, MailerService, SmsService, RateLimiter, OtpService,
    AuditService, TokensService, PasswordService, TotpService, SessionsService, AuthService,
    ReadinessService, AdminService, MembershipsService, VerificationService, OwnershipsService,
    RegistryMatcher, RegistryService, UnitsService, MembersService, StaffService,
    PushService, NotificationsService, NotificationsDispatcher, AnnouncementsService,
    FilesService, DevStorageBootstrap,
    { provide: STORAGE_PROVIDER, useFactory: storageProviderFactory },
    { provide: SIGNATURE_PROVIDER, useFactory: signatureProvider },
    // Порядок = порядок проверки: кто ты → не превысил ли лимит → админ-панель → дом → step-up
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AdminGuard },
    { provide: APP_GUARD, useClass: HouseGuard },
    { provide: APP_GUARD, useClass: StepUpGuard },
  ],
})
export class AppModule {}
