import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { CLIENT_HEADER, CSRF_HEADER } from './common/auth/cookies.js';
import { STEP_UP_HEADER } from './common/auth/access.guard.js';
import type { AppConfig } from './config/config.js';

/** Сборка приложения — общая для main.ts и интеграционных тестов. */
export async function createApp(config: AppConfig): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    logger: config.NODE_ENV === 'test' ? ['error', 'warn'] : undefined,
  });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: [...new Set([config.WEB_ORIGIN, config.ADMIN_ORIGIN])],
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', CSRF_HEADER, STEP_UP_HEADER, CLIENT_HEADER],
  });
  app.enableShutdownHooks();
  return app;
}
