import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Response } from 'express'
import { ErrorCode, type ApiError } from '@ortaq/shared'
import { AppError } from './errors'

/** Единый формат ошибок `{ error: { code, message, details } }`, docs/03 §2 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('Error')

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    const [status, body] = this.map(exception)
    if (status >= 500) this.log.error(exception instanceof Error ? exception.stack : String(exception))
    res.status(status).json(body)
  }

  private map(e: unknown): [number, ApiError] {
    if (e instanceof AppError) return [e.status, { error: { code: e.code, message: e.message, details: e.details } }]

    // Уникальность в БД: гонка двух одинаковых запросов, второй получает конфликт
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return [409, { error: { code: ErrorCode.CONFLICT, message: 'Такая запись уже существует' } }]
    }

    if (e instanceof HttpException) {
      const status = e.getStatus()
      const code =
        status === 404 ? ErrorCode.NOT_FOUND
        : status === 429 ? ErrorCode.RATE_LIMITED
        : status === 401 ? ErrorCode.UNAUTHENTICATED
        : status === 403 ? ErrorCode.FORBIDDEN
        : status === 400 ? ErrorCode.VALIDATION
        : 'HTTP_ERROR'
      return [status, { error: { code, message: e.message } }]
    }

    // Внутренности наружу не отдаём: стек и текст SQL остаются в логе
    return [500, { error: { code: 'INTERNAL', message: 'Внутренняя ошибка. Попробуйте позже' } }]
  }
}
