/**
 * Клиент API. Токены живут в httpOnly cookie, JS их не видит: localStorage для них запрещён (docs/13 §2).
 * Истёкший access обновляется один раз за всех; 428 открывает запрос кода и повторяет действие.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }

  /** Ошибки полей формы из ответа 400 */
  get fields(): Record<string, string> {
    const list = (this.details as { fields?: { path: string; message: string }[] } | undefined)?.fields ?? []
    return Object.fromEntries(list.map((f) => [f.path, f.message]))
  }
}

type StepUpHandler = () => Promise<string | null>

let stepUpHandler: StepUpHandler | null = null
let stepUp: { token: string; until: number } | null = null
let signedOutHandler: (() => void) | null = null
let refreshing: Promise<boolean> | null = null

/** Запрос кода подтверждения рисует корневой компонент StepUpGate */
export function setStepUpHandler(handler: StepUpHandler | null) {
  stepUpHandler = handler
}

export function setSignedOutHandler(handler: (() => void) | null) {
  signedOutHandler = handler
}

export function clearStepUp() {
  stepUp = null
}

function refresh(): Promise<boolean> {
  refreshing ??= fetch('/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }

export async function api<T>(path: string, options: Options = {}, attempt = { refreshed: false, steppedUp: false }): Promise<T> {
  const { method = 'GET', body } = options
  const headers: Record<string, string> = {}
  // Файл уходит multipart: границу частей браузер ставит в заголовок сам
  const form = body instanceof FormData
  if (body !== undefined && !form) headers['content-type'] = 'application/json'
  if (stepUp && stepUp.until > Date.now()) headers['x-step-up-token'] = stepUp.token

  let res: Response
  try {
    res = await fetch(`/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Нет связи с сервером. Проверьте интернет и повторите')
  }

  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => null)
  if (res.ok) return data as T

  const error = (data as { error?: { code: string; message: string; details?: unknown } } | null)?.error ?? {
    code: 'HTTP',
    message: 'Не получилось выполнить запрос',
  }

  if (res.status === 401 && !attempt.refreshed && !path.startsWith('/auth/')) {
    if (await refresh()) return api(path, options, { ...attempt, refreshed: true })
    signedOutHandler?.()
  }

  if (res.status === 428 && !attempt.steppedUp && stepUpHandler) {
    const token = await stepUpHandler()
    if (!token) throw new ApiError(428, 'STEP_UP_CANCELLED', 'Действие отменено')
    // Сервер даёт токену 5 минут; берём с запасом, чтобы не упереться в границу
    stepUp = { token, until: Date.now() + 4.5 * 60_000 }
    return api(path, options, { ...attempt, steppedUp: true })
  }

  throw new ApiError(res.status, error.code, error.message, error.details)
}
