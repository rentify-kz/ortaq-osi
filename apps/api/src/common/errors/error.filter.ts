import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode, type ApiError } from '@ortaq/shared';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './app-error.js';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.map(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(status).json(body);
  }

  private map(e: unknown): [number, ApiError] {
    if (e instanceof AppError) return [e.status, err(e.code, e.message, e.details)];
    if (e instanceof ZodError) {
      const fields = e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return [400, err(ErrorCode.VALIDATION_FAILED, 'Ошибка валидации', { fields })];
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return [409, err(ErrorCode.CONFLICT, 'Запись уже существует')];
      if (e.code === 'P2025') return [404, err(ErrorCode.NOT_FOUND, 'Не найдено')];
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code =
        status === 404 ? ErrorCode.NOT_FOUND : status === 429 ? ErrorCode.RATE_LIMITED : `HTTP_${status}`;
      return [status, err(code, status === 404 ? 'Не найдено' : e.message)];
    }
    return [500, err('INTERNAL', 'Внутренняя ошибка')];
  }
}

function err(code: string, message: string, details?: Record<string, unknown>): ApiError {
  return { error: details ? { code, message, details } : { code, message } };
}
