import { ErrorCode } from '@ortaq/shared';

/** Ошибка предметной области. Преобразуется фильтром в формат docs/spec/03-api-contract.md §2. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }

  /** Нет объекта или нет доступа — всегда 404, чтобы не раскрывать существование. */
  static notFound(message = 'Не найдено'): AppError {
    return new AppError(404, ErrorCode.NOT_FOUND, message);
  }

  static forbidden(message = 'Недостаточно прав'): AppError {
    return new AppError(403, ErrorCode.FORBIDDEN, message);
  }

  static unauthenticated(message = 'Требуется вход'): AppError {
    return new AppError(401, ErrorCode.UNAUTHENTICATED, message);
  }

  static conflict(code: string, message: string, details?: Record<string, unknown>): AppError {
    return new AppError(409, code, message, details);
  }

  static unprocessable(code: string, message: string, details?: Record<string, unknown>): AppError {
    return new AppError(422, code, message, details);
  }
}
