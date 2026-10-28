import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ImageOff, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

type Download = { url: string; expires_at: string }

/** Ссылка на фото живёт 5 минут: перезапрашиваем чуть раньше, чем она истечёт */
function usePhotoUrl(houseId: string, fileId: string) {
  return useQuery({
    queryKey: ['file', houseId, fileId],
    queryFn: () => api<Download>(`/houses/${houseId}/files/${fileId}/download-url`),
    staleTime: 4 * 60_000,
    refetchInterval: 4 * 60_000,
  })
}

function Thumb({ houseId, fileId, onOpen }: { houseId: string; fileId: string; onOpen: (url: string) => void }) {
  const q = usePhotoUrl(houseId, fileId)
  if (q.isPending) return <span className="block size-24 animate-pulse rounded-[16px] bg-surface-3" />
  if (!q.data) return <span className="grid size-24 place-items-center rounded-[16px] bg-surface-3 text-ink-3"><ImageOff size={18} /></span>
  return (
    <button type="button" onClick={() => onOpen(q.data.url)} aria-label="Открыть фото" className="block size-24 overflow-hidden rounded-[16px] bg-surface-3">
      <img src={q.data.url} alt="" loading="lazy" className="size-full object-cover" />
    </button>
  )
}

/** Миниатюры фото с просмотром на весь экран. Доступ к каждому фото проверяет сервер */
export function Photos({ houseId, ids }: { houseId: string; ids: string[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (ids.length === 0) return null
  return (
    <>
      <div className="flex flex-wrap gap-2">{ids.map((id) => <Thumb key={id} houseId={houseId} fileId={id} onOpen={setOpen} />)}</div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}
            role="dialog" aria-modal="true" aria-label="Фото" className="fixed inset-0 z-50 grid place-items-center bg-ink/85 p-4">
            <img src={open} alt="" className="max-h-full max-w-full rounded-[18px] object-contain" />
            <button type="button" aria-label="Закрыть" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"><X size={20} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
