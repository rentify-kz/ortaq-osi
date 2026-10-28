import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { api, ApiError } from './api'
import { uploadPhoto, type Picked } from './upload'

/**
 * Офлайн-очередь работника (docs/07 §7.3): подвалы и техэтажи — места без связи, а именно там
 * делается работа. Отметка выполнения и фото ложатся в очередь на телефоне и уходят сами,
 * когда появится сеть. client_key не даёт серверу принять один отчёт дважды; время
 * выполнения берётся с телефона — когда работу сделали, а не когда нашлась сеть.
 */
export type OutboxItem = {
  key: string
  houseId: string
  taskId: string
  taskTitle: string
  note: string | null
  photos: Picked[]
  /** Уже загруженные фото: при повторе их не грузим заново */
  uploaded: string[]
  completedAt: string
  error?: string
}

const STORAGE_KEY = 'ortaq.outbox.v1'
const RETRY_MS = 30_000

let items: OutboxItem[] = []
let loaded = false
let flushing = false
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())

async function persist() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => undefined)
  emit()
}

async function load() {
  if (loaded) return
  loaded = true
  try {
    items = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '[]') as OutboxItem[]
  } catch {
    items = []
  }
  emit()
}

export async function enqueueCompletion(item: Omit<OutboxItem, 'key' | 'uploaded' | 'completedAt'>) {
  await load()
  items = [...items, { ...item, key: `${item.taskId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, uploaded: [], completedAt: new Date().toISOString() }]
  await persist()
  void flush()
}

/** Отправка очереди. Сетевая ошибка — оставляем и попробуем позже; отказ сервера — показываем работнику */
export async function flush(): Promise<void> {
  await load()
  if (flushing || items.length === 0) return
  flushing = true
  try {
    for (const item of [...items]) {
      try {
        const uploaded = [...item.uploaded]
        for (const photo of item.photos.slice(uploaded.length)) {
          uploaded.push(await uploadPhoto(item.houseId, photo, 'TASK_PHOTO'))
          items = items.map((x) => (x.key === item.key ? { ...x, uploaded } : x))
          await persist()
        }
        await api(`/houses/${item.houseId}/tasks/${item.taskId}/complete`, {
          method: 'POST', body: { note: item.note, photo_file_ids: uploaded, client_key: item.key, completed_at: item.completedAt },
        })
        items = items.filter((x) => x.key !== item.key)
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break
        items = items.map((x) => (x.key === item.key ? { ...x, error: e instanceof Error ? e.message : String(e) } : x))
      }
      await persist()
    }
  } finally {
    flushing = false
  }
}

export function discard(key: string) {
  items = items.filter((x) => x.key !== key)
  void persist()
}

/** Очередь для экрана: «2 действия ждут отправки». Пока есть что слать — пробуем каждые 30 секунд и при возврате в приложение */
export function useOutbox(): OutboxItem[] {
  const snapshot = useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, () => items)
  useEffect(() => {
    void load().then(flush)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void flush())
    const timer = setInterval(() => items.length > 0 && void flush(), RETRY_MS)
    return () => {
      sub.remove()
      clearInterval(timer)
    }
  }, [])
  return snapshot
}
