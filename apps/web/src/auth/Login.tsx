import { useState, type FormEvent } from 'react'
import type { LoginResult } from '@ortaq/shared'
import { api, ApiError } from '../shared/api/client'
import { Btn, ErrorNote, Field, Input } from '../shared/ui/kit'
import { AuthLayout, AuthTitle } from './AuthLayout'
import { useFinishLogin, type Step } from './finish'
import { TwoFactorSetup, TwoFactorVerify } from './TwoFactor'

export function Login() {
  const [step, setStep] = useState<Step>({ kind: 'password' })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const finish = useFinishLogin()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      finish(await api<LoginResult>('/auth/password/login', { method: 'POST', body: { email, password } }), setStep)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      {step.kind === 'password' && (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <AuthTitle title="Вход в кабинет" sub="Для председателей, бухгалтеров и администраторов платформы. Жильцы входят в мобильном приложении по номеру телефона." />
          <Field label="Почта">
            {(id) => <Input id={id} type="email" value={email} onChange={setEmail} autoComplete="username" inputMode="email" autoFocus />}
          </Field>
          <Field label="Пароль">
            {(id) => <Input id={id} type="password" value={password} onChange={setPassword} autoComplete="current-password" />}
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Btn type="submit" size="lg" loading={busy} disabled={!email || !password} full>Продолжить</Btn>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Забыли пароль или потеряли телефон с приложением? Напишите администратору платформы: восстановление идёт через него и записывается в журнал.
          </p>
        </form>
      )}
      {step.kind === 'code' && (
        <TwoFactorVerify challenge={step.challenge} onDone={(r) => finish(r, setStep)} onBack={() => setStep({ kind: 'password' })} />
      )}
      {step.kind === 'setup' && <TwoFactorSetup challenge={step.challenge} onDone={(r) => finish(r, setStep)} />}
    </AuthLayout>
  )
}
