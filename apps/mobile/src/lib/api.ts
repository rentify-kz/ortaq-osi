import { refreshStore } from './tokens'

/**
 * Клиент API для приложения жильца. Заголовок X-Client: mobile просит токены в теле ответа
 * вместо cookie; дальше access идёт в Authorization. Истёкший access обновляется
 * один раз на все параллельные запросы — повторный refresh сервер счёл бы кражей.
 */
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/v1'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }

  /** Ошибки полей из ответа 400: путь поля → сообщение */
  get fields(): Record<string, string> {
    const list = (this.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? []
    return Object.fromEntries(list.map((f) => [f.path, f.message]))
  }
}

export type Tokens = { access_token: string; refresh_token: string }

let access: string | null = null
let refreshing: Promise<boolean> | null = null
let onSignedOut: (() => void) | null = null

export function setSignedOutHandler(handler: (() => void) | null) {
  onSignedOut = handler
}

export async function saveTokens(t: Tokens) {
  access = t.access_token
  await refreshStore.set(t.refresh_token)
}

export async function clearTokens() {
  access = null
  await refreshStore.clear()
}

/** Обновить access по сохранённому refresh. false — сессии нет или её отозвали */
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const presented = await refreshStore.get()
    if (!presented) return false
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client': 'mobile' },
        body: JSON.stringify({ refresh_token: presented }),
      })
      if (!res.ok) {
        await clearTokens()
        return false
      }
      await saveTokens((await res.json()) as Tokens)
      return true
    } catch {
      // Нет сети — не повод разлогинивать: токен остаётся, попробуем позже
      return false
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }

export async function api<T>(path: string, options: Options = {}, retried = false): Promise<T> {
  const { method = 'GET', body } = options
  const headers: Record<string, string> = { 'x-client': 'mobile' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (access) headers.authorization = `Bearer ${access}`

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Нет связи с сервером. Проверьте интернет и повторите')
  }

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, options, true)
    onSignedOut?.()
  }
  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => null)
  if (res.ok) return data as T

  const error = (data as { error?: { code: string; message: string; details?: unknown } } | null)?.error
  throw new ApiError(res.status, error?.code ?? 'HTTP', error?.message ?? 'Не получилось выполнить запрос', error?.details)
}
