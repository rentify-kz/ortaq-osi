/**
 * Веб-сборка мобильного приложения — инструмент разработки, жильцам она не раздаётся.
 * Защищённого хранилища в браузере нет, поэтому refresh живёт в sessionStorage вкладки
 * и пропадает с её закрытием. В production жилец пользуется только нативным приложением.
 */
const KEY = 'ortaq.refresh'

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export const refreshStore = {
  get: async () => storage()?.getItem(KEY) ?? null,
  set: async (token: string) => storage()?.setItem(KEY, token),
  clear: async () => storage()?.removeItem(KEY),
}
