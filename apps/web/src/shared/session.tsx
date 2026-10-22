import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ShieldCheck } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api, ApiError, setSignedOutHandler, setStepUpHandler } from './api/client'
import { ease } from './lib/cn'
import { Btn, ErrorNote, Field, Input } from './ui/kit'

/** Истёкшая сессия посреди работы: обратно на вход, без белого экрана */
export function SignedOutWatcher() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  useEffect(() => {
    setSignedOutHandler(() => {
      qc.setQueryData(['me'], null)
      navigate('/login', { replace: true })
    })
    return () => setSignedOutHandler(null)
  }, [qc, navigate])
  return null
}

/**
 * Подтверждение опасного действия кодом из приложения (step-up, docs/13 §2).
 * Клиент API получает 428, ждёт код здесь и сам повторяет исходный запрос.
 */
export function StepUpGate() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const resolver = useRef<((token: string | null) => void) | null>(null)

  useEffect(() => {
    setStepUpHandler(
      () =>
        new Promise((resolve) => {
          resolver.current = resolve
          setCode('')
          setError('')
          setOpen(true)
        }),
    )
    return () => setStepUpHandler(null)
  }, [])

  const close = (token: string | null) => {
    resolver.current?.(token)
    resolver.current = null
    setOpen(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api<{ step_up_token: string }>('/auth/step-up', { method: 'POST', body: { code } })
      close(res.step_up_token)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось проверить код')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onKeyDown={(e) => e.key === 'Escape' && close(null)}
        >
          <motion.form
            role="dialog" aria-modal="true" aria-labelledby="step-up-title"
            onSubmit={submit}
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease }}
            className="flex w-full max-w-[400px] flex-col gap-4 rounded-[26px] bg-surface p-6"
          >
            <span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700"><ShieldCheck size={22} strokeWidth={2} /></span>
            <div>
              <h2 id="step-up-title" className="font-display text-[20px] font-extrabold tracking-[-0.02em] text-ink">Подтвердите действие</h2>
              <p className="mt-1 text-[14px] text-ink-2">Введите код из приложения-аутентификатора. Подтверждение действует 5 минут.</p>
            </div>
            <Field label="Код из 6 цифр">
              {(id) => (
                <Input id={id} value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric"
                  autoComplete="one-time-code" autoFocus className="nums text-center font-display text-[22px] font-bold" />
              )}
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <div className="flex gap-2">
              <Btn variant="soft" onClick={() => close(null)} className="flex-1">Отмена</Btn>
              <Btn type="submit" loading={busy} disabled={code.length !== 6} className="flex-1">Подтвердить</Btn>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
