import type { ApiError as ApiErrorBody } from '@ortaq/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Запрос кода подтверждения у пользователя (модалка step-up). null — пользователь отменил. */
type StepUpHandler = () => Promise<string | null>;

let stepUpHandler: StepUpHandler | null = null;
let stepUp: { token: string; expiresAt: number } | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setStepUpHandler(fn: StepUpHandler | null): void {
  stepUpHandler = fn;
}

export function setSessionExpiredHandler(fn: (() => void) | null): void {
  onSessionExpired = fn;
}

export function rememberStepUp(token: string, expiresAt: string): void {
  // Запас 20 с, чтобы не отправить токен, который истечёт по дороге.
  stepUp = { token, expiresAt: new Date(expiresAt).getTime() - 20_000 };
}

export function clearStepUp(): void {
  stepUp = null;
}

interface Options {
  body?: unknown;
  /** Не пытаться обновить сессию при 401 (эндпоинты входа). */
  noRefresh?: boolean;
  signal?: AbortSignal;
}

/**
 * Токены живут только в httpOnly cookie — JS их не видит (localStorage запрещён, 13-security §2).
 * Изменяющие запросы несут X-Requested-With: защита от CSRF.
 */
export async function api<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = { 'X-Requested-With': 'ortaq-web' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (stepUp && stepUp.expiresAt > Date.now()) headers['X-Step-Up-Token'] = stepUp.token;
    return fetch(`/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  };

  let res = await send();

  if (res.status === 401 && !opts.noRefresh) {
    if (await refreshSession()) res = await send();
    else onSessionExpired?.();
  }

  if (res.status === 428 && stepUpHandler) {
    stepUp = null;
    const token = await stepUpHandler();
    if (token) res = await send();
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Одно обновление на все параллельные запросы. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/v1/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ortaq-web' },
    body: '{}',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  } catch {
    return new ApiError(res.status, `HTTP_${res.status}`, res.statusText);
  }
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>('GET', path, { signal });
export const post = <T>(path: string, body?: unknown, opts: Omit<Options, 'body'> = {}) =>
  api<T>('POST', path, { ...opts, body: body ?? {} });
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, { body });
export const del = <T>(path: string) => api<T>('DELETE', path);
