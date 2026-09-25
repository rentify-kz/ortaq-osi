import type { TFunction } from 'i18next';
import { ApiError } from './client';

/** Сообщение об ошибке на языке интерфейса; неизвестные коды — общий текст. */
export function errorMessage(t: TFunction, e: unknown): string {
  if (e instanceof ApiError) {
    const key = `errors.${e.code}`;
    const translated = t(key);
    return translated === key ? e.message || t('common.unknownError') : translated;
  }
  return t('common.unknownError');
}
