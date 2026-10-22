import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import type { LoginResult } from '@ortaq/shared'
import { homePath } from './home-path'

export type Step = { kind: 'password' } | { kind: 'code'; challenge: string } | { kind: 'setup'; challenge: string }

/** Завершение входа: общее для пароля и для установки пароля по ссылке из письма */
export function useFinishLogin() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return (result: LoginResult, next: (step: Step) => void) => {
    if (result.status === 'OK') {
      qc.setQueryData(['me'], result.user)
      navigate(homePath(result.user), { replace: true })
    } else {
      next({ kind: result.status === '2FA_REQUIRED' ? 'code' : 'setup', challenge: result.challenge })
    }
  }
}
