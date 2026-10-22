import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { runWithContext } from './common/context'
import { ErrorFilter } from './common/error.filter'
import { env } from './config/env'

/** Общая настройка приложения: одна и та же в main.ts и в интеграционных тестах */
export function configure(app: NestExpressApplication) {
  // IP клиента для лимитов и аудита: доверяем только своему прокси (Vite в разработке, балансировщик в продакшене)
  app.set('trust proxy', 'loopback')
  app.use(helmet())
  app.use(cookieParser())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    runWithContext({ ip: req.ip, userAgent: req.header('user-agent')?.slice(0, 300) }, next)
  })
  app.setGlobalPrefix('v1')
  app.useGlobalFilters(new ErrorFilter())
  // Веб ходит через прокси с того же origin; CORS только для явного адреса фронтенда
  app.enableCors({ origin: env().WEB_ORIGIN, credentials: true })
}
