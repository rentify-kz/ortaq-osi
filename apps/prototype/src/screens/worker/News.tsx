import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Wrench, Megaphone, ChevronDown } from 'lucide-react'
import { AppBar, Scroll, Group } from '../../components/Bits'
import { workerNews } from '../../data/worker'
import { cn, ease } from '../../lib/cn'

const rise = { hide: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }

/** Объявления для всех и для персонала. Адресованные конкретным жильцам работник не видит */
export function WNewsTab({ onRead }: { onRead: (unread: number) => void }) {
  const [list, setList] = useState(workerNews)
  const [open, setOpen] = useState<number | null>(null)

  const toggle = (id: number) => {
    setOpen((o) => (o === id ? null : id))
    const next = list.map((n) => (n.id === id ? { ...n, unread: false } : n))
    setList(next)
    onRead(next.filter((n) => n.unread).length)
  }

  return (
    <>
      <AppBar left={<h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-ink">Объявления</h1>} />
      <Scroll>
        <Group>
          {list.map((n) => {
            const isOpen = open === n.id
            return (
              <motion.button
                key={n.id}
                variants={rise}
                onClick={() => toggle(n.id)}
                aria-expanded={isOpen}
                className="flex w-full flex-col gap-2 rounded-[22px] bg-surface p-4 text-left"
              >
                <span className="flex items-center gap-2">
                  <span className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold',
                    n.staff ? 'bg-brand-50 text-brand-700' : 'bg-surface-2 text-ink-2',
                  )}>
                    {n.staff ? <Wrench size={12} strokeWidth={2.4} /> : <Megaphone size={12} strokeWidth={2.4} />}
                    {n.staff ? 'Для персонала' : 'Всем'}
                  </span>
                  {n.unread && <span className="rounded-full bg-danger px-2 py-0.5 text-[11.5px] font-bold text-white">новое</span>}
                  <span className="ml-auto text-[13px] text-ink-2">{n.when}</span>
                </span>
                <span className="flex items-start gap-2">
                  <span className={cn('flex-1 text-[16px] leading-snug text-ink', n.unread ? 'font-bold' : 'font-semibold')}>{n.title}</span>
                  <ChevronDown size={18} strokeWidth={2.2} className={cn('mt-0.5 shrink-0 text-ink-3 transition-transform', isOpen && 'rotate-180')} />
                </span>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.span
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease }}
                      className="block overflow-hidden text-[15px] leading-relaxed text-ink-2"
                    >
                      {n.text}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            )
          })}
        </Group>
      </Scroll>
    </>
  )
}
