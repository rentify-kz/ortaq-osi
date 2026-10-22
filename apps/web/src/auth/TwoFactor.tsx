import { useEffect, useState, type FormEvent } from 'react'
import { Copy, Check } from 'lucide-react'
import type { LoginResult, TwoFactorSetupResponse } from '@ortaq/shared'
import { api, ApiError } from '../shared/api/client'
import { Btn, ErrorNote, Field, Input, Skeleton } from '../shared/ui/kit'
import { AuthTitle } from './AuthLayout'

type Done = (result: LoginResult) => void

function CodeField({ code, setCode }: { code: string; setCode: (v: string) => void }) {
  return (
    <Field label="Код из приложения" hint="6 цифр. Код меняется каждые 30 секунд">
      {(id, describedBy) => (
        <Input id={id} describedBy={describedBy} value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="one-time-code" autoFocus className="nums font-display text-[22px] font-bold" />
      )}
    </Field>
  )
}

/** Второй шаг входа: код из приложения-аутентификатора */
export function TwoFactorVerify({ challenge, onDone, onBack }: { challenge: string; onDone: Done; onBack: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onDone(await api<LoginResult>('/auth/2fa/verify', { method: 'POST', body: { challenge, code } }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось проверить код')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <AuthTitle title="Код подтверждения" sub="Откройте приложение-аутентификатор на телефоне и введите код для Ortaq." />
      <CodeField code={code} setCode={setCode} />
      <ErrorNote>{error}</ErrorNote>
      <Btn type="submit" size="lg" loading={busy} disabled={code.length !== 6} full>Войти</Btn>
      <Btn variant="ghost" onClick={onBack} full>Другая почта</Btn>
    </form>
  )
}

/**
 * Обязательное подключение 2FA (docs/04 §3, шаг 6). Без него дальше не пустит:
 * учётка председателя — самая привлекательная цель в системе.
 */
export function TwoFactorSetup({ challenge, onDone }: { challenge: string; onDone: Done }) {
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    api<TwoFactorSetupResponse>('/auth/2fa/setup', { method: 'POST', body: { challenge } })
      .then((s) => alive && setSetup(s))
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : 'Не получилось начать настройку'))
    return () => {
      alive = false
    }
  }, [challenge])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onDone(await api<LoginResult>('/auth/2fa/enable', { method: 'POST', body: { challenge, code } }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось проверить код')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!setup) return
    await navigator.clipboard.writeText(setup.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <AuthTitle
        title="Подключите второй фактор"
        sub="Отсканируйте код в Google Authenticator, Яндекс Ключе или другом приложении и введите 6 цифр, которые оно покажет."
      />
      {setup ? (
        <div className="flex items-center gap-4 rounded-[20px] bg-surface p-4">
          <img src={setup.qr_data_url} alt="QR-код для приложения-аутентификатора" width={132} height={132} className="rounded-[12px]" />
          <div className="min-w-0">
            <p className="text-[13px] text-ink-2">Нет камеры? Введите ключ вручную</p>
            <p className="nums mt-1 break-all font-display text-[14px] font-bold text-ink">{setup.secret}</p>
            <button type="button" onClick={() => void copy()} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-3">
              {copied ? <Check size={15} strokeWidth={2.2} /> : <Copy size={15} strokeWidth={2.2} />}
              {copied ? 'Скопировано' : 'Скопировать ключ'}
            </button>
          </div>
        </div>
      ) : !error && <Skeleton rows={1} />}
      <CodeField code={code} setCode={setCode} />
      <ErrorNote>{error}</ErrorNote>
      <Btn type="submit" size="lg" loading={busy} disabled={code.length !== 6 || !setup} full>Подключить и войти</Btn>
    </form>
  )
}
