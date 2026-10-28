import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MeResponse } from '@ortaq/shared'
import { api, clearTokens, refresh, saveTokens, setSignedOutHandler, type Tokens } from './api'

type Status = 'loading' | 'signedOut' | 'signedIn'

type Session = {
  status: Status
  signIn: (tokens: Tokens) => Promise<void>
  signOut: () => Promise<void>
  houseId: string | null
  setHouseId: (id: string) => void
  /** Ссылка-приглашение, открытая до входа: после входа по номеру продолжаем с неё */
  pendingInvite: string | null
  setPendingInvite: (token: string | null) => void
}

const Ctx = createContext<Session | null>(null)

/** Сессия жильца: восстанавливается по refresh-токену при запуске, иначе — экран входа */
export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<Status>('loading')
  const [houseId, setHouseId] = useState<string | null>(null)
  const [pendingInvite, setPendingInvite] = useState<string | null>(null)

  useEffect(() => {
    void refresh().then((ok) => setStatus(ok ? 'signedIn' : 'signedOut'))
  }, [])

  const reset = useCallback(async () => {
    await clearTokens()
    qc.clear()
    setHouseId(null)
    setStatus('signedOut')
  }, [qc])

  useEffect(() => {
    setSignedOutHandler(() => void reset())
    return () => setSignedOutHandler(null)
  }, [reset])

  const value = useMemo<Session>(() => ({
    status,
    houseId,
    setHouseId,
    pendingInvite,
    setPendingInvite,
    signIn: async (tokens) => {
      await saveTokens(tokens)
      setStatus('signedIn')
    },
    signOut: async () => {
      // Выход отзывает всю цепочку refresh этого устройства на сервере
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
      await reset()
    },
  }), [status, houseId, pendingInvite, reset])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession вне SessionProvider')
  return s
}

export type House = { id: string; display_name: string; address: string; entrance_count: number; role: string }
export type MyPlace = {
  role: string
  identity_verified: boolean
  units: { number: string; entrance: number | null; floor: number | null; relation: 'OWNER' | 'TENANT'; verification: 'PENDING' | 'VERIFIED' | 'REJECTED'; can_vote: boolean }[]
}

export function useMe() {
  const { status } = useSession()
  return useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/me'), enabled: status === 'signedIn' })
}

export function useHouses() {
  const { status } = useSession()
  return useQuery({ queryKey: ['houses'], queryFn: () => api<House[]>('/houses'), enabled: status === 'signedIn' })
}

/** Текущий дом: выбранный в профиле или первый из списка */
export function useHouse(): House | null {
  const { houseId } = useSession()
  const houses = useHouses()
  return houses.data?.find((h) => h.id === houseId) ?? houses.data?.[0] ?? null
}

export function useMyPlace(houseId: string | undefined) {
  return useQuery({ queryKey: ['house', houseId, 'me'], queryFn: () => api<MyPlace>(`/houses/${houseId}/me`), enabled: !!houseId })
}
