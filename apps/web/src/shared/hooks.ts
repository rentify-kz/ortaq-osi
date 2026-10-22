import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import type { MeResponse } from '@ortaq/shared'
import { api, ApiError, clearStepUp } from './api/client'

/** Текущий пользователь. null — не вошёл; ошибка сети не выкидывает на вход */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<MeResponse>('/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
  })
}

export function useSignOut() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    clearStepUp()
    qc.clear()
    navigate('/login', { replace: true })
  }, [qc, navigate])
}
