import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { MAIL_PROVIDER } from './mail/mail.provider.js';
import { MockMailProvider } from './mail/mock-mail.provider.js';
import { SmtpMailProvider } from './mail/smtp-mail.provider.js';
import {
  BREACHED_PASSWORD_CHECKER,
  LocalBreachedPasswordChecker,
} from './password-breach/breached-password.checker.js';
import {
  MockIdentityProvider,
  MockPropertyRegistryProvider,
  MockSignatureProvider,
} from './smart-bridge/mock.providers.js';
import { IDENTITY_PROVIDER, PROPERTY_REGISTRY_PROVIDER, SIGNATURE_PROVIDER } from './smart-bridge/types.js';

function mockOnly<T>(name: string, config: AppConfig, factory: () => T): T {
  if (config.NODE_ENV === 'production') {
    throw new Error(`${name}: mock implementation must not run in production`);
  }
  return factory();
}

/** Выбор реализаций интеграций по конфигурации. Бизнес-логика зависит только от интерфейсов. */
@Global()
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) =>
        c.MAIL_PROVIDER === 'smtp'
          ? new SmtpMailProvider(c.SMTP_URL ?? 'smtp://localhost:1025', c.MAIL_FROM)
          : mockOnly('MAIL_PROVIDER', c, () => new MockMailProvider()),
    },
    { provide: BREACHED_PASSWORD_CHECKER, useClass: LocalBreachedPasswordChecker },
    {
      provide: IDENTITY_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => mockOnly('IDENTITY_PROVIDER', c, () => new MockIdentityProvider()),
    },
    {
      provide: PROPERTY_REGISTRY_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => mockOnly('PROPERTY_REGISTRY_PROVIDER', c, () => new MockPropertyRegistryProvider()),
    },
    {
      provide: SIGNATURE_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => mockOnly('SIGNATURE_PROVIDER', c, () => new MockSignatureProvider()),
    },
  ],
  exports: [MAIL_PROVIDER, BREACHED_PASSWORD_CHECKER, IDENTITY_PROVIDER, PROPERTY_REGISTRY_PROVIDER, SIGNATURE_PROVIDER],
})
export class IntegrationsModule {}
