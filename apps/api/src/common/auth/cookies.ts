import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'ortaq_at';
export const REFRESH_COOKIE = 'ortaq_rt';
/** Refresh-cookie уходит только на эндпоинты аутентификации. */
export const REFRESH_COOKIE_PATH = '/v1/auth';

/** Заголовок, по которому мобильный клиент получает токены в теле ответа, а не в cookie. */
export const CLIENT_HEADER = 'x-client';
/** Обязательный заголовок для изменяющих запросов с cookie-сессией: защита от CSRF. */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'ortaq-web';

export function cookieOptions(secure: boolean, maxAgeMs: number, path = '/'): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path, maxAge: maxAgeMs };
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, cookieOptions(secure, 0));
  res.clearCookie(REFRESH_COOKIE, cookieOptions(secure, 0, REFRESH_COOKIE_PATH));
}
