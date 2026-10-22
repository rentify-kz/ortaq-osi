import { ErrorCode } from '@ortaq/shared'

/** Ошибка домена: HTTP-статус, машинный код для клиента и человеческое сообщение */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

/** 404 и для «нет объекта», и для «нет доступа»: 403 подтвердил бы, что объект существует */
export const notFound = (what = 'Объект') => new AppError(404, ErrorCode.NOT_FOUND, `${what} не найден`)
export const forbidden = (message = 'Недостаточно прав') => new AppError(403, ErrorCode.FORBIDDEN, message)
export const unauthenticated = (message = 'Требуется вход') => new AppError(401, ErrorCode.UNAUTHENTICATED, message)
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details)
export const unprocessable = (code: string, message: string, details?: unknown) => new AppError(422, code, message, details)
